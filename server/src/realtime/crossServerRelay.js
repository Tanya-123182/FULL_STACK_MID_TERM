/**
 * ProctorShield Cross-Server Socket.IO Coordination Relay
 * Enables real-time event synchronization across multiple backend server instances (e.g. Port 5000 and Port 5001).
 * Uses Redis state/list sharing and local bus fallback so events like flag:new and session:status
 * reach proctors connected to any server instance.
 */

import { redisGet, redisSet } from '../config/redis.js';
import { getExamRoom } from './rooms.js';

const INSTANCE_ID = `${process.env.PORT || '5000'}_${Math.random().toString(36).substring(2, 9)}`;
const RELAY_POLL_INTERVAL_MS = 150;
const EVENT_TTL_SECONDS = 60;

// Shared in-memory event bus across local instances if sharing same process/node environment
const globalMemoryBus = globalThis.__ps_event_bus || (globalThis.__ps_event_bus = {
  listeners: new Set(),
  emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {}
    }
  }
});

let relayInterval = null;
let lastSeenEventTimestamp = Date.now();
const seenEventIds = new Set();

/**
 * Initializes the cross-server relay for the given Socket.IO server.
 *
 * @param {import('socket.io').Server} io
 * @param {string} [customInstanceId]
 */
export function initCrossServerRelay(io, customInstanceId) {
  if (!io) return;

  const instanceId = customInstanceId || `inst_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  io.instanceId = instanceId;

  // 1. Subscribe to shared memory bus (for local multi-instance / test harnesses)
  const localListener = (event) => {
    if (!event || event.sourceInstance === io.instanceId) return;
    if (seenEventIds.has(`${io.instanceId}_${event.id}`)) return;
    seenEventIds.add(`${io.instanceId}_${event.id}`);

    // Deliver to local sockets in the target room
    if (event.room && event.name && event.payload) {
      io.to(event.room).emit(event.name, event.payload);
    }
  };

  globalMemoryBus.listeners.add(localListener);

  // 2. Poll Redis shared event registry if available
  const pollInterval = setInterval(async () => {
    try {
      const activeExamsKey = 'ps:active_exam_events';
      const recentEvents = await redisGet(activeExamsKey);
      if (Array.isArray(recentEvents)) {
        for (const evt of recentEvents) {
          if (evt && evt.sourceInstance !== io.instanceId && !seenEventIds.has(`${io.instanceId}_${evt.id}`)) {
            seenEventIds.add(`${io.instanceId}_${evt.id}`);
            if (evt.room && evt.name && evt.payload) {
              io.to(evt.room).emit(evt.name, evt.payload);
            }
          }
        }
      }
    } catch {}
  }, RELAY_POLL_INTERVAL_MS);

  // Clean up on process exit
  process.on('SIGTERM', () => clearInterval(pollInterval));
  process.on('SIGINT', () => clearInterval(pollInterval));
}

/**
 * Broadcasts a real-time event to both local Socket.IO rooms and across all server instances.
 *
 * @param {import('socket.io').Server} io
 * @param {string} room
 * @param {string} eventName
 * @param {Object} payload
 */
export async function broadcastCrossServer(io, room, eventName, payload) {
  if (!io || !room || !eventName) return;

  const instanceId = io.instanceId || `inst_default`;
  const eventId = `${instanceId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // 1. Emit locally to sockets connected directly to this instance
  io.to(room).emit(eventName, payload);

  const eventRecord = {
    id: eventId,
    sourceInstance: instanceId,
    room,
    name: eventName,
    payload,
    timestamp: Date.now()
  };

  // 2. Publish to local shared memory bus
  globalMemoryBus.emit(eventRecord);

  // 3. Publish to Redis shared registry with TTL
  try {
    const activeExamsKey = 'ps:active_exam_events';
    const currentList = (await redisGet(activeExamsKey)) || [];
    const now = Date.now();
    // Keep only events from the last 60 seconds
    const prunedList = Array.isArray(currentList)
      ? currentList.filter(e => e && (now - e.timestamp) < (EVENT_TTL_SECONDS * 1000))
      : [];
    prunedList.push(eventRecord);
    await redisSet(activeExamsKey, prunedList, { ex: EVENT_TTL_SECONDS });
  } catch {}
}

/**
 * Stops the cross-server relay polling timer.
 */
export function stopCrossServerRelay() {
  if (relayInterval) {
    clearInterval(relayInterval);
    relayInterval = null;
  }
}
