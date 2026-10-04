import { Router } from "express";
import { requireAuth } from "@clerk/express";
import * as commentController from "../controllers/commentController";
import { commentLimiter } from "../middleware/rateLimit";

const router = Router();

// GET /api/comments/product/:productId - Paginated top-level comments with reply counts (public)
router.get("/product/:productId", commentController.getProductComments);

// GET /api/comments/:commentId/replies - Paginated replies of a comment (public)
router.get("/:commentId/replies", commentController.getCommentReplies);

// POST /api/comments/:productId - Add comment (or reply, via body.parentCommentId) (protected)
router.post("/:productId", requireAuth(), commentLimiter.middleware, commentController.createComment);

// PUT /api/comments/:commentId - Edit comment/reply (protected - owner only)
router.put("/:commentId", requireAuth(), commentLimiter.middleware, commentController.updateComment);

// DELETE /api/comments/:commentId - Delete comment/reply (protected - owner only)
router.delete("/:commentId", requireAuth(), commentController.deleteComment);

export default router;
