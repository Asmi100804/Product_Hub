import type { Request, Response } from "express";
import * as queries from "../db/queries";
import { getAuth } from "@clerk/express";
import { MAX_COMMENT_LENGTH, isUuid, parseLimit } from "../lib/validation";
import { hub } from "../ws/hub";

const parseContent = (value: unknown): { content?: string; error?: string } => {
  if (typeof value !== "string" || !value.trim()) return { error: "Comment content is required" };
  const content = value.trim();
  if (content.length > MAX_COMMENT_LENGTH)
    return { error: `Comment is too long (max ${MAX_COMMENT_LENGTH} characters)` };
  return { content };
};

// Get top-level comments of a product, paginated (public)
// GET /api/comments/product/:productId?cursor=<commentId>&limit=10
export const getProductComments = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    if (!isUuid(productId)) return res.status(404).json({ error: "Product not found" });

    const cursor = isUuid(req.query.cursor) ? req.query.cursor : undefined;
    const limit = parseLimit(req.query.limit, 10, 30);

    res.status(200).json(await queries.getTopLevelComments(productId, limit, cursor));
  } catch (error) {
    console.error("Error getting comments:", error);
    res.status(500).json({ error: "Failed to get comments" });
  }
};

// Get the replies of a comment, paginated, oldest first (public)
// GET /api/comments/:commentId/replies?cursor=<replyId>&limit=10
export const getCommentReplies = async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    if (!isUuid(commentId)) return res.status(404).json({ error: "Comment not found" });

    const cursor = isUuid(req.query.cursor) ? req.query.cursor : undefined;
    const limit = parseLimit(req.query.limit, 10, 30);

    res.status(200).json(await queries.getReplies(commentId, limit, cursor));
  } catch (error) {
    console.error("Error getting replies:", error);
    res.status(500).json({ error: "Failed to get replies" });
  }
};

// Create comment or reply (protected)
// POST /api/comments/:productId   { content, parentCommentId? }
export const createComment = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { productId } = req.params;
    if (!isUuid(productId)) return res.status(404).json({ error: "Product not found" });

    const { content, error } = parseContent(req.body?.content);
    if (!content) return res.status(400).json({ error });

    // verify product exists
    const product = await queries.getProductById(productId);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // reply handling 
    const { parentCommentId } = req.body ?? {};
    let rootCommentId: string | null = null; // thread root the reply is stored under
    let repliedToUserId: string | null = null; // who gets notified

    if (parentCommentId !== undefined && parentCommentId !== null) {
      if (!isUuid(parentCommentId))
        return res.status(400).json({ error: "Invalid parentCommentId" });

      const parent = await queries.getCommentById(parentCommentId);
      if (!parent || parent.productId !== productId)
        return res.status(404).json({ error: "Comment to reply to not found" });

      // threads are one level deep: replying to a reply attaches to the same thread
      rootCommentId = parent.parentCommentId ?? parent.id;
      repliedToUserId = parent.userId;
    }

    const comment = await queries.createComment({
      content,
      userId,
      productId,
      parentCommentId: rootCommentId,
    });

    // notify the author of the comment that was replied to (never yourself). Repeated replies in
    // the same thread are folded into one unread notification (see upsertReplyNotification).
    if (rootCommentId && repliedToUserId && repliedToUserId !== userId) {
      try {
        const saved = await queries.upsertReplyNotification({
          userId: repliedToUserId,
          actorId: userId,
          productId,
          parentCommentId: rootCommentId,
          commentId: comment.id,
        });
        const dto = await queries.getNotificationDTO(saved.id);
        hub.sendToUser(repliedToUserId, "notification:new", dto);
      } catch (e) {
        console.error("Failed to create reply notification:", e); // never fail the reply itself
      }
    }

    res.status(201).json(await queries.getCommentDTO(comment.id));
  } catch (error) {
    console.error("Error creating comment:", error);
    res.status(500).json({ error: "Failed to create comment" });
  }
};

// Edit comment / reply (protected - owner only)
// PUT /api/comments/:commentId   { content }
export const updateComment = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { commentId } = req.params;
    if (!isUuid(commentId)) return res.status(404).json({ error: "Comment not found" });

    const { content, error } = parseContent(req.body?.content);
    if (!content) return res.status(400).json({ error });

    const existingComment = await queries.getCommentById(commentId);
    if (!existingComment) return res.status(404).json({ error: "Comment not found" });

    if (existingComment.userId !== userId) {
      return res.status(403).json({ error: "You can only edit your own comments" });
    }

    await queries.updateCommentContent(commentId, content);
    res.status(200).json(await queries.getCommentDTO(commentId));
  } catch (error) {
    console.error("Error updating comment:", error);
    res.status(500).json({ error: "Failed to update comment" });
  }
};

// Delete comment (protected - owner only)
export const deleteComment = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { commentId } = req.params;
    if (!isUuid(commentId)) return res.status(404).json({ error: "Comment not found" });

    // check if comment exists and belongs to user
    const existingComment = await queries.getCommentById(commentId);
    if (!existingComment) return res.status(404).json({ error: "Comment not found" });

    if (existingComment.userId !== userId) {
      return res.status(403).json({ error: "You can only delete your own comments" });
    }

    await queries.deleteComment(commentId);
    res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ error: "Failed to delete comment" });
  }
};
