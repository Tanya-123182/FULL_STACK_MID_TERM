/**
 * ProctorShield DOM Mutation Observer & Event Listeners
 * Observes DOM mutations with windowed spike aggregation, inspects added HTMLElements,
 * and tracks window focus and document visibility events.
 */

import { getConfig } from './config.js';
import { matchFingerprints } from './fingerprints.js';

let mutationObserver = null;
let mutationBatchTimer = null;
let activeWindowStats = {
  addedNodes: 0,
  removedNodes: 0,
  mutationCount: 0,
  sampleTypes: new Set(),
  startTime: 0
};

// Event listener references for clean removal
let blurHandler = null;
let focusHandler = null;
let visibilityHandler = null;

/**
 * Starts the MutationObserver and browser focus/visibility listeners.
 */
export function startObservers(baseline, onSignal) {
  stopObservers(); // Ensure clean slate

  const config = getConfig();

  // 1. Initialize MutationObserver
  mutationObserver = new MutationObserver((mutations) => {
    handleMutations(mutations, baseline, onSignal, config);
  });

  try {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'id', 'hidden', 'role']
    });
  } catch (err) {
    console.error('Failed to bind MutationObserver to document.body:', err);
  }

  // 2. Window Focus & Blur Listeners
  blurHandler = () => {
    onSignal({
      code: 'WINDOW_BLUR',
      source: 'visibility',
      evidence: {
        timestamp: Date.now(),
        reason: 'Window lost input focus'
      }
    });
  };

  focusHandler = () => {
    onSignal({
      code: 'WINDOW_FOCUS',
      source: 'visibility',
      evidence: {
        timestamp: Date.now(),
        reason: 'Window regained input focus'
      }
    });
  };

  visibilityHandler = () => {
    onSignal({
      code: 'VISIBILITY_CHANGE',
      source: 'visibility',
      evidence: {
        state: document.visibilityState,
        timestamp: Date.now()
      }
    });
  };

  window.addEventListener('blur', blurHandler);
  window.addEventListener('focus', focusHandler);
  document.addEventListener('visibilitychange', visibilityHandler);
}

/**
 * Processes incoming mutations and handles windowed aggregation to prevent flooding.
 */
function handleMutations(mutations, baseline, onSignal, config) {
  const now = Date.now();

  if (activeWindowStats.startTime === 0) {
    activeWindowStats.startTime = now;
  }

  for (const m of mutations) {
    activeWindowStats.mutationCount++;
    activeWindowStats.sampleTypes.add(m.type);

    if (m.type === 'childList') {
      activeWindowStats.addedNodes += m.addedNodes.length;
      activeWindowStats.removedNodes += m.removedNodes.length;

      // Inspect newly added elements immediately for critical signatures
      for (let i = 0; i < m.addedNodes.length; i++) {
        const node = m.addedNodes[i];
        if (node.nodeType === Node.ELEMENT_NODE) {
          inspectAddedElement(node, baseline, onSignal);
        }
      }
    }
  }

  // Debounced/windowed aggregation for mutation reporting
  if (!mutationBatchTimer) {
    mutationBatchTimer = setTimeout(() => {
      flushMutationWindow(onSignal, config);
    }, config.MUTATION_WINDOW_MS);
  }
}

/**
 * Flushes accumulated mutation stats at the end of the window.
 * Distinguishes between rapid node injection spikes and isolated changes.
 */
function flushMutationWindow(onSignal, config) {
  mutationBatchTimer = null;
  const elapsed = Date.now() - activeWindowStats.startTime;

  if (activeWindowStats.mutationCount === 0) {
    resetWindowStats();
    return;
  }

  if (activeWindowStats.addedNodes >= config.NODE_SPIKE_THRESHOLD) {
    // Rapid node spike detected
    onSignal({
      code: 'DOM_NODE_SPIKE',
      source: 'mutation-observer',
      evidence: {
        addedNodes: activeWindowStats.addedNodes,
        removedNodes: activeWindowStats.removedNodes,
        mutationCount: activeWindowStats.mutationCount,
        windowMs: elapsed
      }
    });
  } else {
    // Ordinary isolated DOM modification
    onSignal({
      code: 'DOM_CHANGE',
      source: 'mutation-observer',
      evidence: {
        mutationType: Array.from(activeWindowStats.sampleTypes).join(','),
        addedNodes: activeWindowStats.addedNodes,
        removedNodes: activeWindowStats.removedNodes,
        mutationCount: activeWindowStats.mutationCount
      }
    });
  }

  resetWindowStats();
}

function resetWindowStats() {
  activeWindowStats = {
    addedNodes: 0,
    removedNodes: 0,
    mutationCount: 0,
    sampleTypes: new Set(),
    startTime: 0
  };
}

/**
 * Inspects individual newly added HTMLElements for accessible overlay signatures.
 */
function inspectAddedElement(el, baseline, onSignal) {
  if (!el || !(el instanceof HTMLElement)) return;

  const tag = el.tagName.toLowerCase();
  const elId = el.id || null;
  const className = el.className || null;

  // Check for accessible Shadow DOM
  if (el.shadowRoot) {
    onSignal({
      code: 'SHADOW_ROOT_DETECTED',
      source: 'shadow-dom-detector',
      elementTag: tag,
      elementId: elId,
      className,
      evidence: {
        hostTag: tag,
        hostId: elId,
        shadowMode: el.shadowRoot.mode || 'open',
        note: 'Accessible open shadow root detected on newly inserted element'
      }
    });
  }

  // Check for newly introduced IFRAME
  if (tag === 'iframe' || el.querySelector('iframe')) {
    const iframeEl = tag === 'iframe' ? el : el.querySelector('iframe');
    const isKnown = baseline?.knownIframeSrcs?.has(iframeEl.src || 'blank');
    if (!isKnown) {
      onSignal({
        code: 'SUSPICIOUS_IFRAME',
        source: 'iframe-detector',
        elementTag: 'iframe',
        evidence: {
          srcOrigin: getSafeOrigin(iframeEl.src),
          hasSandbox: iframeEl.hasAttribute('sandbox'),
          reason: 'Iframe introduced after baseline recording'
        }
      });
    }
  }

  // Quick initial fingerprint match on the newly inserted element
  const matches = matchFingerprints(el);
  for (const match of matches) {
    onSignal({
      code: 'KNOWN_FINGERPRINT',
      source: 'fingerprint',
      elementTag: tag,
      elementId: elId,
      className,
      fingerprint: match.fingerprint,
      evidence: {
        fingerprint: match.fingerprint,
        confidence: match.confidence,
        matchedCharacteristics: match.matchedCharacteristics
      }
    });
  }
}

function getSafeOrigin(src) {
  if (!src) return 'inline/blank';
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return 'unparseable';
  }
}

/**
 * Stops MutationObserver and tears down all event listeners.
 */
export function stopObservers() {
  if (mutationObserver) {
    try {
      mutationObserver.disconnect();
    } catch (e) {
      // Ignored
    }
    mutationObserver = null;
  }

  if (mutationBatchTimer) {
    clearTimeout(mutationBatchTimer);
    mutationBatchTimer = null;
  }

  resetWindowStats();

  if (blurHandler) {
    window.removeEventListener('blur', blurHandler);
    blurHandler = null;
  }
  if (focusHandler) {
    window.removeEventListener('focus', focusHandler);
    focusHandler = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}
