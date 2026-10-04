import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import * as queries from "../db/queries";
import * as chat from "../db/chatQueries";
import { ChatError, markRead, sendMessage } from "../services/messageService";
import { isUuid, parseLimit } from "../lib/validation";

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof ChatError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

// POST /api/conversations  { recipientId }  -> get or create the conversation with that user
export const startConversation = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { recipientId } = req.body ?? {};
    if (typeof recipientId !== "string" || !recipientId)
      return res.status(400).json({ error: "recipientId is required" });
    if (recipientId === userId)
      return res.status(400).json({ error: "You cannot message yourself" });

    const recipient = await queries.getUserById(recipientId);
    if (!recipient) return res.status(404).json({ error: "User not found" });

    const { id, created } = await chat.getOrCreateConversation(userId, recipientId);
    res.status(created ? 201 : 200).json({
      id,
      otherUser: { id: recipient.id, name: recipient.name, imageUrl: recipient.imageUrl },
    });
  } catch (error) {
    handleError(res, error, "Failed to start conversation");
  }
};

// GET /api/conversations -> inbox
export const listConversations = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    res.status(200).json(await chat.listConversations(userId));
  } catch (error) {
    handleError(res, error, "Failed to load conversations");
  }
};

// GET /api/conversations/unread-count -> { count }  (navbar badge)
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    res.status(200).json({ count: await chat.getTotalUnread(userId) });
  } catch (error) {
    handleError(res, error, "Failed to load unread count");
  }
};

// GET /api/conversations/:id -> conversation header info
export const getConversation = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(404).json({ error: "Conversation not found" });

    const otherUser = await chat.getOtherParticipant(id, userId);
    if (!otherUser) return res.status(404).json({ error: "Conversation not found" });

    res.status(200).json({ id, otherUser });
  } catch (error) {
    handleError(res, error, "Failed to load conversation");
  }
};

// GET /api/conversations/:id/messages?before=<seq>&limit=30
export const getMessages = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!isUuid(id) || !(await chat.isParticipant(id, userId)))
      return res.status(404).json({ error: "Conversation not found" });

    const limit = parseLimit(req.query.limit, 30, 50);
    const before = Number.parseInt(String(req.query.before ?? ""), 10);

    res
      .status(200)
      .json(await chat.getMessagesPage(id, limit, Number.isFinite(before) ? before : undefined));
  } catch (error) {
    handleError(res, error, "Failed to load messages");
  }
};

// POST /api/conversations/:id/messages { content, clientMessageId }
// HTTP fallback for when the WebSocket is down. Idempotent thanks to clientMessageId.
export const postMessage = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { message, duplicate } = await sendMessage({
      senderId: userId,
      conversationId: req.params.id,
      content: req.body?.content,
      clientMessageId: req.body?.clientMessageId,
    });
    res.status(duplicate ? 200 : 201).json(message);
  } catch (error) {
    handleError(res, error, "Failed to send message");
  }
};

// POST /api/conversations/:id/read
export const readConversation = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    res.status(200).json(await markRead(userId, req.params.id));
  } catch (error) {
    handleError(res, error, "Failed to mark conversation as read");
  }
};
