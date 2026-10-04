import type { WebSocket } from "ws";
import * as chat from "../db/chatQueries";
import { hub } from "../ws/hub";
import { MAX_MESSAGE_LENGTH, isClientMessageId, isUuid } from "../lib/validation";

export class ChatError extends Error {
  constructor(
    public code: "validation" | "not_found" | "forbidden" | "rate_limited",
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// pushes the recipient's fresh unread numbers to all of their open tabs
export const pushUnread = async (userId: string, conversationId: string) => {
  const [unread, total] = await Promise.all([
    chat.getUnreadForConversation(userId, conversationId),
    chat.getTotalUnread(userId),
  ]);
  hub.sendToUser(userId, "unread:update", { conversationId, unread, total });
  return { unread, total };
};

export const sendMessage = async (params: {
  senderId: string;
  conversationId: unknown;
  content: unknown;
  clientMessageId: unknown;
  originSocket?: WebSocket; // set when sent over WebSocket
}) => {
  const { senderId, conversationId, originSocket } = params;

  if (!isUuid(conversationId)) throw new ChatError("validation", "Invalid conversation id", 400);
  if (!isClientMessageId(params.clientMessageId))
    throw new ChatError("validation", "Invalid clientMessageId", 400);
  if (typeof params.content !== "string") throw new ChatError("validation", "Message is required", 400);

  const content = params.content.trim();
  if (!content) throw new ChatError("validation", "Message cannot be empty", 400);
  if (content.length > MAX_MESSAGE_LENGTH)
    throw new ChatError("validation", `Message is too long (max ${MAX_MESSAGE_LENGTH})`, 400);

  // authorization: the sender must be a participant (404 so conversation ids can't be probed)
  const recipient = await chat.getOtherParticipant(conversationId, senderId);
  if (!recipient) throw new ChatError("not_found", "Conversation not found", 404);

  const { message, duplicate } = await chat.insertMessage({
    conversationId,
    senderId,
    content,
    clientMessageId: params.clientMessageId,
    deliveredAt: hub.isOnline(recipient.id) ? new Date() : null,
  });

  if (!duplicate) {
    // all of the sender's other tabs + all of the recipient's tabs
    hub.sendToUser(senderId, "message:new", message, originSocket);
    hub.sendToUser(recipient.id, "message:new", message);
    void pushUnread(recipient.id, conversationId).catch((e) =>
      console.error("pushUnread failed:", e)
    );
  }

  return { message, duplicate };
};

export const markRead = async (userId: string, conversationId: unknown) => {
  if (!isUuid(conversationId)) throw new ChatError("validation", "Invalid conversation id", 400);

  const other = await chat.getOtherParticipant(conversationId, userId);
  if (!other) throw new ChatError("not_found", "Conversation not found", 404);

  const { upToSeq, readCount, readAt } = await chat.markConversationRead(userId, conversationId);

  // tell the sender their messages were read (blue ticks)
  if (readCount > 0) {
    hub.sendToUser(other.id, "message:status", {
      conversationId,
      status: "read",
      upToSeq,
      at: readAt,
    });
  }

  const total = await chat.getTotalUnread(userId);
  // keeps the reader's other tabs in sync as well
  hub.sendToUser(userId, "unread:update", { conversationId, unread: 0, total });
  return { total };
};

// called when a user connects: flag pending messages as delivered and notify the senders
export const deliverPendingMessages = async (userId: string) => {
  const delivered = await chat.markDeliveredForUser(userId);
  for (const d of delivered) {
    hub.sendToUser(d.senderId, "message:status", {
      conversationId: d.conversationId,
      status: "delivered",
      upToSeq: d.upToSeq,
      at: new Date(),
    });
  }
};
