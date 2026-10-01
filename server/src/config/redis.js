/**
 * ProctorShield Redis Client Module
 * Manages connection to Upstash Cloud Redis using @upstash/redis.
 * Provides resilient fallback, graceful degradation, and health inspection.
 */

import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient = null;
let lastPingResult = null;
let lastPingTime = 0;
const PING_CACHE_TTL_MS = 5000;

/**
 * Initializes and returns the singleton Upstash Redis client.
 * Does not throw if credentials are missing or invalid; returns null.
 *
 * @returns {Redis|null}
 */
export function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  try {
    redisClient = new Redis({
      url,
      token,
      retry: {
        retries: 2,
        backoff: (retryCount) => Math.exp(retryCount) * 50
      }
    });
    return redisClient;
  } catch (err) {
    console.warn('[Redis] Failed to initialize Upstash Redis client:', err.message);
    return null;
  }
}

/**
 * Checks Redis connectivity and returns health status.
 *
 * @returns {Promise<'connected'|'disconnected'|'unavailable'>}
 */
export async function getRedisStatus() {
  const now = Date.now();
  if (lastPingResult && (now - lastPingTime) < PING_CACHE_TTL_MS) {
    return lastPingResult;
  }

  const client = getRedisClient();
  if (!client) {
    lastPingResult = 'unavailable';
    lastPingTime = now;
    return 'unavailable';
  }

  try {
    const pong = await client.ping();
    if (pong === 'PONG' || pong === 'pong' || typeof pong === 'string') {
      lastPingResult = 'connected';
      lastPingTime = now;
      return 'connected';
    }
    lastPingResult = 'disconnected';
    lastPingTime = now;
    return 'disconnected';
  } catch (err) {
    lastPingResult = 'disconnected';
    lastPingTime = now;
    return 'disconnected';
  }
}

/**
 * Checks if Redis is currently connected and operational.
 *
 * @returns {Promise<boolean>}
 */
export async function isRedisAvailable() {
  const status = await getRedisStatus();
  return status === 'connected';
}

/**
 * Safe Redis SET wrapper with JSON serialization, expiration, and in-memory fallback safety.
 *
 * @param {string} key
 * @param {any} value
 * @param {{ ex?: number }} options - ex in seconds
 * @returns {Promise<boolean>} true if written to Redis, false otherwise
 */
export async function redisSet(key, value, options = {}) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (options.ex && Number.isInteger(options.ex)) {
      await client.set(key, serialized, { ex: options.ex });
    } else {
      await client.set(key, serialized);
    }
    return true;
  } catch (err) {
    // Gracefully handle NOPERM or network error
    return false;
  }
}

/**
 * Safe Redis GET wrapper with JSON deserialization.
 *
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function redisGet(key) {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(key);
    if (data === null || data === undefined) return null;
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  } catch (err) {
    return null;
  }
}

/**
 * Safe Redis DEL wrapper.
 *
 * @param {...string} keys
 * @returns {Promise<boolean>}
 */
export async function redisDel(...keys) {
  const client = getRedisClient();
  if (!client || keys.length === 0) return false;

  try {
    await client.del(...keys);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Safe Redis EXPIRE wrapper.
 *
 * @param {string} key
 * @param {number} seconds
 * @returns {Promise<boolean>}
 */
export async function redisExpire(key, seconds) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.expire(key, seconds);
    return true;
  } catch (err) {
    return false;
  }
}
