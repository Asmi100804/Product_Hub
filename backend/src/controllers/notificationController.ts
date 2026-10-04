import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import * as queries from "../db/queries";
import { isUuid } from "../lib/validation";

// GET /api/notifications -> latest notifications + unread count
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    res.status(200).json(await queries.getNotifications(userId));
  } catch (error) {
    console.error("Error getting notifications:", error);
    res.status(500).json({ error: "Failed to get notifications" });
  }
};

// POST /api/notifications/:id/read
export const markRead = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!isUuid(req.params.id)) return res.status(404).json({ error: "Notification not found" });

    await queries.markNotificationRead(userId, req.params.id); // scoped to the owner
    res.status(200).json({ unreadCount: await queries.getUnreadNotificationCount(userId) });
  } catch (error) {
    console.error("Error marking notification read:", error);
    res.status(500).json({ error: "Failed to update notification" });
  }
};

// POST /api/notifications/read-all
export const markAllRead = async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await queries.markAllNotificationsRead(userId);
    res.status(200).json({ unreadCount: 0 });
  } catch (error) {
    console.error("Error marking notifications read:", error);
    res.status(500).json({ error: "Failed to update notifications" });
  }
};
