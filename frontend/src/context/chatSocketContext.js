import { createContext, useContext } from "react";

export const ChatSocketContext = createContext(null);

// { status: "connecting" | "open" | "closed" | "offline",
//   send(type, data) -> boolean   (false when the socket is not open),
//   subscribe(type, handler) -> unsubscribe,
//   setActiveConversation(id | null) }
export const useChatSocket = () => {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) throw new Error("useChatSocket must be used inside <ChatSocketProvider>");
  return ctx;
};
