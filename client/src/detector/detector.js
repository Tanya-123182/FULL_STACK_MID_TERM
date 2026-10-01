/**
 * ProctorShield Core Detection Engine Lifecycle Controller
 * Coordinates baseline capture, MutationObserver, geometry scanner,
 * fingerprint matcher, and periodic batcher during active exam sessions.
 */

import { addSignal, clearSignals, getSignalCount, getRecentSignals, subscribeToSignals } from './signals.js';
import { startObservers, stopObservers } from './observers.js';
import { startScanner, stopScanner } from './scanner.js';
import { startBatcher, stopBatcher, getPendingBatchCount, clearBatchQueue } from './batcher.js';

let detectorState = {
  status: 'INACTIVE', // 'ACTIVE' | 'INACTIVE'
  sessionId: null,
  startedAt: null,
  baseline: null,
  signalsDetectedCount: 0,
  lastSignalTime: null,
  lastSignalCode: null
};

let statusSubscribers = new Set();
let unsubscribeSignals = null;

/**
 * Captures a lightweight document baseline at session start.
 * Does NOT store full DOM or HTML snapshots.
 */
function captureBaseline() {
  const iframes = Array.from(document.querySelectorAll('iframe'));
  const allElements = document.querySelectorAll('*');

  // Collect top-level application IDs to distinguish legit app UI
  const knownIds = new Set();
  const elementsWithId = document.querySelectorAll('[id]');
  for (let i = 0; i < elementsWithId.length; i++) {
    knownIds.add(elementsWithId[i].id);
  }

  const knownIframeSrcs = new Set();
  for (const iframe of iframes) {
    knownIframeSrcs.add(iframe.src || 'blank');
  }

  return {
    startedAt: Date.now(),
    initialNodeCount: allElements.length,
    initialBodyChildren: document.body ? document.body.children.length : 0,
    initialIframeCount: iframes.length,
    knownElementIds: knownIds,
    knownIframeSrcs: knownIframeSrcs
  };
}

/**
 * Starts the detector for an active candidate exam session.
 */
export function startDetector(sessionId, options = {}) {
  if (!sessionId) {
    console.warn('[ProctorShield Detector] Cannot start without a valid sessionId');
    return false;
  }

  // If already running for this session, do not duplicate
  if (detectorState.status === 'ACTIVE' && detectorState.sessionId === sessionId) {
    return true;
  }

  // Clean shutdown of any previous instance
  stopDetector();

  console.log(`[ProctorShield Detector] Initializing integrity detection for session: ${sessionId}`);

  const baseline = captureBaseline();

  detectorState = {
    status: 'ACTIVE',
    sessionId,
    startedAt: Date.now(),
    baseline,
    signalsDetectedCount: 0,
    lastSignalTime: null,
    lastSignalCode: null
  };

  // Signal handler callback passes through deduplication and local queue
  const handleDetectorSignal = (signalInput) => {
    if (detectorState.status !== 'ACTIVE') return;

    const queued = addSignal(signalInput);
    if (queued) {
      detectorState.signalsDetectedCount++;
      detectorState.lastSignalTime = Date.now();
      detectorState.lastSignalCode = signalInput.code;
      notifyStatusSubscribers();
    }
  };

  // Subscribe to signal updates to keep state synced
  unsubscribeSignals = subscribeToSignals(() => {
    notifyStatusSubscribers();
  });

  // Start components
  startObservers(baseline, handleDetectorSignal);
  startScanner(baseline, handleDetectorSignal);
  startBatcher(sessionId, (batch) => {
    notifyStatusSubscribers();
    if (typeof options.onBatch === 'function') {
      try {
        options.onBatch(batch);
      } catch (e) {
        console.error('Error in onBatch callback:', e);
      }
    }
  });

  notifyStatusSubscribers();
  return true;
}

/**
 * Stops the detector, cleans up all listeners, observers, and timers.
 * Prevents memory leaks.
 */
export function stopDetector() {
  if (detectorState.status === 'INACTIVE') {
    return;
  }

  console.log('[ProctorShield Detector] Stopping detection engine and releasing observers');

  stopObservers();
  stopScanner();
  stopBatcher();

  if (unsubscribeSignals) {
    unsubscribeSignals();
    unsubscribeSignals = null;
  }

  clearSignals();
  clearBatchQueue();

  detectorState = {
    status: 'INACTIVE',
    sessionId: null,
    startedAt: null,
    baseline: null,
    signalsDetectedCount: 0,
    lastSignalTime: null,
    lastSignalCode: null
  };

  notifyStatusSubscribers();
}

/**
 * Returns current detector status and telemetry summary.
 */
export function getDetectorStatus() {
  return {
    ...detectorState,
    pendingSignalCount: getSignalCount(),
    pendingBatchCount: getPendingBatchCount(),
    recentSignals: getRecentSignals()
  };
}

/**
 * Subscribes a callback to detector status updates.
 */
export function subscribeToDetector(callback) {
  statusSubscribers.add(callback);
  // Initial call with current state
  try {
    callback(getDetectorStatus());
  } catch (e) {
    // Ignored
  }
  return () => {
    statusSubscribers.delete(callback);
  };
}

function notifyStatusSubscribers() {
  const currentStatus = getDetectorStatus();
  for (const sub of statusSubscribers) {
    try {
      sub(currentStatus);
    } catch (e) {
      console.error('Error in detector subscriber:', e);
    }
  }
}
