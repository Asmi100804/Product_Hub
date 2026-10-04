import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { MessageCircleIcon } from "lucide-react";
import { ChatSocketContext } from "./chatSocketContext";

const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;

const getWsUrl = () => {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;

  const apiUrl = import.meta.env.VITE_API_URL || "/api";
  const url = new URL(apiUrl, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
};

export default function ChatSocketProvider({ children }) {
  const { isSignedIn, userId, getToken } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [status, setStatus] = useState("closed");
  const [toast, setToast] = useState(null);

  const socketRef = useRef(null);
  const authedRef = useRef(false);
  const listenersRef = useRef(new Map());
  const activeConversationRef = useRef(null);
  const getTokenRef = useRef(getToken);
  const userIdRef = useRef(userId);

  useEffect(() => {
    getTokenRef.current = getToken;
    userIdRef.current = userId;
  }, [getToken, userId]);

  const subscribe = useCallback((type, handler) => {
    const map = listenersRef.current;
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add(handler);
    return () => map.get(type)?.delete(handler);
  }, []);

  const send = useCallback((type, data) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !authedRef.current) return false;
    ws.send(JSON.stringify({ type, data }));
    return true;
  }, []);

  const setActiveConversation = useCallback((id) => {
    activeConversationRef.current = id;
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;

    let disposed = false;
    let retries = 0;
    let ws = null;
    let retryTimer = null;
    let heartbeatTimer = null;
    let pongTimer = null;
    let refreshTimer = null;

    const emit = (type, data) => listenersRef.current.get(type)?.forEach((fn) => fn(data));

    const refreshConversations = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(
        () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        250
      );
    };

    const handleBuiltIn = (type, data) => {
      switch (type) {
        case "unread:update":
          queryClient.setQueryData(["unread-count"], { count: data.total });
          if (data.conversationId) refreshConversations();
          break;
        case "message:new": {
          refreshConversations();
          const fromMe = data.senderId === userIdRef.current;
          const viewing = activeConversationRef.current === data.conversationId;
          if (!fromMe && !viewing && !document.hidden) {
            const cached = queryClient.getQueryData(["conversations"]);
            const name = cached?.find((c) => c.id === data.conversationId)?.otherUser?.name;
            setToast({ id: data.id, conversationId: data.conversationId, name, text: data.content });
          }
          break;
        }
        case "message:status":
          refreshConversations();
          break;
        case "notification:new":
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          break;
        default:
      }
    };

    const stopHeartbeat = () => {
      clearInterval(heartbeatTimer);
      clearTimeout(pongTimer);
    };

    const startHeartbeat = (socket) => {
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: "ping" }));
        clearTimeout(pongTimer);
        // no pong => half-open connection, force a reconnect
        pongTimer = setTimeout(() => socket.close(), PONG_TIMEOUT_MS);
      }, HEARTBEAT_MS);
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      clearTimeout(retryTimer);
      if (!navigator.onLine) return; // the "online" listener reconnects immediately
      const delay = Math.min(30_000, 1000 * 2 ** retries) * (0.5 + Math.random() / 2);
      retries += 1;
      retryTimer = setTimeout(connect, delay);
    };

    async function connect() {
      if (disposed) return;
      clearTimeout(retryTimer);

      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }

      setStatus("connecting");
      let token = null;
      try {
        token = await getTokenRef.current();
      } catch {
        token = null;
      }
      if (disposed) return;
      if (!token) return scheduleReconnect();

      const socket = new WebSocket(getWsUrl());
      ws = socket;
      socketRef.current = socket;

      // the token is sent as the first frame (not in the URL, so it never lands in server logs)
      socket.onopen = () => socket.send(JSON.stringify({ type: "auth", data: { token } }));

      socket.onmessage = (event) => {
        let frame;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }
        if (socket !== ws) return;

        if (frame.type === "auth:ok") {
          retries = 0;
          authedRef.current = true;
          setStatus("open");
          startHeartbeat(socket);
          // resync everything that may have changed while we were disconnected
          queryClient.invalidateQueries({ queryKey: ["unread-count"] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          emit("open", {});
          return;
        }
        if (frame.type === "pong") {
          clearTimeout(pongTimer);
          return;
        }
        handleBuiltIn(frame.type, frame.data);
        emit(frame.type, frame.data);
      };

      socket.onerror = () => socket.close();

      socket.onclose = () => {
        stopHeartbeat();
        if (socketRef.current === socket) {
          socketRef.current = null;
          authedRef.current = false;
        }
        if (disposed) return;
        setStatus(navigator.onLine ? "closed" : "offline");
        emit("close", {});
        scheduleReconnect();
      };
    }

    const reconnectNow = () => {
      retries = 0;
      clearTimeout(retryTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        if (authedRef.current || ws.readyState === WebSocket.CONNECTING) return;
      }
      connect();
    };

    const onOnline = () => reconnectNow();
    const onOffline = () => {
      setStatus("offline");
      ws?.close();
    };
    const onVisible = () => {
      if (!document.hidden && !authedRef.current) reconnectNow();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);

    retryTimer = setTimeout(connect, 0);

    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(retryTimer);
      clearTimeout(refreshTimer);
      stopHeartbeat();
      authedRef.current = false;
      socketRef.current = null;
      ws?.close();
    };
  }, [isSignedIn, queryClient]);

  // auto-dismiss the "new message" toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const value = useMemo(
    () => ({ status: isSignedIn ? status : "closed", send, subscribe, setActiveConversation }),
    [isSignedIn, status, send, subscribe, setActiveConversation]
  );

  return (
    <ChatSocketContext.Provider value={value}>
      {children}
      {toast && (
        <div className="toast toast-top toast-end z-50 mt-16">
          <button
            type="button"
            className="alert bg-base-300 shadow-lg max-w-xs text-left gap-2 cursor-pointer"
            onClick={() => {
              navigate(`/messages/${toast.conversationId}`);
              setToast(null);
            }}
          >
            <MessageCircleIcon className="size-5 text-primary shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold truncate">
                {toast.name ? `New message from ${toast.name}` : "New message"}
              </span>
              <span className="block text-xs text-base-content/60 truncate">{toast.text}</span>
            </span>
          </button>
        </div>
      )}
    </ChatSocketContext.Provider>
  );
}
