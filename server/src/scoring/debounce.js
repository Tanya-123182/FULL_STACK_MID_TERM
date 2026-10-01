/**
 * ProctorShield Debouncing & Incident Cooldown Engine
 * Prevents identical, repeated flags from spamming the system during persistent suspicious incidents.
 */

import { DEBOUNCE_COOLDOWN_MS, SIGNAL_WEIGHTS } from './thresholds.js';
import { redisSet, redisGet, redisDel } from '../config/redis.js';

// In-memory debounce state: Map<sessionId, Map<signature, lastRaisedTimestamp>>
const sessionDebounceState = new Map();

/**
 * Returns the Redis key for a session incident debounce.
 *
 * @param {string} sessionId
 * @param {string} signature
 * @returns {string}
 */
export function getDebounceRedisKey(sessionId, signature) {
  // Sanitize signature for key storage
  const safeSig = signature.replace(/[^a-zA-Z0-9_+:-]/g, '_');
  return `ps:session:${sessionId}:debounce:${safeSig}`;
}

/**
 * Generates a stable conceptual signature for an incident based on the flag code
 * and high-impact contributing detector signals.
 *
 * Example: "SUSPICIOUS_OVERLAY:FIXED_HIGH_Z_NODE+KNOWN_FINGERPRINT"
 *
 * @param {string} flagCode
 * @param {string[]} signalCodes
 * @returns {string}
 */
export function generateIncidentSignature(flagCode, signalCodes = []) {
  // Filter for significant signals (weight >= 3) to keep signatures stable across minor DOM noise
  const significant = signalCodes.filter(c => (SIGNAL_WEIGHTS[c] ?? 0) >= 3);
  const coreCodes = significant.length > 0 ? significant : signalCodes;
  const sortedCodes = [...new Set(coreCodes)].sort();

  return `${flagCode}:${sortedCodes.join('+')}`;
}

/**
 * Evaluates whether a flag with this signature should be suppressed under the cooldown window.
 * Checks both local process memory and Redis state with TTL.
 *
 * @param {string} sessionId
 * @param {string} signature
 * @param {number} cooldownMs
 * @returns {boolean} true if suppressed, false if allowed (and updates the cooldown timestamp)
 */
export function shouldSuppressFlag(sessionId, signature, cooldownMs = DEBOUNCE_COOLDOWN_MS) {
  const now = Date.now();

  let sessionSignatures = sessionDebounceState.get(sessionId);
  if (!sessionSignatures) {
    sessionSignatures = new Map();
    sessionDebounceState.set(sessionId, sessionSignatures);
  }

  const lastRaised = sessionSignatures.get(signature);

  if (lastRaised && (now - lastRaised) < cooldownMs) {
    // Within local cooldown period: suppress flag creation
    return true;
  }

  // Not in local cooldown: register timestamp in local state
  sessionSignatures.set(signature, now);

  // Synchronize with Redis with TTL
  const ttlSeconds = Math.ceil(cooldownMs / 1000);
  const redisKey = getDebounceRedisKey(sessionId, signature);
  redisSet(redisKey, { raisedAt: now, signature }, { ex: ttlSeconds }).catch(() => {});

  return false;
}

/**
 * Clears debounce state for a session when it concludes.
 *
 * @param {string} sessionId
 */
export function clearSessionDebounce(sessionId) {
  sessionDebounceState.delete(sessionId);
}

