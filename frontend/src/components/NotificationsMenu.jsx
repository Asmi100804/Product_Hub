import { useNavigate } from "react-router";
import { BellIcon, ReplyIcon } from "lucide-react";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "../hooks/useNotifications";
import { timeAgo } from "../lib/time";

// bell in the navbar: comment-reply notifications (DMs are shown by the message icon instead)
function NotificationsMenu() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unread = data?.unreadCount ?? 0;

  const open = (n) => {
    document.activeElement?.blur(); // closes the dropdown
    if (!n.readAt) markRead.mutate(n.id);
    if (n.productId) navigate(`/product/${n.productId}`);
  };

  return (
    <div className="dropdown dropdown-end">
      <div
        tabIndex={0}
        role="button"
        className="btn btn-ghost btn-sm btn-square indicator"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
      >
        <BellIcon className="size-4" />
        {unread > 0 && (
          <span className="indicator-item badge badge-secondary badge-xs">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </div>

      <div
        tabIndex={0}
        className="dropdown-content z-30 mt-3 w-80 max-w-[90vw] rounded-box overflow-hidden border border-base-content/20 bg-base-300 shadow-xl"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-base-content/10">
          <span className="font-semibold text-sm">Notifications</span>
          {unread > 0 && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center">
              <span className="loading loading-spinner loading-sm" />
            </div>
          ) : isError ? (
            <div className="p-4 text-center text-sm">
              Couldn&apos;t load notifications.{" "}
              <button className="link" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : data.notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-base-content/50">No notifications yet</p>
          ) : (
            data.notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-base-200 ${
                  n.readAt ? "" : "bg-base-200/60"
                }`}
              >
                <div className="avatar shrink-0">
                  <div className="w-8 h-8 rounded-full">
                    <img src={n.actor.imageUrl} alt={n.actor.name} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <ReplyIcon className="size-3 inline mr-1 text-primary" />
                    <span className="font-semibold">{n.actor.name}</span> replied to your comment
                    {n.count > 1 && (
                      <span className="text-base-content/60"> · {n.count} new replies</span>
                    )}
                  </p>
                  {n.productTitle && (
                    <p className="text-xs text-base-content/60 truncate">on {n.productTitle}</p>
                  )}
                  <p className="text-xs text-base-content/40">{timeAgo(n.updatedAt)}</p>
                </div>
                {!n.readAt && <span className="size-2 rounded-full bg-primary mt-2 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationsMenu;
