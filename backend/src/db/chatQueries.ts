import { db } from "./index";
import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { conversationParticipants, conversations, messages, users } from "./schema";

// the shape of a message sent to clients
const messageColumns = {
  id: messages.id,
  seq: messages.seq,
  conversationId: messages.conversationId,
  senderId: messages.senderId,
  content: messages.content,
  clientMessageId: messages.clientMessageId,
  createdAt: messages.createdAt,
  deliveredAt: messages.deliveredAt,
  readAt: messages.readAt,
};

export type MessageDTO = {
  id: string;
  seq: number;
  conversationId: string;
  senderId: string;
  content: string;
  clientMessageId: string;
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
};

const pairKeyOf = (a: string, b: string) => [a, b].sort().join(":");

// Returns the existing conversation between the two users or creates it. The UNIQUE pair_key makes
// this race-safe: concurrent callers end up with the same conversation row.
export const getOrCreateConversation = async (userId: string, recipientId: string) => {
  const pairKey = pairKeyOf(userId, recipientId);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(conversations)
      .values({ pairKey })
      .onConflictDoNothing({ target: conversations.pairKey })
      .returning({ id: conversations.id });

    if (created) {
      await tx.insert(conversationParticipants).values([
        { conversationId: created.id, userId },
        { conversationId: created.id, userId: recipientId },
      ]);
      return { id: created.id, created: true };
    }

    const [existing] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.pairKey, pairKey));
    return { id: existing.id, created: false };
  });
};

export const isParticipant = async (conversationId: string, userId: string) => {
  const [row] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      )
    );
  return !!row;
};

// the *other* participant, or undefined if `userId` is not in the conversation
export const getOtherParticipant = async (conversationId: string, userId: string) => {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      imageUrl: users.imageUrl,
      lastReadSeq: conversationParticipants.lastReadSeq,
    })
    .from(conversationParticipants)
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(eq(conversationParticipants.conversationId, conversationId));

  if (!rows.some((r) => r.id === userId)) return undefined;
  const other = rows.find((r) => r.id !== userId);
  return other ? { id: other.id, name: other.name, imageUrl: other.imageUrl } : undefined;
};

export const listConversations = async (userId: string, limit = 50) => {
  const result = await db.execute(sql`
    select
      c.id,
      c.last_message_at as "lastMessageAt",
      ou.id as "otherUserId",
      ou.name as "otherUserName",
      ou.image_url as "otherUserImageUrl",
      lm.id as "lastMessageId",
      lm.seq as "lastMessageSeq",
      lm.content as "lastMessageContent",
      lm.sender_id as "lastMessageSenderId",
      lm.created_at as "lastMessageCreatedAt",
      lm.delivered_at as "lastMessageDeliveredAt",
      lm.read_at as "lastMessageReadAt",
      (
        select count(*)::int from messages m
        where m.conversation_id = c.id and m.sender_id <> me.user_id and m.seq > me.last_read_seq
      ) as "unreadCount"
    from conversation_participants me
    join conversations c on c.id = me.conversation_id
    join conversation_participants op on op.conversation_id = c.id and op.user_id <> me.user_id
    join users ou on ou.id = op.user_id
    join lateral (
      select m.id, m.seq, m.content, m.sender_id, m.created_at, m.delivered_at, m.read_at
      from messages m where m.conversation_id = c.id order by m.seq desc limit 1
    ) lm on true
    where me.user_id = ${userId}
    order by c.last_message_at desc, c.id desc
    limit ${limit}
  `);

  type Row = {
    id: string;
    lastMessageAt: Date;
    otherUserId: string;
    otherUserName: string | null;
    otherUserImageUrl: string | null;
    lastMessageId: string;
    lastMessageSeq: string | number;
    lastMessageContent: string;
    lastMessageSenderId: string;
    lastMessageCreatedAt: Date;
    lastMessageDeliveredAt: Date | null;
    lastMessageReadAt: Date | null;
    unreadCount: number;
  };

  return (result.rows as Row[]).map((r) => ({
    id: r.id,
    lastMessageAt: r.lastMessageAt,
    unreadCount: r.unreadCount,
    otherUser: { id: r.otherUserId, name: r.otherUserName, imageUrl: r.otherUserImageUrl },
    lastMessage: {
      id: r.lastMessageId,
      seq: Number(r.lastMessageSeq),
      content: r.lastMessageContent,
      senderId: r.lastMessageSenderId,
      createdAt: r.lastMessageCreatedAt,
      deliveredAt: r.lastMessageDeliveredAt,
      readAt: r.lastMessageReadAt,
    },
  }));
};

