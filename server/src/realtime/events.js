/**
 * ProctorShield Realtime Event Constants
 */

export const SOCKET_EVENTS = {
  // Client -> Server
  SESSION_JOIN: 'session:join',
  SIGNALS_BATCH: 'signals:batch',
  HEARTBEAT: 'heartbeat',
  SESSION_LEAVE: 'session:leave',

  // Server -> Client / Proctor
  SESSION_STATUS: 'session:status',
  FLAG_NEW: 'flag:new'
};
