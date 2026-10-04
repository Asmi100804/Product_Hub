import { Router } from "express";
import { requireAuth } from "@clerk/express";
import * as controller from "../controllers/notificationController";

const router = Router();

router.get("/", requireAuth(), controller.getNotifications);
router.post("/read-all", requireAuth(), controller.markAllRead);
router.post("/:id/read", requireAuth(), controller.markRead);

export default router;
