/**
 * ProctorShield Signal Batcher
 * Compiles local signals into periodic 2-3 second batches ready for network transmission.
 * Decouples DOM event generation from network transmission.
 */

import { getConfig } from './config.js';
import { flushPendingSignals } from './signals.js';

let batchIntervalId = null;
let currentSessionId = null;
let batchCallback = null;
let batchQueue = []; // Holds generated batches ready for Socket.IO consumption in Step 8

/**
 * Starts periodic compilation of pending signals into batches.
 */
export function startBatcher(sessionId, onBatchReady = null) {
  stopBatcher();

  currentSessionId = sessionId;
  batchCallback = onBatchReady;
  const config = getConfig();

  batchIntervalId = setInterval(() => {
    compileBatch();
  }, config.BATCH_INTERVAL_MS);
}

/**
 * Compiles all currently pending signals into a structured batch object.
 */
function compileBatch() {
  const pending = flushPendingSignals();
  if (!pending || pending.length === 0) {
    return null; // No signals to compile this cycle
  }

  const batch = {
    batchId: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sessionId: currentSessionId,
    generatedAt: Date.now(),
    signalCount: pending.length,
    signals: pending
  };

  batchQueue.push(batch);

  // Keep a maximum of 50 unconsumed batches in memory
  if (batchQueue.length > 50) {
    batchQueue.shift();
  }

  if (typeof batchCallback === 'function') {
    try {
      batchCallback(batch);
    } catch (e) {
      console.error('Error invoking batch callback:', e);
    }
  }

  return batch;
}

/**
 * Retrieves and dequeues the oldest compiled batch (for consumers).
 */
export function getNextBatch() {
  return batchQueue.shift() || null;
}

/**
 * Returns all compiled batches currently waiting in memory.
 */
export function getPendingBatches() {
  return [...batchQueue];
}

/**
 * Returns the count of waiting batches in memory.
 */
export function getPendingBatchCount() {
  return batchQueue.length;
}

/**
 * Stops the batching timer and clears session state.
 */
export function stopBatcher() {
  if (batchIntervalId) {
    clearInterval(batchIntervalId);
    batchIntervalId = null;
  }
  currentSessionId = null;
  batchCallback = null;
}

/**
 * Completely clears the batch queue.
 */
export function clearBatchQueue() {
  batchQueue = [];
}
