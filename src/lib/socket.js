import { io } from "socket.io-client";

// One Socket.IO connection for the signed-in player. Same origin in development
// (Vite proxies /socket.io to the backend), VITE_API_URL's origin in production.
// Auth = the same httpOnly cookie as the REST API (withCredentials).
const ORIGIN =
  (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "") || undefined;

let socket = null;

export function getSocket() {
  socket ??= io(ORIGIN, {
    path: "/socket.io",
    withCredentials: true,
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