// newest-first keyset pagination on `seq`; returned in ascending order for easy rendering
export const getMessagesPage = async (conversationId: string, limit: number, beforeSeq?: number) => {
  const rows = await db
    .select(messageColumns)
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        beforeSeq ? lt(messages.seq, beforeSeq) : undefined
      )
    )
    .orderBy(desc(messages.seq))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
  return { messages: page as MessageDTO[], nextCursor: hasMore ? page[0].seq : null };
};

// Idempotent insert: (conversation, sender, clientMessageId) is UNIQUE, so retries and reconnect
// re-sends return the already stored message instead of creating a duplicate.
export const insertMessage = async (data: {
  conversationId: string;
  senderId: string;
  content: string;
  clientMessageId: string;
  deliveredAt: Date | null;
}) => {
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messages)
      .values(data)
      .onConflictDoNothing({
        target: [messages.conversationId, messages.senderId, messages.clientMessageId],
      })
      .returning(messageColumns);

    if (!inserted) {
      const [existing] = await tx
        .select(messageColumns)
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, data.conversationId),
            eq(messages.senderId, data.senderId),
            eq(messages.clientMessageId, data.clientMessageId)
          )
        );
      return { message: existing as MessageDTO, duplicate: true };
    }

    await tx
      .update(conversations)
      .set({ lastMessageAt: inserted.createdAt })
      .where(eq(conversations.id, data.conversationId));

    return { message: inserted as MessageDTO, duplicate: false };
  });
};

// unread / delivered / read
export const getUnreadForConversation = async (userId: string, conversationId: string) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, messages.conversationId),
        eq(conversationParticipants.userId, userId)
      )
    )
    .where(
      and(
        eq(messages.conversationId, conversationId),
        ne(messages.senderId, userId),
        gt(messages.seq, conversationParticipants.lastReadSeq)
      )
    );
  return row?.count ?? 0;
};

export const getTotalUnread = async (userId: string) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, messages.conversationId),
        eq(conversationParticipants.userId, userId)
      )
    )
    .where(and(ne(messages.senderId, userId), gt(messages.seq, conversationParticipants.lastReadSeq)));
  return row?.count ?? 0;
};

// Marks everything in the conversation as read for `userId`. Returns the highest seq that was
// read plus the number of messages from the other user that flipped to "read".
export const markConversationRead = async (userId: string, conversationId: string) => {
  return db.transaction(async (tx) => {
    const [{ maxSeq }] = await tx
      .select({ maxSeq: sql<number>`coalesce(max(${messages.seq}), 0)::bigint` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    const upToSeq = Number(maxSeq);

    await tx
      .update(conversationParticipants)
      .set({ lastReadSeq: sql`greatest(${conversationParticipants.lastReadSeq}, ${upToSeq})` })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId)
        )
      );

    const now = new Date();
    const updated = await tx
      .update(messages)
      .set({ readAt: now, deliveredAt: sql`coalesce(${messages.deliveredAt}, ${now})` })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, userId),
          isNull(messages.readAt),
          sql`${messages.seq} <= ${upToSeq}`
        )
      )
      .returning({ id: messages.id });

    return { upToSeq, readCount: updated.length, readAt: now };
  });
};

// When a user comes online, everything sent to them so far counts as delivered.
export const markDeliveredForUser = async (userId: string) => {
  const myConversations = db
    .select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId));

  const rows = await db
    .update(messages)
    .set({ deliveredAt: new Date() })
    .where(
      and(
        isNull(messages.deliveredAt),
        ne(messages.senderId, userId),
        inArray(messages.conversationId, myConversations)
      )
    )
    .returning({
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      seq: messages.seq,
    });

  // group => one status event per (sender, conversation)
  const grouped = new Map<string, { senderId: string; conversationId: string; upToSeq: number }>();
  for (const r of rows) {
    const key = `${r.senderId}:${r.conversationId}`;
    const current = grouped.get(key);
    if (!current || r.seq > current.upToSeq) {
      grouped.set(key, { senderId: r.senderId, conversationId: r.conversationId, upToSeq: r.seq });
    }
  }
  return [...grouped.values()];
};
