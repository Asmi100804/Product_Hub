import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  ReplyIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  useCreateComment,
  useDeleteComment,
  useReplies,
  useUpdateComment,
} from "../hooks/useComments";
import { timeAgo } from "../lib/time";

const errorMessage = (err) => err?.response?.data?.error || "Something went wrong. Try again.";

// a single comment OR reply: bubble + actions (reply / edit / delete) + inline edit form
function CommentBubble({ comment, productId, currentUserId, isSignedIn, onReply }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const updateComment = useUpdateComment(productId);
  const deleteComment = useDeleteComment(productId);

  const isOwner = currentUserId === comment.userId;

  const saveEdit = (e) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || content === comment.content) return setEditing(false);
    updateComment.mutate({ commentId: comment.id, content }, { onSuccess: () => setEditing(false) });
  };

  const handleDelete = () => {
    const extra = comment.replyCount > 0 ? ` and its ${comment.replyCount} repl${comment.replyCount > 1 ? "ies" : "y"}` : "";
    if (confirm(`Delete this comment${extra}?`)) deleteComment.mutate({ commentId: comment.id });
  };

  return (
    <div className="chat chat-start">
      <div className="chat-image avatar">
        <div className="w-8 rounded-full">
          <img src={comment.user?.imageUrl} alt={comment.user?.name} />
        </div>
      </div>

      <div className="chat-header text-xs opacity-70 mb-2">
        {comment.user?.name}
        <time className="ml-2 text-xs opacity-50" title={new Date(comment.createdAt).toLocaleString()}>
          {timeAgo(comment.createdAt)}
        </time>
        {comment.editedAt && <span className="ml-1 text-xs opacity-50">(edited)</span>}
      </div>

      {editing ? (
        <form onSubmit={saveEdit} className="chat-bubble chat-bubble-neutral flex flex-col gap-2 w-72 max-w-full">
          <textarea
            className="textarea textarea-bordered textarea-sm w-full bg-base-200 text-base-content"
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={updateComment.isPending}
            autoFocus
          />
          {updateComment.isError && (
            <p className="text-xs text-error">{errorMessage(updateComment.error)}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => {
                setEditing(false);
                setDraft(comment.content);
                updateComment.reset();
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-xs"
              disabled={updateComment.isPending || !draft.trim()}
            >
              {updateComment.isPending ? <span className="loading loading-spinner loading-xs" /> : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div className="chat-bubble chat-bubble-neutral text-sm whitespace-pre-wrap break-words">
          {comment.content}
        </div>
      )}

      <div className="chat-footer flex items-center gap-1 mt-1">
        {isSignedIn && !editing && (
          <button className="btn btn-ghost btn-xs gap-1" onClick={() => onReply(comment)}>
            <ReplyIcon className="size-3" /> Reply
          </button>
        )}
        {isOwner && !editing && (
          <>
            <button
              className="btn btn-ghost btn-xs gap-1"
              onClick={() => {
                setDraft(comment.content);
                setEditing(true);
              }}
              aria-label="Edit"
            >
              <PencilIcon className="size-3" />
            </button>
            <button
              onClick={handleDelete}
              className="btn btn-ghost btn-xs text-error"
              disabled={deleteComment.isPending}
              aria-label="Delete"
            >
              {deleteComment.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Trash2Icon className="size-3" />
              )}
            </button>
          </>
        )}
        {deleteComment.isError && (
          <span className="text-xs text-error">{errorMessage(deleteComment.error)}</span>
        )}
      </div>
    </div>
  );
}

// inline reply composer shown under a thread
function ReplyForm({ productId, target, rootCommentId, onDone }) {
  // replying to a reply pre-fills an @mention; the server keeps it in the same thread
  const [content, setContent] = useState(
    target.id === rootCommentId ? "" : `@${target.user?.name ?? ""} `
  );
  const createComment = useCreateComment();

  const submit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    createComment.mutate(
      { productId, content, parentCommentId: target.id },
      { onSuccess: () => onDone(true) }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-1 mt-2">
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          maxLength={2000}
          placeholder={`Reply to ${target.user?.name ?? "comment"}…`}
          className="input input-bordered input-sm flex-1 bg-base-200"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={createComment.isPending}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm btn-square"
          disabled={createComment.isPending || !content.trim()}
          aria-label="Send reply"
        >
          {createComment.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <SendIcon className="size-4" />
          )}
        </button>
        <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={() => onDone(false)} aria-label="Cancel reply">
          <XIcon className="size-4" />
        </button>
      </div>
      {createComment.isError && <p className="text-xs text-error">{errorMessage(createComment.error)}</p>}
    </form>
  );
}

// top-level comment + its (lazy loaded, paginated) replies + reply form
function CommentThread({ comment, productId, currentUserId }) {
  const { isSignedIn } = useAuth();
  const [showReplies, setShowReplies] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);

  const replies = useReplies(comment.id, showReplies);
  const replyList = replies.data?.pages.flatMap((p) => p.replies) ?? [];

  const openReply = (target) => {
    setReplyTarget(target);
    setShowReplies(true);
  };

  return (
    <div>
      <CommentBubble
        comment={comment}
        productId={productId}
        currentUserId={currentUserId}
        isSignedIn={isSignedIn}
        onReply={openReply}
      />

      {comment.replyCount > 0 && (
        <button
          className="btn btn-ghost btn-xs gap-1 ml-10 text-primary"
          onClick={() => setShowReplies((v) => !v)}
        >
          {showReplies ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
          {showReplies
            ? "Hide replies"
            : `View ${comment.replyCount} repl${comment.replyCount > 1 ? "ies" : "y"}`}
        </button>
      )}

      {(showReplies || replyTarget) && (
        <div className="ml-6 sm:ml-10 pl-3 border-l-2 border-base-content/10 space-y-1">
          {showReplies && replies.isLoading && (
            <div className="py-2">
              <span className="loading loading-spinner loading-xs" />
            </div>
          )}

          {showReplies && replies.isError && (
            <div className="flex items-center gap-2 text-xs text-error py-2">
              <AlertCircleIcon className="size-4" /> Couldn&apos;t load replies.
              <button className="link" onClick={() => replies.refetch()}>
                Retry
              </button>
            </div>
          )}

          {showReplies &&
            replyList.map((reply) => (
              <CommentBubble
                key={reply.id}
                comment={reply}
                productId={productId}
                currentUserId={currentUserId}
                isSignedIn={isSignedIn}
                onReply={openReply}
              />
            ))}

          {showReplies && replies.hasNextPage && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => replies.fetchNextPage()}
              disabled={replies.isFetchingNextPage}
            >
              {replies.isFetchingNextPage ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Load more replies"
              )}
            </button>
          )}

          {replyTarget && (
            <ReplyForm
              key={replyTarget.id}
              productId={productId}
              target={replyTarget}
              rootCommentId={comment.id}
              onDone={(posted) => {
                setReplyTarget(null);
                if (posted) setShowReplies(true);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default CommentThread;
