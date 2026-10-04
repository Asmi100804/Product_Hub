import { db } from "./index";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import {
  users,
  comments,
  products,
  notifications,
  type NewUser,
  type NewComment,
  type NewProduct,
} from "./schema";

// USER QUERIES
export const createUser = async (data: NewUser) => {
  const [user] = await db.insert(users).values(data).returning();
  return user;
};

export const getUserById = async (id: string) => {
  return db.query.users.findFirst({ where: eq(users.id, id) });
};

export const updateUser = async (id: string, data: Partial<NewUser>) => {
  const existingUser = await getUserById(id);
  if (!existingUser) {
    throw new Error(`User with id ${id} not found`);
  }

  const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();//reaturing() leads to return affected rows with all coloumns
  return user;
};

// upsert => create or update

export const upsertUser = async (data: NewUser) => {
  // this is what we have done first
  // const existingUser = await getUserById(data.id);
  // if (existingUser) return updateUser(data.id, data);

  // return createUser(data);

  // and this is what CR suggested
  const [user] = await db
    .insert(users)
    .values(data)
    .onConflictDoUpdate({
      target: users.id,
      set: data,
    })
    .returning();
  return user;
};

// PRODUCT QUERIES
export const createProduct = async (data: NewProduct) => {
  const [product] = await db.insert(products).values(data).returning();
  return product;
};

export const getAllProducts = async () => {
  return db.query.products.findMany({
    with: { user: true },
    orderBy: (products, { desc }) => [desc(products.createdAt)], // desc means: you will see the latest products first
    // the square brackets are required because Drizzle ORM's orderBy expects an array, even for a single column.
  });
};

export const getProductById = async (id: string) => {
  return db.query.products.findFirst({
    where: eq(products.id, id),
    // comments are no longer loaded here: they are paginated through
    // GET /api/comments/product/:productId (see getTopLevelComments / getReplies below)
    with: { user: true },
  });
};

export const getProductsByUserId = async (userId: string) => {
  return db.query.products.findMany({
    where: eq(products.userId, userId),
    with: { user: true },
    orderBy: (products, { desc }) => [desc(products.createdAt)],
  });
};

export const updateProduct = async (id: string, data: Partial<NewProduct>) => {
  const existingProduct = await getProductById(id);
  if (!existingProduct) {
    throw new Error(`Product with id ${id} not found`);
  }

  const [product] = await db.update(products).set(data).where(eq(products.id, id)).returning();
  return product;
};

export const deleteProduct = async (id: string) => {
  const existingProduct = await getProductById(id);
  if (!existingProduct) {
    throw new Error(`Product with id ${id} not found`);
  }

  const [product] = await db.delete(products).where(eq(products.id, id)).returning();
  return product;
};

// COMMENT QUERIES
export const createComment = async (data: NewComment) => {
  const [comment] = await db.insert(comments).values(data).returning();
  return comment;
};

export const deleteComment = async (id: string) => {
  const existingComment = await getCommentById(id);
  if (!existingComment) {
    throw new Error(`Comment with id ${id} not found`);
  }

  // replies are removed by the ON DELETE CASCADE on comments.parent_comment_id
  const [comment] = await db.delete(comments).where(eq(comments.id, id)).returning();
  return comment;
};

export const getCommentById = async (id: string) => {
  return db.query.comments.findFirst({
    where: eq(comments.id, id),
    with: { user: true },
  });
};

export const updateCommentContent = async (id: string, content: string) => {
  const [comment] = await db
    .update(comments)
    .set({ content, editedAt: new Date() })
    .where(eq(comments.id, id))
    .returning();
  return comment;
};

// shape sent to the client (never leaks the user's email)
const commentSelection = {
  id: comments.id,
  content: comments.content,
  userId: comments.userId,
  productId: comments.productId,
  parentCommentId: comments.parentCommentId,
  createdAt: comments.createdAt,
  editedAt: comments.editedAt,
  user: { id: users.id, name: users.name, imageUrl: users.imageUrl },
  replyCount: sql<number>`(select count(*)::int from comments r where r.parent_comment_id = ${comments.id})`,
};

