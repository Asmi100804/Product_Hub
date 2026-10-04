import { Fragment, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  MessageCircleIcon,
  RotateCcwIcon,
  SendIcon,
  WifiOffIcon,
} from "lucide-react";
import useConversationMessages from "../../hooks/useConversationMessages";
import { useConversation } from "../../hooks/useMessages";
import { formatDayLabel, formatTime, isDifferentDay } from "../../lib/time";
import LoadingSpinner from "../LoadingSpinner";

const MAX_LENGTH = 2000;

function MessageStatus({ message, onRetry }) {
  if (message._state === "failed") {
    return (
      <button
        type="button"
        onClick={() => onRetry(message.clientMessageId)}
        className="inline-flex items-center gap-1 text-error"
        title={message._error}
      >
        <AlertCircleIcon className="size-3" /> Not sent · Retry <RotateCcwIcon className="size-3" />
      </button>
    );
  }
  if (message._state === "queued") {
    return (
      <span className="inline-flex items-center gap-1">
        <WifiOffIcon className="size-3" /> Waiting for connection…
      </span>
    );
  }
  if (message._state === "sending") {
    return (
      <span className="inline-flex items-center gap-1">
        <ClockIcon className="size-3" /> Sending…
      </span>
    );
  }
  if (message.readAt) {
    return (
      <span className="inline-flex items-center gap-1 text-info" title="Read">
        <CheckCheckIcon className="size-3.5" /> Read
      </span>
    );
  }
  if (message.deliveredAt) {
    return (
      <span className="inline-flex items-center gap-1" title="Delivered">
        <CheckCheckIcon className="size-3.5" /> Delivered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" title="Sent">
      <CheckIcon className="size-3.5" /> Sent
    </span>
  );
}

function ChatWindow({ conversationId }) {
  const { userId } = useAuth();
  const { data: conversation, isLoading: headerLoading, isError: headerError } =
    useConversation(conversationId);
  const {
    messages,
    loading,
    error,
    reload,
    hasMore,
    loadingOlder,
    olderError,
    loadOlder,
    send,
    retry,
    connectionStatus,
  } = useConversationMessages(conversationId, userId);

  const [text, setText] = useState("");
  const [showJump, setShowJump] = useState(false);

  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const anchorRef = useRef(null); // scroll anchor while older messages are prepended
  const didInitialScrollRef = useRef(false);
  const lastMessageIdRef = useRef(null);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const loadOlderKeepingPosition = useCallback(async () => {
    const el = scrollRef.current;
    if (el) anchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
    await loadOlder();
    // if nothing was prepended (error), don't leave a stale anchor around
    setTimeout(() => (anchorRef.current = null), 0);
  }, [loadOlder]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottomRef.current = nearBottom;
    if (nearBottom) setShowJump(false);
    // infinite scroll: reaching the top loads older history
    if (el.scrollTop < 80 && hasMore && !loadingOlder && !olderError) loadOlderKeepingPosition();
  };

  // runs after every render that changed the list, before paint => no visible jumping
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;

    if (anchorRef.current) {
      // older page prepended: keep the same message under the user's eyes
      el.scrollTop = anchorRef.current.top + (el.scrollHeight - anchorRef.current.height);
      anchorRef.current = null;
      return;
    }

    const last = messages[messages.length - 1];
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      lastMessageIdRef.current = last?.clientMessageId ?? null;
      scrollToBottom();
      return;
    }

    if (last && last.clientMessageId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = last.clientMessageId;
      if (last.senderId === userId || nearBottomRef.current) scrollToBottom("smooth");
      else queueMicrotask(() => setShowJump(true)); // user is reading older messages
    }
  }, [messages, loading, userId, scrollToBottom]);

  const submit = () => {
    if (!text.trim()) return;
    send(text);
    setText("");
    nearBottomRef.current = true;
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const other = conversation?.otherUser;

  if (headerError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircleIcon className="size-10 text-error" />
        <p className="font-medium">Conversation not found</p>
        <Link to="/messages" className="btn btn-primary btn-sm">
          Back to messages
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* header */}
      <div className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-base-content/10">
        <Link to="/messages" className="btn btn-ghost btn-sm btn-square md:hidden" aria-label="Back">
          <ArrowLeftIcon className="size-4" />
        </Link>
        {headerLoading || !other ? (
          <div className="skeleton h-8 w-40" />
        ) : (
          <>
            <div className="avatar">
              <div className="w-8 rounded-full">
                <img src={other.imageUrl} alt={other.name} />
              </div>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{other.name}</p>
              <p className="text-xs text-base-content/50">
                {connectionStatus === "open"
                  ? "Connected"
                  : connectionStatus === "offline"
                    ? "Offline"
                    : "Connecting…"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0 px-3 sm:px-4 py-3 relative"
      >
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <AlertCircleIcon className="size-8 text-error" />
            <p className="text-sm">Couldn&apos;t load messages.</p>
            <button className="btn btn-primary btn-sm" onClick={reload}>
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-base-content/50">
            <MessageCircleIcon className="size-10 mb-2 opacity-30" />
            <p className="text-sm">No messages yet. Say hello{other ? ` to ${other.name}` : ""}!</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center pb-2">
                {loadingOlder ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <button className="btn btn-ghost btn-xs" onClick={loadOlderKeepingPosition}>
                    {olderError ? "Couldn't load — retry" : "Load older messages"}
                  </button>
                )}
              </div>
            )}

            {messages.map((m, i) => {
              const mine = m.senderId === userId;
              const prev = messages[i - 1];
              const newDay = !prev || isDifferentDay(prev.createdAt, m.createdAt);
              return (
                <Fragment key={m.clientMessageId}>
                  {newDay && (
                    <div className="text-center my-3">
                      <span className="badge badge-ghost badge-sm">{formatDayLabel(m.createdAt)}</span>
                    </div>
                  )}
                  <div className={`chat ${mine ? "chat-end" : "chat-start"}`}>
                    <div
                      className={`chat-bubble text-sm whitespace-pre-wrap break-words max-w-[85%] sm:max-w-[75%] ${
                        mine ? "chat-bubble-primary" : "chat-bubble-neutral"
                      } ${m._state === "failed" ? "opacity-60" : ""}`}
                    >
                      {m.content}
                    </div>
                    <div className="chat-footer text-xs opacity-60 flex items-center gap-2 mt-0.5">
                      <time>{formatTime(m.createdAt)}</time>
                      {mine && <MessageStatus message={m} onRetry={retry} />}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </>
        )}
      </div>

      {showJump && (
        <div className="relative">
          <button
            className="btn btn-primary btn-xs gap-1 absolute -top-9 left-1/2 -translate-x-1/2 shadow-lg"
            onClick={() => {
              scrollToBottom("smooth");
              setShowJump(false);
            }}
          >
            <ArrowDownIcon className="size-3" /> New messages
          </button>
        </div>
      )}

      {/* connection banner */}
      {connectionStatus !== "open" && (
        <div className="px-4 py-1.5 text-xs bg-warning/20 text-warning-content flex items-center gap-2">
          <WifiOffIcon className="size-3.5 shrink-0" />
          {connectionStatus === "offline"
            ? "You're offline. Messages will be sent when you're back online."
            : "Reconnecting… messages are still saved and will be delivered."}
        </div>
      )}

      {/* composer */}
      <div className="p-3 border-t border-base-content/10 flex items-end gap-2">
        <textarea
          rows={1}
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          className="textarea textarea-bordered bg-base-200 flex-1 min-h-10 max-h-32 resize-none leading-snug"
          aria-label="Message"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || loading || !!error}
          className="btn btn-primary btn-square"
          aria-label="Send message"
        >
          <SendIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

export default ChatWindow;
