import { getDBStatus } from '../config/database.js';
import { getRedisStatus } from '../config/redis.js';
import { metricsCollector } from '../monitoring/metrics.js';
import { getIO } from '../realtime/socket.js';

export const getHealth = async (req, res) => {
  const dbStatus = getDBStatus();
  const isDbConnected = dbStatus === 'connected';
  const redisStatus = await getRedisStatus();

  // The service is OK if primary database is connected; degraded if Redis is down
  const overallStatus = isDbConnected ? (redisStatus === 'connected' ? 'ok' : 'degraded') : 'degraded';

  const responseBody = {
    status: overallStatus,
    database: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString()
  };

  return res.status(isDbConnected ? 200 : 503).json(responseBody);
};

export const getMetrics = (req, res) => {
  const io = getIO();
  const stats = metricsCollector.getMetrics(io);
  return res.status(200).json(stats);
};