// single comment/reply in the client shape (used after create / edit)
export const getCommentDTO = async (id: string) => {
  const [row] = await db
    .select(commentSelection)
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.id, id));
  return row;
};

// Keyset pagination: the cursor is the id of the last row of the previous page. Comparing the
// (created_at, id) tuple against that row's own values avoids timestamp precision problems.
const pageOf = <T extends { id: string }>(rows: T[], limit: number) => {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
};

export const getTopLevelComments = async (productId: string, limit: number, cursor?: string) => {
  const conditions: SQL[] = [eq(comments.productId, productId), isNull(comments.parentCommentId)];
  if (cursor) {
    conditions.push(
      sql`(${comments.createdAt}, ${comments.id}) < (select c.created_at, c.id from comments c where c.id = ${cursor})`
    );
  }

  const rows = await db
    .select(commentSelection)
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(limit + 1);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(comments)
    .where(eq(comments.productId, productId));

  const { items, nextCursor } = pageOf(rows, limit);
  return { comments: items, nextCursor, totalCount: total };
};

export const getReplies = async (parentCommentId: string, limit: number, cursor?: string) => {
  const conditions: SQL[] = [eq(comments.parentCommentId, parentCommentId)];
  if (cursor) {
    conditions.push(
      sql`(${comments.createdAt}, ${comments.id}) > (select c.created_at, c.id from comments c where c.id = ${cursor})`
    );
  }

  const rows = await db
    .select(commentSelection)
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(and(...conditions))
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .limit(limit + 1);

  const { items, nextCursor } = pageOf(rows, limit);
  return { replies: items, nextCursor };
};

// NOTIFICATIONS
// One *unread* notification per (recipient, type, thread). More replies to the same thread only
// bump `count` / `actorId` / `updatedAt` (partial unique index + upsert => race safe).
export const upsertReplyNotification = async (data: {
  userId: string;
  actorId: string;
  productId: string;
  parentCommentId: string; // thread root
  commentId: string; // the new reply
}) => {
  const [notification] = await db
    .insert(notifications)
    .values({ ...data, type: "comment_reply" })
    .onConflictDoUpdate({
      target: [notifications.userId, notifications.type, notifications.parentCommentId],
      targetWhere: sql`${notifications.readAt} is null`,
      set: {
        actorId: data.actorId,
        commentId: data.commentId,
        count: sql`${notifications.count} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return notification;
};

const notificationSelection = {
  id: notifications.id,
  type: notifications.type,
  count: notifications.count,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
  updatedAt: notifications.updatedAt,
  productId: notifications.productId,
  parentCommentId: notifications.parentCommentId,
  commentId: notifications.commentId,
  actor: { id: users.id, name: users.name, imageUrl: users.imageUrl },
  productTitle: products.title,
};

export const getNotificationDTO = async (id: string) => {
  const [row] = await db
    .select(notificationSelection)
    .from(notifications)
    .innerJoin(users, eq(notifications.actorId, users.id))
    .leftJoin(products, eq(notifications.productId, products.id))
    .where(eq(notifications.id, id));
  return row;
};

export const getNotifications = async (userId: string, limit = 20) => {
  const items = await db
    .select(notificationSelection)
    .from(notifications)
    .innerJoin(users, eq(notifications.actorId, users.id))
    .leftJoin(products, eq(notifications.productId, products.id))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.updatedAt))
    .limit(limit);
  return { notifications: items, unreadCount: await getUnreadNotificationCount(userId) };
};

export const getUnreadNotificationCount = async (userId: string) => {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return count;
};

export const markNotificationRead = async (userId: string, id: string) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt))
    );
};

export const markAllNotificationsRead = async (userId: string) => {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
};
