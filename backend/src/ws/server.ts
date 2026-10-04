import type { Server } from "http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { verifyToken } from "@clerk/express";
import { ENV } from "../config/env";
import { hub } from "./hub";
import { messageLimiter } from "../middleware/rateLimit";
import {
  ChatError,
  deliverPendingMessages,
  markRead,
  sendMessage,
} from "../services/messageService";
import * as chat from "../db/chatQueries";

/*
 * WebSocket protocol  (every frame is JSON: { type: string, data?: any })
 *
 * client -> server
 *   auth              { token }                                  first frame, Clerk session token
 *   message:send      { conversationId, content, clientMessageId }
 *   conversation:read { conversationId }
 *   ping
 *
 * server -> client
 *   auth:ok           { userId }
 *   message:new       Message                                    new message in one of my conversations
 *   message:ack       { clientMessageId, message, duplicate }    reply to message:send (originating socket)
 *   message:error     { clientMessageId, code, message }
 *   message:status    { conversationId, status: "delivered"|"read", upToSeq, at }
 *   unread:update     { conversationId, unread, total }
 *   notification:new  Notification                               (comment replies)
 *   error             { code, message }
 *   pong
 */

const AUTH_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 16 * 1024;

type Client = WebSocket & { userId?: string; isAlive: boolean };

const normalizeOrigin = (o: string) => o.replace(/\/+$/, "").toLowerCase();

export const attachWebSocketServer = (server: Server) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }

    // same-origin policy for WebSockets (browsers always send Origin)
    const origin = req.headers.origin;
    if (ENV.FRONTEND_URL && origin && normalizeOrigin(origin) !== normalizeOrigin(ENV.FRONTEND_URL)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (raw) => {
    const ws = raw as Client;
    ws.isAlive = true;

    // the socket must authenticate quickly, otherwise it is dropped
    const authTimer = setTimeout(() => {
      if (!ws.userId) ws.close(4401, "auth timeout");
    }, AUTH_TIMEOUT_MS);

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (data: RawData, isBinary: boolean) => {
      ws.isAlive = true;
      if (isBinary) return;

      let frame: { type?: string; data?: any };
      try {
        frame = JSON.parse(data.toString());
      } catch {
        return hub.sendToSocket(ws, "error", { code: "bad_request", message: "Invalid JSON" });
      }
      if (!frame || typeof frame.type !== "string") return;

      // ---- authentication handshake -------
      if (!ws.userId) {
        if (frame.type !== "auth") return ws.close(4401, "unauthenticated");
        try {
          const token = frame.data?.token;
          if (typeof token !== "string") throw new Error("missing token");
          const payload = await verifyToken(token, { secretKey: ENV.CLERK_SECRET_KEY });
          if (!payload?.sub) throw new Error("invalid token");

          if (ws.readyState !== WebSocket.OPEN) return; // closed while verifying
          ws.userId = payload.sub;
          clearTimeout(authTimer);
          hub.add(ws.userId, ws);
          hub.sendToSocket(ws, "auth:ok", { userId: ws.userId });

          // catch-up after (re)connecting
          void deliverPendingMessages(ws.userId).catch((e) => console.error("deliver failed:", e));
          void chat
            .getTotalUnread(ws.userId)
            .then((total) => hub.sendToSocket(ws, "unread:update", { conversationId: null, total }))
            .catch((e) => console.error("unread failed:", e));
        } catch {
          ws.close(4401, "invalid token");
        }
        return;
      }

      const userId = ws.userId;

      try {
        switch (frame.type) {
          case "ping":
            hub.sendToSocket(ws, "pong");
            break;

          case "message:send": {
            const clientMessageId = frame.data?.clientMessageId;
            try {
              if (!messageLimiter.check(userId)) {
                throw new ChatError("rate_limited", "You are sending messages too fast", 429);
              }
              const { message, duplicate } = await sendMessage({
                senderId: userId,
                conversationId: frame.data?.conversationId,
                content: frame.data?.content,
                clientMessageId,
                originSocket: ws,
              });
              hub.sendToSocket(ws, "message:ack", { clientMessageId, message, duplicate });
            } catch (err) {
              if (err instanceof ChatError) {
                hub.sendToSocket(ws, "message:error", {
                  clientMessageId,
                  code: err.code,
                  message: err.message,
                });
              } else {
                console.error("message:send failed:", err);
                hub.sendToSocket(ws, "message:error", {
                  clientMessageId,
                  code: "server_error",
                  message: "Failed to send message",
                });
              }
            }
            break;
          }

          case "conversation:read":
            await markRead(userId, frame.data?.conversationId);
            break;

          default:
            hub.sendToSocket(ws, "error", { code: "unknown_event", message: `Unknown event` });
        }
      } catch (err) {
        if (err instanceof ChatError) {
          hub.sendToSocket(ws, "error", { code: err.code, message: err.message });
        } else {
          console.error("WebSocket handler error:", err);
          hub.sendToSocket(ws, "error", { code: "server_error", message: "Something went wrong" });
        }
      }
    });

    const cleanup = () => {
      clearTimeout(authTimer);
      if (ws.userId) hub.remove(ws.userId, ws);
    };
    ws.on("close", cleanup);
    ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
      cleanup();
    });
  });

  // drop half-open connections
  const heartbeat = setInterval(() => {
    for (const client of wss.clients as Set<Client>) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
};
