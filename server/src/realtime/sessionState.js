/**
 * ProctorShield Live Session State Manager
 * Tracks temporary candidate presence, heartbeats, and active session state in Redis.
 * Uses TTL expiration for automatic stale session cleanup with in-memory fallback.
 * Persistent source of truth remains MongoDB.
 */

import { redisSet, redisGet, redisDel, redisExpire } from '../config/redis.js';

// Default TTL: 5 minutes (300 seconds)
export const LIVE_SESSION_TTL_SECONDS = 300;

// Local in-memory fallback cache in case Redis is unavailable or read-only
const localPresenceCache = new Map();

/**
 * Returns the Redis key for session presence.
 *
 * @param {string} sessionId
 * @returns {string}
 */
export function getSessionPresenceKey(sessionId) {
  return `ps:session:${sessionId}:presence`;
}

/**
 * Stores or updates live session presence.
 *
 * @param {string} sessionId
 * @param {Object} data
 * @param {number} [ttlSeconds=LIVE_SESSION_TTL_SECONDS]
 * @returns {Promise<Object>}
 */
export async function setLiveSessionPresence(sessionId, data = {}, ttlSeconds = LIVE_SESSION_TTL_SECONDS) {
  if (!sessionId) return null;

  const now = new Date().toISOString();
  const payload = {
    sessionId: sessionId.toString(),
    examId: data.examId ? data.examId.toString() : null,
    candidateId: data.candidateId ? data.candidateId.toString() : null,
    status: data.status || 'active',
    lastHeartbeat: data.lastHeartbeat || now,
    lastActivity: now,
    connectedAt: data.connectedAt || now,
    serverInstance: process.env.PORT || '5000'
  };

  // Always update in-memory cache
  localPresenceCache.set(sessionId.toString(), { ...payload, _cachedAt: Date.now() });

  // Persist to Redis with TTL
  const key = getSessionPresenceKey(sessionId);
  await redisSet(key, payload, { ex: ttlSeconds });

  return payload;
}

/**
 * Retrieves the current live presence state for a session.
 *
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
export async function getLiveSessionPresence(sessionId) {
  if (!sessionId) return null;

  const key = getSessionPresenceKey(sessionId);
  const redisData = await redisGet(key);

  if (redisData && typeof redisData === 'object') {
    return redisData;
  }

  // Fallback to in-memory cache
  const localData = localPresenceCache.get(sessionId.toString());
  if (localData) {
    const isExpired = (Date.now() - (localData._cachedAt || 0)) > (LIVE_SESSION_TTL_SECONDS * 1000);
    if (!isExpired) {
      return localData;
    }
    localPresenceCache.delete(sessionId.toString());
  }

  return null;
}

/**
 * Updates the lastHeartbeat and lastActivity timestamp for an active session.
 *
 * @param {string} sessionId
 * @param {number} [ttlSeconds=LIVE_SESSION_TTL_SECONDS]
 * @returns {Promise<Object|null>}
 */
export async function updateLiveHeartbeat(sessionId, ttlSeconds = LIVE_SESSION_TTL_SECONDS) {
  if (!sessionId) return null;

  const existing = await getLiveSessionPresence(sessionId);
  const now = new Date().toISOString();

  const updated = {
    ...(existing || { sessionId: sessionId.toString(), status: 'active' }),
    lastHeartbeat: now,
    lastActivity: now
  };

  localPresenceCache.set(sessionId.toString(), { ...updated, _cachedAt: Date.now() });

  const key = getSessionPresenceKey(sessionId);
  await redisSet(key, updated, { ex: ttlSeconds });

  return updated;
}

/**
 * Removes or marks live session presence as completed/disconnected.
 *
 * @param {string} sessionId
 * @param {'disconnected'|'completed'} [status='completed']
 * @returns {Promise<boolean>}
 */
export async function removeLiveSessionPresence(sessionId, status = 'completed') {
  if (!sessionId) return false;

  const existing = await getLiveSessionPresence(sessionId);
  if (existing) {
    const updated = {
      ...existing,
      status,
      lastActivity: new Date().toISOString()
    };

    if (status === 'disconnected') {
      // Keep disconnected state for 60s in case of transient reconnect
      localPresenceCache.set(sessionId.toString(), { ...updated, _cachedAt: Date.now() });
      const key = getSessionPresenceKey(sessionId);
      await redisSet(key, updated, { ex: 60 });
      return true;
    }
  }

  localPresenceCache.delete(sessionId.toString());
  const key = getSessionPresenceKey(sessionId);
  await redisDel(key);
  return true;
}

/**
 * Clears local presence cache (used in testing).
 */
export function clearLocalPresenceCache() {
  localPresenceCache.clear();
}
