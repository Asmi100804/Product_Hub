import { Router } from "express";
import { requireAuth } from "@clerk/express";
import * as controller from "../controllers/conversationController";
import { messageLimiter, startConversationLimiter } from "../middleware/rateLimit";

const router = Router();

// every conversation route requires authentication; participant checks happen in the controllers
router.use(requireAuth());

// GET  /api/conversations                  - inbox (conversations with last message + unread count)
router.get("/", controller.listConversations);
// POST /api/conversations                  - start (or reuse) a conversation with { recipientId }
router.post("/", startConversationLimiter.middleware, controller.startConversation);
// GET  /api/conversations/unread-count     - total unread messages (navbar badge)
router.get("/unread-count", controller.getUnreadCount);
// GET  /api/conversations/:id              - conversation header (other user)
router.get("/:id", controller.getConversation);
// GET  /api/conversations/:id/messages     - paginated history (?before=<seq>&limit=)
router.get("/:id/messages", controller.getMessages);
// POST /api/conversations/:id/messages     - send message over HTTP (WebSocket fallback)
router.post("/:id/messages", messageLimiter.middleware, controller.postMessage);
// POST /api/conversations/:id/read         - mark conversation as read
router.post("/:id/read", controller.readConversation);

export default router;
