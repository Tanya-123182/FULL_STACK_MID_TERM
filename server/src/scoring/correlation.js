/**
 * ProctorShield Temporal Correlation Engine
 * Maintains a short in-memory sliding window (10-15s) of recent signals per active session.
 * Correlates multiple weak observations into strong evidence without raw database persistence.
 */

import {
  SIGNAL_WEIGHTS,
  TEMPORAL_WINDOW_MS,
  getSeverityForScore
} from './thresholds.js';
import { redisSet, redisGet, redisDel } from '../config/redis.js';

// In-memory sliding window: Map<sessionId, Array<{ code, timestamp, weight, evidence }>>
const sessionSignalWindows = new Map();

// Window TTL in Redis: 30 seconds (sufficient buffer over 10-15s window)
export const TEMPORAL_WINDOW_REDIS_TTL_SECONDS = 30;

/**
 * Returns Redis key for a session's temporal signal window.
 *
 * @param {string} sessionId
 * @returns {string}
 */
export function getSessionWindowKey(sessionId) {
  return `ps:session:${sessionId}:window`;
}

/**
 * Adds validated signals to a session's temporal sliding window and purges expired entries.
 * Updates both local in-memory window and Redis temporary state with TTL.
 *
 * @param {string} sessionId
 * @param {Array<Object>} newSignals
 * @returns {Array<Object>} Active signals currently inside the temporal window
 */
export function addSignalsToWindow(sessionId, newSignals = []) {
  const now = Date.now();
  const cutoff = now - TEMPORAL_WINDOW_MS;

  // Retrieve existing window or initialize
  let currentWindow = sessionSignalWindows.get(sessionId) || [];

  // Filter out signals that fell out of the temporal window
  currentWindow = currentWindow.filter(sig => sig.timestamp >= cutoff);

  // Append validated incoming signals with server-calculated weights
  for (const sig of newSignals) {
    const weight = SIGNAL_WEIGHTS[sig.code] ?? 0;
    currentWindow.push({
      code: sig.code,
      timestamp: typeof sig.timestamp === 'number' && sig.timestamp <= now && sig.timestamp >= cutoff ? sig.timestamp : now,
      weight,
      evidence: sig.evidence || {}
    });
  }

  sessionSignalWindows.set(sessionId, currentWindow);

  // Asynchronously synchronize window state to Redis with short TTL
  const windowKey = getSessionWindowKey(sessionId);
  redisSet(windowKey, currentWindow, { ex: TEMPORAL_WINDOW_REDIS_TTL_SECONDS }).catch(() => {});

  return currentWindow;
}

/**
 * Calculates correlated score, severity, and aggregated evidence from the active window.
 *
 * @param {Array<Object>} activeSignals
 * @returns {{ score: number, severity: string, uniqueCodes: string[], dominantCode: string }}
 */
export function calculateCorrelatedScore(activeSignals = []) {
  if (!activeSignals || activeSignals.length === 0) {
    return {
      score: 0,
      severity: 'low',
      uniqueCodes: [],
      dominantCode: null
    };
  }

  // Correlate unique signals within the window to prevent single-event amplification
  const uniqueCodeMap = new Map();

  for (const sig of activeSignals) {
    if (!uniqueCodeMap.has(sig.code)) {
      uniqueCodeMap.set(sig.code, sig);
    }
  }

  let totalScore = 0;
  const uniqueCodes = [];
  let dominantCode = null;
  let maxWeight = -1;

  for (const [code, sig] of uniqueCodeMap.entries()) {
    uniqueCodes.push(code);
    totalScore += sig.weight;

    if (sig.weight > maxWeight) {
      maxWeight = sig.weight;
      dominantCode = code;
    }
  }

  const severity = getSeverityForScore(totalScore);

  return {
    score: totalScore,
    severity,
    uniqueCodes,
    dominantCode
  };
}

/**
 * Clears the temporal signal window for a given session (e.g., when the exam ends or candidate leaves).
 *
 * @param {string} sessionId
 */
export function clearSessionWindow(sessionId) {
  sessionSignalWindows.delete(sessionId);
  const windowKey = getSessionWindowKey(sessionId);
  redisDel(windowKey).catch(() => {});
}

/**
 * Retrieves the current raw window for debugging/inspection.
 *
 * @param {string} sessionId
 * @returns {Array<Object>}
 */
export function getSessionWindow(sessionId) {
  return sessionSignalWindows.get(sessionId) || [];
}

