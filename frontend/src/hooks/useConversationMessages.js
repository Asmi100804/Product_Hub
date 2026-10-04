import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getMessages, markConversationRead, postMessage } from "../lib/api";
import { useChatSocket } from "../context/chatSocketContext";

const ACK_TIMEOUT_MS = 6000; // no WebSocket ack within this => fall back to HTTP (idempotent)

// Merge messages coming from history / WebSocket / HTTP into the list WITHOUT duplicating:
// a message is identified by its server id, or by clientMessageId (optimistic -> confirmed).
const mergeMessages = (prev, incoming) => {
  const next = prev.slice();
  for (const msg of incoming) {
    const idx = next.findIndex(
      (m) =>
        m.id === msg.id ||
        (m.clientMessageId === msg.clientMessageId && m.senderId === msg.senderId)
    );
    if (idx === -1) {
      next.push(msg);
    } else {
      const old = next[idx];
      // status can only move forward (a late `message:new` must not undo "read")
      next[idx] = {
        ...old,
        ...msg,
        deliveredAt: msg.deliveredAt ?? old.deliveredAt,
        readAt: msg.readAt ?? old.readAt,
        _state: undefined,
        _error: undefined,
      };
    }
  }
  return next;
};

// All state of ONE open chat: history pagination, realtime events, optimistic sending,
// reconnect resync and read receipts. Mount it with key={conversationId}.
export default function useConversationMessages(conversationId, currentUserId) {
  const queryClient = useQueryClient();
  const { status, send: socketSend, subscribe, setActiveConversation } = useChatSocket();

  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);

  const itemsRef = useRef(items);
  const ackTimers = useRef(new Map());
  const lastReadSentRef = useRef(0);
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ---- helpers -------
  const upsert = useCallback((msgs) => {
    const list = Array.isArray(msgs) ? msgs : [msgs];
    list.forEach((m) => {
      clearTimeout(ackTimers.current.get(m.clientMessageId));
      ackTimers.current.delete(m.clientMessageId);
    });
    setItems((prev) => mergeMessages(prev, list));
  }, []);

  const patchPending = useCallback((clientMessageId, patch) => {
    setItems((prev) =>
      prev.map((m) => (m.clientMessageId === clientMessageId && m.seq == null ? { ...m, ...patch } : m))
    );
  }, []);

  // ---- loading --------
  const loadLatest = useCallback(
    async (initial) => {
      try {
        const page = await getMessages({ conversationId });
        upsert(page.messages);
        if (initial) setNextCursor(page.nextCursor);
        setError(null);
      } catch (err) {
        if (initial) setError(err);
      } finally {
        if (initial) setLoading(false);
      }
    },
    [conversationId, upsert]
  );

  useEffect(() => {
    loadLatest(true);
  }, [loadLatest]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    loadLatest(true);
  }, [loadLatest]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const page = await getMessages({ conversationId, before: nextCursor });
      upsert(page.messages);
      setNextCursor(page.nextCursor);
    } catch {
      setOlderError(true);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, nextCursor, loadingOlder, upsert]);

  // ---- sending (optimistic) ----------
  const sendViaHttp = useCallback(
    async (item) => {
      try {
        const saved = await postMessage({
          conversationId,
          content: item.content,
          clientMessageId: item.clientMessageId,
        });
        upsert(saved);
      } catch (err) {
        if (!err.response) {
          // network problem: keep it queued, it is re-sent when the connection is back
          patchPending(item.clientMessageId, { _state: "queued" });
        } else {
          patchPending(item.clientMessageId, {
            _state: "failed",
            _error: err.response.data?.error || "Failed to send",
          });
        }
      }
    },
    [conversationId, upsert, patchPending]
  );

  const dispatchSend = useCallback(
    (item) => {
      clearTimeout(ackTimers.current.get(item.clientMessageId));
      const sentOverSocket = socketSend("message:send", {
        conversationId,
        content: item.content,
        clientMessageId: item.clientMessageId,
      });
      if (sentOverSocket) {
        ackTimers.current.set(
          item.clientMessageId,
          setTimeout(() => sendViaHttp(item), ACK_TIMEOUT_MS)
        );
      } else {
        sendViaHttp(item); // WebSocket down: persist through the REST API instead
      }
    },
    [conversationId, socketSend, sendViaHttp]
  );

  const send = useCallback(
    (text) => {
      const content = text.trim();
      if (!content) return;
      const clientMessageId = crypto.randomUUID();
      const item = {
        id: `tmp-${clientMessageId}`,
        seq: null,
        conversationId,
        senderId: currentUserId,
        content,
        clientMessageId,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
        _state: "sending",
      };
      setItems((prev) => [...prev, item]);
      dispatchSend(item);
    },
    [conversationId, currentUserId, dispatchSend]
  );

  const retry = useCallback(
    (clientMessageId) => {
      const item = itemsRef.current.find((m) => m.clientMessageId === clientMessageId);
      if (!item) return;
      patchPending(clientMessageId, { _state: "sending", _error: undefined });
      dispatchSend(item);
    },
    [dispatchSend, patchPending]
  );

  // ---- read receipts ----------------
  const maybeMarkRead = useCallback(async () => {
    if (document.hidden) return; // only count as read while the user can actually see it
    const maxIncoming = itemsRef.current
      .filter((m) => m.senderId !== currentUserId && m.seq != null)
      .reduce((max, m) => Math.max(max, m.seq), 0);
    if (maxIncoming <= lastReadSentRef.current) return;

    lastReadSentRef.current = maxIncoming;
    if (socketSend("conversation:read", { conversationId })) return;

    try {
      const res = await markConversationRead(conversationId);
      queryClient.setQueryData(["unread-count"], { count: res.total });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      lastReadSentRef.current = 0; // try again on the next change
    }
  }, [conversationId, currentUserId, socketSend, queryClient]);

  useEffect(() => {
    if (!loading) maybeMarkRead();
  }, [items, loading, maybeMarkRead]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) maybeMarkRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [maybeMarkRead]);

  // ---- realtime events ---------------
  useEffect(() => {
    setActiveConversation(conversationId);
    const offs = [
      subscribe("message:new", (msg) => {
        if (msg.conversationId === conversationId) upsert(msg);
      }),
      subscribe("message:ack", ({ message }) => {
        if (message.conversationId === conversationId) upsert(message);
      }),
      subscribe("message:error", ({ clientMessageId, message }) => {
        clearTimeout(ackTimers.current.get(clientMessageId));
        patchPending(clientMessageId, { _state: "failed", _error: message });
      }),
      subscribe("message:status", (s) => {
        if (s.conversationId !== conversationId) return;
        setItems((prev) =>
          prev.map((m) => {
            if (m.senderId !== currentUserId || m.seq == null || m.seq > s.upToSeq) return m;
            return {
              ...m,
              deliveredAt: m.deliveredAt ?? s.at,
              readAt: s.status === "read" ? (m.readAt ?? s.at) : m.readAt,
            };
          })
        );
      }),
    ];
    const timers = ackTimers.current;
    return () => {
      offs.forEach((off) => off());
      setActiveConversation(null);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [conversationId, currentUserId, subscribe, setActiveConversation, upsert, patchPending]);

  // ---- reconnect handling --------------
  useEffect(() => {
    if (status !== "open") {
      wasDisconnectedRef.current = true;
      return;
    }
    if (!wasDisconnectedRef.current) return;
    wasDisconnectedRef.current = false;

    // 1) catch up on anything missed while offline (merge => no duplicates)
    loadLatest(false);
    // 2) re-send messages that never got confirmed (same clientMessageId => server dedupes)
    itemsRef.current
      .filter((m) => m.seq == null && (m._state === "sending" || m._state === "queued"))
      .forEach((m) => dispatchSend(m));
  }, [status, loadLatest, dispatchSend]);

  // ---- derived list: confirmed messages by seq, then still-pending ones in send order ------
  const messages = useMemo(() => {
    const confirmed = items.filter((m) => m.seq != null).sort((a, b) => a.seq - b.seq);
    const pending = items.filter((m) => m.seq == null);
    return [...confirmed, ...pending];
  }, [items]);

  return {
    messages,
    loading,
    error,
    reload,
    hasMore: !!nextCursor,
    loadingOlder,
    olderError,
    loadOlder,
    send,
    retry,
    connectionStatus: status,
  };
}
