import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import {
  getConversation,
  getConversations,
  getUnreadCount,
  startConversation,
} from "../lib/api";

// total unread messages => navbar badge. Kept live by WebSocket `unread:update` events
// (ChatSocketProvider writes straight into this query's cache).
export const useUnreadCount = () => {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["unread-count"],
    queryFn: getUnreadCount,
    enabled: !!isSignedIn,
    select: (data) => data.count,
    staleTime: 60_000,
  });
};

export const useConversations = () => {
  return useQuery({ queryKey: ["conversations"], queryFn: getConversations });
};

export const useConversation = (conversationId) => {
  return useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => getConversation(conversationId),
    enabled: !!conversationId,
    retry: false,
  });
};

// get-or-create the conversation with another user (the server reuses an existing one)
export const useStartConversation = () => {
  return useMutation({ mutationFn: startConversation });
};
