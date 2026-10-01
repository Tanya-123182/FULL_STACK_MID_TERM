/**
 * ProctorShield Client-Side Socket.IO Manager
 * Manages websocket connection lifecycle, token authentication, and event subscriptions.
 */

import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;

/**
 * Initializes and connects the Socket.IO client with JWT authentication.
 *
 * @param {string} token - JWT bearer token
 * @returns {import('socket.io-client').Socket}
 */
export function connectSocket(token) {
  if (socket && socket.connected) {
    return socket;
  }

  // Clean up any stale disconnected instance
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('[ProctorShield Realtime] Connected to Socket.IO server. ID:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.warn('[ProctorShield Realtime] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[ProctorShield Realtime] Disconnected:', reason);
  });

  return socket;
}

/**
 * Returns the current active Socket.IO instance or null.
 *
 * @returns {import('socket.io-client').Socket|null}
 */
export function getSocket() {
  return socket;
}

/**
 * Cleanly disconnects the socket and resets singleton state.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
