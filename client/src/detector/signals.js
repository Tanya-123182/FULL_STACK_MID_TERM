/**
 * ProctorShield Signal Normalization & Local Queue
 * Provides uniform signal formatting, privacy-safe evidence sanitization,
 * local deduplication/debouncing, and in-memory signal queuing.
 */

import { getConfig } from './config.js';

// Internal in-memory queues and buffers
let pendingSignals = [];
let recentSignals = [];
let dedupMap = new Map(); // key -> lastEmittedTimestamp
let subscribers = new Set();

/**
 * Creates a normalized signal object conforming to the ProctorShield signal format.
 * Strictly avoids capturing full DOM snapshots, candidate inputs, or exam text.
 */
export function createSignal({
  code,
  source = 'detector',
  evidence = {},
  elementTag = null,
  elementId = null,
  className = null,
  position = null,
  zIndex = null,
  width = null,
  height = null,
  viewportCoverage = null,
  mutationType = null,
  fingerprint = null
}) {
  const signal = {
    id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    code,
    timestamp: Date.now(),
    source,
    evidence: { ...evidence }
  };

  if (elementTag) signal.elementTag = String(elementTag).toLowerCase();
  if (elementId) signal.elementId = String(elementId);
  if (className) signal.className = String(className).substring(0, 100);
  if (position) signal.position = String(position);
  if (zIndex !== null && zIndex !== undefined) signal.zIndex = Number(zIndex);
  if (width !== null && width !== undefined) signal.width = Math.round(Number(width));
  if (height !== null && height !== undefined) signal.height = Math.round(Number(height));
  if (viewportCoverage !== null && viewportCoverage !== undefined) {
    signal.viewportCoverage = Number(Number(viewportCoverage).toFixed(3));
  }
  if (mutationType) signal.mutationType = String(mutationType);
  if (fingerprint) signal.fingerprint = String(fingerprint);

  return signal;
}

/**
 * Generates a stable key for deduplication based on signal code, element identity, and core geometry.
 */
function getSignalDedupKey(signal) {
  const elKey = `${signal.elementTag || ''}#${signal.elementId || ''}.${signal.className || ''}`;
  const posKey = signal.position ? `${signal.position}:${signal.zIndex || 0}` : '';
  const fpKey = signal.fingerprint || '';
  return `${signal.code}::${signal.source}::${elKey}::${posKey}::${fpKey}`;
}

/**
 * Evaluates whether a signal should be suppressed based on recent identical occurrences.
 */
function shouldSuppressDuplicate(signal) {
  const config = getConfig();
  const now = Date.now();
  const key = getSignalDedupKey(signal);

  const lastSeen = dedupMap.get(key);
  if (lastSeen && (now - lastSeen) < config.SIGNAL_DEDUP_WINDOW_MS) {
    return true; // Duplicate within dedup window
  }

  // Update or set last seen timestamp
  dedupMap.set(key, now);

  // Evict old entries from dedupMap to prevent memory growth
  if (dedupMap.size > 200) {
    for (const [k, timestamp] of dedupMap.entries()) {
      if (now - timestamp > config.SIGNAL_DEDUP_WINDOW_MS * 2) {
        dedupMap.delete(k);
      }
    }
  }

  return false;
}

/**
 * Enqueues a signal if not suppressed by deduplication.
 * Returns true if signal was queued, false if suppressed as duplicate.
 */
export function addSignal(signalInput) {
  const signal = signalInput.id ? signalInput : createSignal(signalInput);

  if (shouldSuppressDuplicate(signal)) {
    return false;
  }

  pendingSignals.push(signal);

  // Maintain recent signals for debug inspection
  const config = getConfig();
  recentSignals.unshift(signal);
  if (recentSignals.length > config.MAX_RECENT_SIGNALS) {
    recentSignals.pop();
  }

  // Notify subscribers (e.g. dev debug panel)
  notifySubscribers(signal);
  return true;
}

/**
 * Returns pending signals ready for batching without clearing them.
 */
export function getPendingSignals() {
  return [...pendingSignals];
}

/**
 * Clears and returns all pending signals (used by the batcher).
 */
export function flushPendingSignals() {
  const signals = pendingSignals;
  pendingSignals = [];
  return signals;
}

/**
 * Completely clears all queues and dedup history (e.g. on detector stop).
 */
export function clearSignals() {
  pendingSignals = [];
  recentSignals = [];
  dedupMap.clear();
}

/**
 * Returns the count of currently pending signals in the queue.
 */
export function getSignalCount() {
  return pendingSignals.length;
}

/**
 * Returns recent signals (for debug panel inspection).
 */
export function getRecentSignals() {
  return [...recentSignals];
}

/**
 * Subscribes a listener to new signal events.
 * Returns an unsubscribe function.
 */
export function subscribeToSignals(callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function notifySubscribers(signal) {
  for (const callback of subscribers) {
    try {
      callback(signal);
    } catch (e) {
      console.error('Error notifying signal subscriber:', e);
    }
  }
}
