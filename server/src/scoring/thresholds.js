/**
 * ProctorShield Scoring & Signal Configuration
 * Configurable weights, severity thresholds, temporal window, and debounce parameters.
 */

// Allowlist of legitimate detector signals
export const ALLOWED_SIGNAL_CODES = new Set([
  'DOM_CHANGE',
  'DOM_NODE_SPIKE',
  'FIXED_HIGH_Z_NODE',
  'LARGE_VIEWPORT_COVERAGE',
  'SUSPICIOUS_IFRAME',
  'SHADOW_ROOT_DETECTED',
  'KNOWN_FINGERPRINT',
  'WINDOW_BLUR',
  'WINDOW_FOCUS',
  'VISIBILITY_CHANGE'
]);

// Scoring weights per signal code
export const SIGNAL_WEIGHTS = {
  WINDOW_BLUR: 1,
  WINDOW_FOCUS: 0,
  VISIBILITY_CHANGE: 1,
  DOM_CHANGE: 2,
  DOM_NODE_SPIKE: 3,
  SHADOW_ROOT_DETECTED: 3,
  SUSPICIOUS_IFRAME: 4,
  LARGE_VIEWPORT_COVERAGE: 4,
  FIXED_HIGH_Z_NODE: 5,
  KNOWN_FINGERPRINT: 10
};

// Severity thresholds (0-4: low, 5-9: medium, 10+: high)
export const SEVERITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

export const SEVERITY_RANK = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export function getSeverityForScore(score) {
  if (score >= 10) return SEVERITY_LEVELS.HIGH;
  if (score >= 5) return SEVERITY_LEVELS.MEDIUM;
  return SEVERITY_LEVELS.LOW;
}

// Minimum correlated score required to raise a persistent MongoDB Flag
export const FLAG_CREATION_SCORE_THRESHOLD = 5;

// Temporal correlation sliding window in milliseconds (10–15 seconds)
export const TEMPORAL_WINDOW_MS = 15000;

// Debounce suppression cooldown period in milliseconds (30 seconds)
export const DEBOUNCE_COOLDOWN_MS = 30000;

// Rate limiting & payload guards
export const MAX_SIGNALS_PER_BATCH = 50;
export const MIN_BATCH_INTERVAL_MS = 500;
export const MAX_EVIDENCE_SIZE_BYTES = 16384; // 16 KB max evidence payload
