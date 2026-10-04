import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createComment,
  deleteComment,
  getProductComments,
  getReplies,
  updateComment,
} from "../lib/api";

// paginated top-level comments of a product
export const useProductComments = (productId) => {
  return useInfiniteQuery({
    queryKey: ["comments", productId],
    queryFn: ({ pageParam }) => getProductComments({ productId, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!productId,
  });
};

// paginated replies of a comment (only fetched once the thread is expanded)
export const useReplies = (commentId, enabled) => {
  return useInfiniteQuery({
    queryKey: ["replies", commentId],
    queryFn: ({ pageParam }) => getReplies({ commentId, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!commentId && enabled,
  });
};

// comments AND replies (variables.parentCommentId makes it a reply)
export const useCreateComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createComment,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["comments", variables.productId] }); // counts
      if (variables.parentCommentId) queryClient.invalidateQueries({ queryKey: ["replies"] });
    },
  });
};

export const useUpdateComment = (productId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", productId] });
      queryClient.invalidateQueries({ queryKey: ["replies"] });
    },
  });
};

export const useDeleteComment = (productId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteComment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", productId] });
      queryClient.invalidateQueries({ queryKey: ["replies"] });
    },
  });
};
