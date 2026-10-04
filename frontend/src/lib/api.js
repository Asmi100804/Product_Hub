import api from "./axios";

// USERS API
export const syncUser = async (userData) => {
  const { data } = await api.post("/users/sync", userData);
  return data;
};

// Products API
export const getAllProducts = async () => {
  const { data } = await api.get("/products");
  return data;
};

export const getProductById = async (id) => {
  const { data } = await api.get(`/products/${id}`);
  return data;
};

export const getMyProducts = async () => {
  const { data } = await api.get("/products/my");
  return data;
};

export const createProduct = async (productData) => {
  const { data } = await api.post("/products", productData);
  return data;
};

export const updateProduct = async ({ id, ...productData }) => {
  const { data } = await api.put(`/products/${id}`, productData);
  return data;
};

export const deleteProduct = async (id) => {
  const { data } = await api.delete(`/products/${id}`);
  return data;
};

// Comments API
// top-level comments of a product (paginated, newest first). Each has `replyCount`.
export const getProductComments = async ({ productId, cursor }) => {
  const { data } = await api.get(`/comments/product/${productId}`, {
    params: { cursor, limit: 10 },
  });
  return data;
};

// replies of a comment (paginated, oldest first)
export const getReplies = async ({ commentId, cursor }) => {
  const { data } = await api.get(`/comments/${commentId}/replies`, { params: { cursor, limit: 10 } });
  return data;
};

// pass `parentCommentId` to create a reply
export const createComment = async ({ productId, content, parentCommentId }) => {
  const { data } = await api.post(`/comments/${productId}`, { content, parentCommentId });
  return data;
};

export const updateComment = async ({ commentId, content }) => {
  const { data } = await api.put(`/comments/${commentId}`, { content });
  return data;
};

export const deleteComment = async ({ commentId }) => {
  const { data } = await api.delete(`/comments/${commentId}`);
  return data;
};

// Conversations / messages API
export const startConversation = async (recipientId) => {
  const { data } = await api.post("/conversations", { recipientId });
  return data;
};

export const getConversations = async () => {
  const { data } = await api.get("/conversations");
  return data;
};

export const getConversation = async (conversationId) => {
  const { data } = await api.get(`/conversations/${conversationId}`);
  return data;
};

export const getUnreadCount = async () => {
  const { data } = await api.get("/conversations/unread-count");
  return data;
};

export const getMessages = async ({ conversationId, before }) => {
  const { data } = await api.get(`/conversations/${conversationId}/messages`, {
    params: { before, limit: 30 },
  });
  return data;
};

// HTTP fallback used when the WebSocket is unavailable (idempotent via clientMessageId)
export const postMessage = async ({ conversationId, content, clientMessageId }) => {
  const { data } = await api.post(`/conversations/${conversationId}/messages`, {
    content,
    clientMessageId,
  });
  return data;
};

export const markConversationRead = async (conversationId) => {
  const { data } = await api.post(`/conversations/${conversationId}/read`);
  return data;
};

// Notifications API
export const getNotifications = async () => {
  const { data } = await api.get("/notifications");
  return data;
};

export const markNotificationRead = async (id) => {
  const { data } = await api.post(`/notifications/${id}/read`);
  return data;
};

export const markAllNotificationsRead = async () => {
  const { data } = await api.post("/notifications/read-all");
  return data;
};
