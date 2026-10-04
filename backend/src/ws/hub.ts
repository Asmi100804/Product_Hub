import { WebSocket } from "ws";

// userId -> the user's open sockets (a user may have several tabs / devices)
const clients = new Map<string, Set<WebSocket>>();

const MAX_BUFFERED_BYTES = 1024 * 1024;

export const hub = {
  add(userId: string, socket: WebSocket) {
    let set = clients.get(userId);
    if (!set) clients.set(userId, (set = new Set()));
    set.add(socket);
  },

  remove(userId: string, socket: WebSocket) {
    const set = clients.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) clients.delete(userId);
  },

  isOnline(userId: string) {
    return (clients.get(userId)?.size ?? 0) > 0;
  },

  sendToSocket(socket: WebSocket, type: string, data: unknown = {}) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      socket.terminate(); // slow consumer, it will resync after reconnecting
      return;
    }
    socket.send(JSON.stringify({ type, data }));
  },

  // send to every open socket of a user (optionally skipping the originating socket)
  sendToUser(userId: string, type: string, data: unknown = {}, except?: WebSocket) {
    const set = clients.get(userId);
    if (!set) return;
    for (const socket of set) {
      if (socket !== except) hub.sendToSocket(socket, type, data);
    }
  },

  closeAll(code = 1001, reason = "server shutting down") {
    for (const set of clients.values()) for (const socket of set) socket.close(code, reason);
  },
};
