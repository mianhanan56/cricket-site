'use client';

import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@crex/shared';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export type CrexSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Singleton client shared across the app.
let socket: CrexSocket | null = null;

/** Create (or reconnect) the singleton Socket.io client. */
export function connectSocket(): CrexSocket {
  if (!socket) {
    socket = io(SOCKET_URL, { transports: ['websocket'], autoConnect: true });
  } else if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

/** Tear down the singleton connection. */
export function disconnectSocket(): void {
  socket?.disconnect();
}

/** Subscribe to a match room (server joins `match:${matchId}`). */
export function joinMatch(matchId: string): void {
  connectSocket().emit('match:subscribe', matchId);
}

/** Leave a match room. */
export function leaveMatch(matchId: string): void {
  socket?.emit('match:unsubscribe', matchId);
}

/** Access the current socket instance (may be null before connect). */
export function getSocket(): CrexSocket | null {
  return socket;
}
