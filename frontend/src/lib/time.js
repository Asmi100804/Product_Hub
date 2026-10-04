const isSameDay = (a, b) => a.toDateString() === b.toDateString();

export const formatTime = (date) =>
  new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// inbox: time today, "Yesterday", otherwise the date
export const formatListTime = (date) => {
  const d = new Date(date);
  const now = new Date();
  if (isSameDay(d, now)) return formatTime(d);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
};

// chat day separators
export const formatDayLabel = (date) => {
  const d = new Date(date);
  const now = new Date();
  if (isSameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
};

export const isDifferentDay = (a, b) => !isSameDay(new Date(a), new Date(b));

export const timeAgo = (date) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
};
