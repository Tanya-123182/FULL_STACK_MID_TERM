/**
 * ProctorShield Detection Engine Configuration
 * Configurable thresholds and timing parameters for DOM integrity detection.
 */

export const DEFAULT_CONFIG = {
  // Time window in ms to aggregate rapid DOM mutations (spike detection)
  MUTATION_WINDOW_MS: 1000,

  // Threshold of added nodes within MUTATION_WINDOW_MS to flag a DOM spike
  NODE_SPIKE_THRESHOLD: 20,

  // Periodic geometry and DOM scanner interval in ms
  SCAN_INTERVAL_MS: 2000,

  // Z-index threshold above which fixed/absolute elements are considered high-z
  HIGH_Z_INDEX_THRESHOLD: 10000,

  // Ratio of element area to viewport area considered suspicious for an overlay
  LARGE_COVERAGE_THRESHOLD: 0.15,

  // Minimum width (px) for an overlay to trigger large coverage warning
  LARGE_OVERLAY_WIDTH_THRESHOLD: 250,

  // Time window in ms to suppress duplicate identical signals
  SIGNAL_DEDUP_WINDOW_MS: 3000,

  // Interval in ms at which collected signals are compiled into a batch
  BATCH_INTERVAL_MS: 2500,

  // Maximum number of recent signals to keep in local memory buffer
  MAX_RECENT_SIGNALS: 50
};

let currentConfig = { ...DEFAULT_CONFIG };

export const getConfig = () => ({ ...currentConfig });

export const updateConfig = (overrides = {}) => {
  currentConfig = {
    ...currentConfig,
    ...overrides
  };
  return getConfig();
};

export const resetConfig = () => {
  currentConfig = { ...DEFAULT_CONFIG };
  return getConfig();
};
