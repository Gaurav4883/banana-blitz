import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  // so the handshake carries the bb_session cookie, the server checks it
  withCredentials: true,
  transports: ["websocket", "polling"],
});
