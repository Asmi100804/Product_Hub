import express from "express";
import cors from "cors";
import path from "path";
import http from "http";

import { ENV } from "./config/env";
import { clerkMiddleware } from "@clerk/express";

import userRoutes from "./routes/userRoutes";
import productRoutes from "./routes/productRoutes";
import commentRoutes from "./routes/commentRoutes";
import conversationRoutes from "./routes/conversationRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import { attachWebSocketServer } from "./ws/server";
import { hub } from "./ws/hub";

const app = express();

app.use(cors({ origin: ENV.FRONTEND_URL, credentials: true }));
// `credentials: true` allows the frontend to send cookies to the backend so that we can authenticate the user.
app.use(clerkMiddleware()); // auth obj will be attached to the req
app.use(express.json()); // parses JSON request bodies.
app.use(express.urlencoded({ extended: true })); // parses form data (like HTML forms).

app.get("/api/health", (req, res) => {
  res.json({
    message: "Welcome to ProductHub API - Powered by PostgreSQL, Drizzle ORM & Clerk Auth",
    endpoints: {
      users: "/api/users",
      products: "/api/products",
      comments: "/api/comments",
      conversations: "/api/conversations",
      notifications: "/api/notifications",
      websocket: "/ws",
    },
  });
});

app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/notifications", notificationRoutes);

if (ENV.NODE_ENV === "production") {
  const __dirname = path.resolve();

  // serve static files from frontend/dist
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  // handle SPA routing - send all non-API routes to index.html - react app
  app.get("/{*any}", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

// plain HTTP server so the WebSocket server (/ws) can share the same port as the REST API
const server = http.createServer(app);
const wss = attachWebSocketServer(server);

server.listen(ENV.PORT, () => console.log("Server is up and running on PORT:", ENV.PORT));

// graceful shutdown: close sockets so clients reconnect to the next instance
const shutdown = () => {
  hub.closeAll();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
