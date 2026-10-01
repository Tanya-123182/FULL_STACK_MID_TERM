/**
 * ProctorShield Lightweight Observability & Metrics Module
 * Tracks high-throughput aggregate counters in memory without expensive database logging.
 */

let startTime = Date.now();

const metrics = {
  activeConnections: 0,
  totalConnections: 0,
  disconnections: 0,
  batchesProcessed: 0,
  signalsProcessed: 0,
  heartbeatsReceived: 0,
  flagsCreated: 0,
  suppressedDebounces: 0,
  errors: {
    mongo: 0,
    redis: 0,
    socket: 0,
    auth: 0
  }
};

export const metricsCollector = {
  increment(key, amount = 1) {
    if (typeof metrics[key] === 'number') {
      metrics[key] += amount;
    }
  },

  decrement(key, amount = 1) {
    if (typeof metrics[key] === 'number') {
      metrics[key] = Math.max(0, metrics[key] - amount);
    }
  },

  recordError(type = 'socket') {
    if (metrics.errors[type] !== undefined) {
      metrics.errors[type]++;
    } else {
      metrics.errors.socket++;
    }
  },

  getMetrics(io = null) {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const activeSockets = io ? io.engine?.clientsCount || metrics.activeConnections : metrics.activeConnections;

    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      connections: {
        active: activeSockets,
        total: metrics.totalConnections,
        disconnected: metrics.disconnections
      },
      throughput: {
        batchesProcessed: metrics.batchesProcessed,
        signalsProcessed: metrics.signalsProcessed,
        heartbeatsReceived: metrics.heartbeatsReceived,
        flagsCreated: metrics.flagsCreated,
        suppressedDebounces: metrics.suppressedDebounces
      },
      errors: metrics.errors,
      system: {
        heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: +(mem.heapTotal / 1024 / 1024).toFixed(2),
        rssMB: +(mem.rss / 1024 / 1024).toFixed(2),
        cpuUserSec: +(cpu.user / 1000000).toFixed(2),
        cpuSystemSec: +(cpu.system / 1000000).toFixed(2)
      },
      timestamp: new Date().toISOString()
    };
  },

  reset() {
    startTime = Date.now();
    metrics.activeConnections = 0;
    metrics.totalConnections = 0;
    metrics.disconnections = 0;
    metrics.batchesProcessed = 0;
    metrics.signalsProcessed = 0;
    metrics.heartbeatsReceived = 0;
    metrics.flagsCreated = 0;
    metrics.suppressedDebounces = 0;
    metrics.errors.mongo = 0;
    metrics.errors.redis = 0;
    metrics.errors.socket = 0;
    metrics.errors.auth = 0;
  }
};
