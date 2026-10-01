/**
 * ProctorShield Fixed / High-Z Overlay Geometry Scanner
 * Periodically inspects candidate elements for overlay geometry, high z-indexes,
 * excessive viewport coverage, unexpected iframes, and accessible shadow roots.
 */

import { getConfig } from './config.js';
import { matchFingerprints } from './fingerprints.js';

let scanIntervalId = null;

/**
 * Starts the periodic overlay geometry scanner.
 */
export function startScanner(baseline, onSignal) {
  stopScanner();

  const config = getConfig();

  const performScan = () => {
    try {
      scanDom(baseline, onSignal, config);
    } catch (err) {
      console.error('Error during detector geometry scan:', err);
    }
  };

  // Run initial scan right away, then on interval
  performScan();
  scanIntervalId = setInterval(performScan, config.SCAN_INTERVAL_MS);
}

/**
 * Executes a single geometry scan pass over active DOM elements.
 */
function scanDom(baseline, onSignal, config) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportArea = viewportWidth * viewportHeight;

  if (viewportArea <= 0) return;

  // We scan top-level children of document.body and relevant positioned elements
  const candidates = getCandidateElements();

  for (const el of candidates) {
    // Skip main application root if it belongs to baseline
    if (el.id === 'root' && baseline?.knownElementIds?.has('root')) {
      continue;
    }

    const rect = el.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Skip elements with 0 width or height (e.g. scripts, meta, display:none)
    if (width <= 0 || height <= 0) continue;

    const computed = window.getComputedStyle(el);
    const position = computed.position;
    const rawZIndex = computed.zIndex;
    const zIndex = rawZIndex === 'auto' ? 0 : parseInt(rawZIndex, 10) || 0;

    const elementArea = width * height;
    const coverage = elementArea / viewportArea;
    const isRightDocked = rect.right >= viewportWidth - 30 && rect.left >= viewportWidth / 2;

    const context = {
      position,
      zIndex,
      coverage,
      width,
      height,
      isRightDocked
    };

    const tag = el.tagName.toLowerCase();
    const elId = el.id || null;
    const className = el.className || null;

    // 1. Check for Fixed / Absolute High-Z Node
    if ((position === 'fixed' || position === 'absolute') && zIndex >= config.HIGH_Z_INDEX_THRESHOLD) {
      onSignal({
        code: 'FIXED_HIGH_Z_NODE',
        source: 'geometry-scanner',
        elementTag: tag,
        elementId: elId,
        className,
        position,
        zIndex,
        width,
        height,
        evidence: {
          position,
          zIndex,
          width: Math.round(width),
          height: Math.round(height),
          top: Math.round(rect.top),
          left: Math.round(rect.left)
        }
      });
    }

    // 2. Check for Large Viewport Coverage
    if (
      (position === 'fixed' || position === 'absolute') &&
      coverage >= config.LARGE_COVERAGE_THRESHOLD &&
      width >= config.LARGE_OVERLAY_WIDTH_THRESHOLD
    ) {
      onSignal({
        code: 'LARGE_VIEWPORT_COVERAGE',
        source: 'geometry-scanner',
        elementTag: tag,
        elementId: elId,
        className,
        position,
        zIndex,
        width,
        height,
        viewportCoverage: coverage,
        evidence: {
          coverage: Number(coverage.toFixed(3)),
          width: Math.round(width),
          height: Math.round(height),
          viewportWidth,
          viewportHeight
        }
      });
    }

    // 3. Check for Accessible Shadow DOM
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
          note: 'Accessible open shadow root active on host element'
        }
      });
    }

    // 4. Check for Fingerprint Matches
    const matches = matchFingerprints(el, context);
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

  // 5. Iframe Scanner (detect newly introduced iframes not in baseline)
  scanIframes(baseline, onSignal);
}

/**
 * Gathers candidate elements to inspect without expensive full-DOM deep traversal.
 */
function getCandidateElements() {
  const elements = new Set();

  // Top-level children of body
  for (let i = 0; i < document.body.children.length; i++) {
    elements.add(document.body.children[i]);
  }

  // Query fixed/absolute elements directly
  try {
    const fixedElements = document.querySelectorAll('[style*="fixed"], [style*="absolute"], [class*="overlay"], [class*="modal"]');
    for (let i = 0; i < fixedElements.length; i++) {
      elements.add(fixedElements[i]);
    }
  } catch {
    // Ignored
  }

  return Array.from(elements);
}

/**
 * Inspects all iframes currently attached to document.
 */
function scanIframes(baseline, onSignal) {
  const iframes = document.querySelectorAll('iframe');
  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const srcKey = iframe.src || 'blank';

    if (!baseline?.knownIframeSrcs?.has(srcKey)) {
      const rect = iframe.getBoundingClientRect();
      const style = window.getComputedStyle(iframe);
      onSignal({
        code: 'SUSPICIOUS_IFRAME',
        source: 'iframe-detector',
        elementTag: 'iframe',
        elementId: iframe.id || null,
        className: iframe.className || null,
        width: rect.width,
        height: rect.height,
        evidence: {
          srcOrigin: getSafeOrigin(iframe.src),
          hasSandbox: iframe.hasAttribute('sandbox'),
          position: style.position,
          zIndex: style.zIndex !== 'auto' ? parseInt(style.zIndex, 10) : 0,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });
    }
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
 * Stops the periodic scanner interval.
 */
export function stopScanner() {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
}
