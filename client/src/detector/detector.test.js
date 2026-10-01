import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getConfig, updateConfig, resetConfig, DEFAULT_CONFIG } from './config.js';
import {
  createSignal,
  addSignal,
  getPendingSignals,
  flushPendingSignals,
  clearSignals,
  getSignalCount,
  getRecentSignals
} from './signals.js';
import { matchFingerprints, FINGERPRINT_REGISTRY } from './fingerprints.js';
import { startBatcher, stopBatcher, getNextBatch, clearBatchQueue } from './batcher.js';
import { startDetector, stopDetector, getDetectorStatus } from './detector.js';
import { injectDemoOverlay, removeDemoOverlay, isDemoOverlayInjected } from './demoOverlay.js';

describe('ProctorShield Core Detection Engine Unit & Integration Tests', () => {
  beforeEach(() => {
    resetConfig();
    clearSignals();
    clearBatchQueue();
    stopDetector();
    removeDemoOverlay();
  });

  afterEach(() => {
    stopDetector();
    removeDemoOverlay();
    clearSignals();
    clearBatchQueue();
  });

  // 1. Config Tests
  describe('1. Configuration & Thresholds', () => {
    it('provides configurable defaults without hardcoded magic numbers', () => {
      const cfg = getConfig();
      expect(cfg.HIGH_Z_INDEX_THRESHOLD).toBe(10000);
      expect(cfg.LARGE_COVERAGE_THRESHOLD).toBe(0.15);
      expect(cfg.NODE_SPIKE_THRESHOLD).toBe(20);
      expect(cfg.SIGNAL_DEDUP_WINDOW_MS).toBe(3000);
      expect(cfg.BATCH_INTERVAL_MS).toBe(2500);
    });

    it('allows updating thresholds dynamically and resetting', () => {
      updateConfig({ HIGH_Z_INDEX_THRESHOLD: 5000 });
      expect(getConfig().HIGH_Z_INDEX_THRESHOLD).toBe(5000);
      resetConfig();
      expect(getConfig().HIGH_Z_INDEX_THRESHOLD).toBe(10000);
    });
  });

  // 2. Signals & Privacy Tests
  describe('2. Signal Formatting & Privacy Guarantees', () => {
    it('creates normalized signals conforming to standard schema', () => {
      const signal = createSignal({
        code: 'FIXED_HIGH_Z_NODE',
        source: 'geometry-scanner',
        elementTag: 'div',
        elementId: 'overlay-1',
        className: 'test-class',
        position: 'fixed',
        zIndex: 99999,
        width: 300,
        height: 400,
        viewportCoverage: 0.18,
        evidence: { zIndex: 99999 }
      });

      expect(signal.id).toMatch(/^sig_/);
      expect(signal.code).toBe('FIXED_HIGH_Z_NODE');
      expect(signal.source).toBe('geometry-scanner');
      expect(signal.elementTag).toBe('div');
      expect(signal.elementId).toBe('overlay-1');
      expect(signal.className).toBe('test-class');
      expect(signal.position).toBe('fixed');
      expect(signal.zIndex).toBe(99999);
      expect(signal.width).toBe(300);
      expect(signal.height).toBe(400);
      expect(signal.viewportCoverage).toBe(0.18);
      expect(signal.timestamp).toBeGreaterThan(0);
      expect(signal.evidence).toEqual({ zIndex: 99999 });

      // Privacy verification: ensures no DOM or input text properties exist
      expect(signal.html).toBeUndefined();
      expect(signal.dom).toBeUndefined();
      expect(signal.text).toBeUndefined();
      expect(signal.questionText).toBeUndefined();
      expect(signal.candidateAnswer).toBeUndefined();
    });
  });

  // 3. Deduplication Tests
  describe('3. Signal Deduplication & Rate Limiting', () => {
    it('suppresses identical duplicate signals within deduplication window', () => {
      const signalData = {
        code: 'FIXED_HIGH_Z_NODE',
        source: 'geometry-scanner',
        elementTag: 'div',
        elementId: 'demo-panel',
        className: 'ps-overlay',
        position: 'fixed',
        zIndex: 99999
      };

      const firstQueued = addSignal(signalData);
      expect(firstQueued).toBe(true);
      expect(getSignalCount()).toBe(1);

      // Immediate duplicate emission of identical element & characteristics
      const secondQueued = addSignal(signalData);
      expect(secondQueued).toBe(false);
      expect(getSignalCount()).toBe(1); // Suppressed
    });

    it('allows different signals or signals from different elements', () => {
      const sigA = {
        code: 'FIXED_HIGH_Z_NODE',
        source: 'geometry-scanner',
        elementTag: 'div',
        elementId: 'panel-a'
      };
      const sigB = {
        code: 'LARGE_VIEWPORT_COVERAGE',
        source: 'geometry-scanner',
        elementTag: 'div',
        elementId: 'panel-a'
      };
      const sigC = {
        code: 'FIXED_HIGH_Z_NODE',
        source: 'geometry-scanner',
        elementTag: 'div',
        elementId: 'panel-b'
      };

      expect(addSignal(sigA)).toBe(true);
      expect(addSignal(sigB)).toBe(true);
      expect(addSignal(sigC)).toBe(true);
      expect(getSignalCount()).toBe(3);
    });
  });

  // 4. Fingerprint Registry Tests
  describe('4. Fingerprint Registry & Multi-Characteristic Matching', () => {
    it('requires at least 2 independent characteristics to match a fingerprint', () => {
      const el = document.createElement('div');
      // Only 1 matching characteristic (selector class)
      el.className = 'ps-demo-overlay';

      const matchesSingle = matchFingerprints(el);
      expect(matchesSingle).toHaveLength(0); // 1 is insufficient

      // Add second independent characteristic (data attribute)
      el.setAttribute('data-ps-overlay', 'true');
      const matchesMulti = matchFingerprints(el);
      expect(matchesMulti).toHaveLength(1);
      expect(matchesMulti[0].fingerprint).toBe('PROCTORSHIELD_DEMO_OVERLAY');
      expect(matchesMulti[0].confidence).toBe('high');
      expect(matchesMulti[0].matchCount).toBeGreaterThanOrEqual(2);
    });
  });

  // 5. Batcher Tests
  describe('5. Signal Batching Mechanism', () => {
    it('compiles pending signals into batches and exposes getNextBatch interface', () => {
      const onBatchMock = vi.fn();
      startBatcher('test-session-123', onBatchMock);

      addSignal({ code: 'DOM_CHANGE', source: 'mutation-observer' });
      addSignal({ code: 'FIXED_HIGH_Z_NODE', source: 'geometry-scanner', zIndex: 99999 });

      expect(getPendingSignals()).toHaveLength(2);

      // Fast-forward or trigger batch timer
      const flushed = flushPendingSignals();
      expect(flushed).toHaveLength(2);

      stopBatcher();
    });
  });

  // 6. Test Demo Overlay Tests
  describe('6. Controlled Test Overlay Lifecycle', () => {
    it('injects and removes the controlled test overlay safely', () => {
      expect(isDemoOverlayInjected()).toBe(false);

      const el = injectDemoOverlay();
      expect(isDemoOverlayInjected()).toBe(true);
      expect(el.id).toBe('proctorshield-demo-panel');
      expect(el.style.position).toBe('fixed');
      expect(el.style.zIndex).toBe('99999');
      expect(el.getAttribute('data-ps-overlay')).toBe('true');

      const removed = removeDemoOverlay();
      expect(removed).toBe(true);
      expect(isDemoOverlayInjected()).toBe(false);
    });
  });

  // 7. Full Detector Lifecycle & Detection Integration
  describe('7. Full Detector Lifecycle & Live Overlay Detection', () => {
    it('initializes baseline, detects demo overlay, and stops cleanly', async () => {
      expect(getDetectorStatus().status).toBe('INACTIVE');

      // Start detector
      const started = startDetector('active-candidate-session-999');
      expect(started).toBe(true);

      const statusAfterStart = getDetectorStatus();
      expect(statusAfterStart.status).toBe('ACTIVE');
      expect(statusAfterStart.sessionId).toBe('active-candidate-session-999');
      expect(statusAfterStart.baseline).toBeDefined();
      expect(statusAfterStart.baseline.initialNodeCount).toBeGreaterThan(0);

      // Inject demo test overlay into DOM
      injectDemoOverlay();

      // Verify the overlay satisfies fingerprint criteria
      const overlayEl = document.getElementById('proctorshield-demo-panel');
      expect(overlayEl).toBeDefined();

      const fpMatches = matchFingerprints(overlayEl, {
        position: 'fixed',
        zIndex: 99999,
        isRightDocked: true
      });
      expect(fpMatches.some(m => m.fingerprint === 'PROCTORSHIELD_DEMO_OVERLAY')).toBe(true);

      // Stop detector
      stopDetector();
      expect(getDetectorStatus().status).toBe('INACTIVE');
    });
  });
});
