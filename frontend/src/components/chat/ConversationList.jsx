import { Link } from "react-router";
import { AlertCircleIcon, InboxIcon } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useConversations } from "../../hooks/useMessages";
import { formatListTime } from "../../lib/time";
import LoadingSpinner from "../LoadingSpinner";

function ConversationList({ activeId }) {
  const { userId } = useAuth();
  const { data: conversations, isLoading, isError, refetch } = useConversations();

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-4 py-3 border-b border-base-content/10">
        <h2 className="font-bold">Messages</h2>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <LoadingSpinner />
        ) : isError ? (
          <div className="p-6 text-center space-y-3">
            <AlertCircleIcon className="size-8 mx-auto text-error" />
            <p className="text-sm">Couldn&apos;t load your conversations.</p>
            <button className="btn btn-sm btn-primary" onClick={() => refetch()}>
              Try again
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-base-content/50">
            <InboxIcon className="size-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No conversations yet</p>
            <p className="text-xs mt-1">Open a product and tap &quot;Send Message&quot; to start one.</p>
          </div>
        ) : (
          <ul>
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              const mine = c.lastMessage.senderId === userId;
              return (
                <li key={c.id}>
                  <Link
                    to={`/messages/${c.id}`}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-base-200 transition-colors ${
                      isActive ? "bg-base-200" : ""
                    }`}
                  >
                    <div className="avatar shrink-0">
                      <div className="w-10 rounded-full">
                        <img src={c.otherUser.imageUrl} alt={c.otherUser.name} />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-sm ${c.unreadCount ? "font-bold" : "font-medium"}`}
                        >
                          {c.otherUser.name}
                        </span>
                        <time className="text-xs text-base-content/50 shrink-0">
                          {formatListTime(c.lastMessage.createdAt)}
                        </time>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`truncate text-xs ${
                            c.unreadCount ? "text-base-content font-medium" : "text-base-content/60"
                          }`}
                        >
                          {mine && "You: "}
                          {c.lastMessage.content}
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="badge badge-primary badge-sm shrink-0">
                            {c.unreadCount > 99 ? "99+" : c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ConversationList;
