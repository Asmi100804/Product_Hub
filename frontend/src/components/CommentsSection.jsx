import { useState } from "react";
import { useAuth, SignInButton } from "@clerk/clerk-react";
import { useCreateComment, useProductComments } from "../hooks/useComments";
import { SendIcon, MessageSquareIcon, LogInIcon, AlertCircleIcon } from "lucide-react";
import CommentThread from "./CommentThread";

function CommentsSection({ productId, currentUserId }) {
  const { isSignedIn } = useAuth();
  const [content, setContent] = useState("");
  const createComment = useCreateComment();
  const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useProductComments(productId);

  const comments = data?.pages.flatMap((p) => p.comments) ?? [];
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    createComment.mutate({ productId, content }, { onSuccess: () => setContent("") });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquareIcon className="size-5 text-primary" />
        <h3 className="font-bold">Comments</h3>
        <span className="badge badge-neutral badge-sm">{totalCount}</span>
      </div>

      {isSignedIn ? (
        <form onSubmit={handleSubmit} className="space-y-1">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add a comment..."
              maxLength={2000}
              className="input input-bordered input-sm flex-1 bg-base-200"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={createComment.isPending}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm btn-square"
              disabled={createComment.isPending || !content.trim()}
            >
              {createComment.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <SendIcon className="size-4" />
              )}
            </button>
          </div>
          {createComment.isError && !createComment.variables?.parentCommentId && (
            <p className="text-xs text-error">
              {createComment.error?.response?.data?.error || "Couldn't post your comment."}
            </p>
          )}
        </form>
      ) : (
        <div className="flex items-center justify-between bg-base-200 rounded-lg p-3">
          <span className="text-sm text-base-content/60">Sign in to join the conversation</span>
          <SignInButton mode="modal">
            <button className="btn btn-primary btn-sm gap-1">
              <LogInIcon className="size-4" />
              Sign In
            </button>
          </SignInButton>
        </div>
      )}

      <div className="space-y-3 max-h-[32rem] overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : isError ? (
          <div className="text-center py-8 space-y-2">
            <AlertCircleIcon className="size-8 mx-auto text-error" />
            <p className="text-sm">Couldn&apos;t load comments.</p>
            <button className="btn btn-sm btn-primary" onClick={() => refetch()}>
              Try again
            </button>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-base-content/50">
            <MessageSquareIcon className="size-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No comments yet. Be first!</p>
          </div>
        ) : (
          <>
            {comments.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                productId={productId}
                currentUserId={currentUserId}
              />
            ))}
            {hasNextPage && (
              <div className="text-center">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    "Load more comments"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default CommentsSection;
