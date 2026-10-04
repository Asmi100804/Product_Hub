import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../lib/api";

export const useNotifications = () => {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    enabled: !!isSignedIn,
    staleTime: 60_000, // kept fresh by the WebSocket `notification:new` event
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
};
