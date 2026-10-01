/**
 * ProctorShield High-Concurrency Virtual Candidate Load Simulator
 * Simulates hundreds of simultaneous candidate assessment sessions with realistic
 * jitter, telemetry batches, heartbeats, suspicious event injections, and latency tracking.
 */

import { io as ioClient } from 'socket.io-client';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load server environment
dotenv.config({ path: path.join(__dirname, '../server/.env') });

const ALLOWED_SIGNALS = [
  'DOM_CHANGE',
  'WINDOW_BLUR',
  'VISIBILITY_CHANGE',
  'DOM_NODE_SPIKE',
  'SHADOW_ROOT_DETECTED',
  'SUSPICIOUS_IFRAME',
  'LARGE_VIEWPORT_COVERAGE',
  'FIXED_HIGH_Z_NODE',
  'KNOWN_FINGERPRINT'
];

/**
 * Calculates statistical percentiles from an array of numbers.
 *
 * @param {number[]} values
 * @returns {{ min: number, max: number, avg: number, p50: number, p95: number, p99: number }}
 */
export function calculateStats(values = []) {
  if (!values || values.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = +(sum / sorted.length).toFixed(2);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const getPercentile = (p) => {
    const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
    return sorted[idx];
  };

  return {
    min,
    max,
    avg,
    p50: getPercentile(50),
    p95: getPercentile(95),
    p99: getPercentile(99)
  };
}

/**
 * Provisions lightweight MongoDB test exam, candidate users, and sessions for load testing.
 *
 * @param {number} count
 * @returns {Promise<{ examId: string, candidates: Array<{ token: string, sessionId: string, candidateId: string, candidateName: string }> }>}
 */
export async function provisionLoadTestSessions(count = 50) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required in server/.env');
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const db = mongoose.connection.db;
  const usersColl = db.collection('users');
  const examsColl = db.collection('exams');
  const sessionsColl = db.collection('sessions');

  const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
  const timestamp = Date.now();

  console.log(`[LoadTester] Provisioning ${count} virtual candidate sessions in MongoDB...`);

  const candidateDocs = [];
  const userIds = [];

  for (let i = 0; i < count; i++) {
    const userId = new mongoose.Types.ObjectId();
    userIds.push(userId);
    candidateDocs.push({
      _id: userId,
      name: `Virtual Candidate ${i + 1}`,
      email: `virtual_cand_${timestamp}_${i + 1}@proctorshield.loadtest`,
      passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', // dummy
      role: 'candidate',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  if (candidateDocs.length > 0) {
    await usersColl.insertMany(candidateDocs);
  }

  // Create Load Test Exam
  const examId = new mongoose.Types.ObjectId();
  await examsColl.insertOne({
    _id: examId,
    title: `ProctorShield Load Test Scale Exam ${timestamp}`,
    description: `Automated test benchmark for ${count} concurrent candidates`,
    startAt: new Date(Date.now() - 3600000),
    endAt: new Date(Date.now() + 86400000),
    candidateIds: userIds,
    proctorIds: [],
    questions: [
      {
        questionText: 'What is the primary function of ProctorShield?',
        type: 'single_choice',
        options: ['Security', 'Cooking', 'Gaming'],
        correctAnswer: 'Security',
        points: 5
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Create Active Candidate Sessions
  const sessionDocs = [];
  const candidatePayloads = [];

  for (let i = 0; i < count; i++) {
    const sessionId = new mongoose.Types.ObjectId();
    const userId = userIds[i];

    sessionDocs.push({
      _id: sessionId,
      examId,
      candidateId: userId,
      status: 'active',
      startedAt: new Date(),
      lastHeartbeat: new Date(),
      flagCount: 0,
      maxSeverity: 'low',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const token = jwt.sign(
      { userId: userId.toString(), role: 'candidate' },
      jwtSecret,
      { expiresIn: '1d' }
    );

    candidatePayloads.push({
      token,
      sessionId: sessionId.toString(),
      candidateId: userId.toString(),
      candidateName: `Virtual Candidate ${i + 1}`
    });
  }

  if (sessionDocs.length > 0) {
    await sessionsColl.insertMany(sessionDocs);
  }

  console.log(`[LoadTester] Successfully provisioned ${count} active candidate sessions.`);

  return {
    examId: examId.toString(),
    candidates: candidatePayloads
  };
}

/**
 * Cleans up load test data from MongoDB.
 *
 * @param {string} examId
 */
export async function cleanupLoadTestData(examId) {
  try {
    if (!examId || mongoose.connection.readyState === 0) return;

    const db = mongoose.connection.db;
    const examObjId = new mongoose.Types.ObjectId(examId);

    const exam = await db.collection('exams').findOne({ _id: examObjId });
    if (exam && Array.isArray(exam.candidateIds)) {
      await db.collection('users').deleteMany({ _id: { $in: exam.candidateIds } });
    }
    await db.collection('sessions').deleteMany({ examId: examObjId });
    await db.collection('flags').deleteMany({ examId: examObjId });
    await db.collection('exams').deleteOne({ _id: examObjId });
  } catch (err) {
    console.warn('[LoadTester] Cleanup warning:', err.message);
  }
}

/**
 * Runs a concurrent load test simulation.
 *
 * @param {Object} config
 * @param {string} [config.serverUrl='http://localhost:5000']
 * @param {number} [config.numberOfClients=50]
 * @param {number} [config.testDurationSeconds=30]
 * @param {number} [config.signalIntervalMs=2500]
 * @param {number} [config.heartbeatIntervalMs=7000]
 * @param {number} [config.suspiciousSignalRate=0.05]
 * @param {number} [config.rampUpMs=3000]
 * @param {boolean} [config.autoCleanup=true]
 * @returns {Promise<Object>} Aggregated load test results
 */
export async function runLoadTest(config = {}) {
  const serverUrl = config.serverUrl || process.env.SERVER_URL || 'http://localhost:5000';
  const numberOfClients = config.numberOfClients || parseInt(process.env.NUMBER_OF_CLIENTS || '50', 10);
  const testDurationSeconds = config.testDurationSeconds || parseInt(process.env.TEST_DURATION_SECONDS || '30', 10);
  const signalIntervalMs = config.signalIntervalMs || parseInt(process.env.SIGNAL_INTERVAL_MS || '2500', 10);
  const heartbeatIntervalMs = config.heartbeatIntervalMs || parseInt(process.env.HEARTBEAT_INTERVAL_MS || '7000', 10);
  const suspiciousSignalRate = config.suspiciousSignalRate !== undefined ? config.suspiciousSignalRate : parseFloat(process.env.SUSPICIOUS_SIGNAL_RATE || '0.05');
  const rampUpMs = config.rampUpMs || parseInt(process.env.RAMP_UP_MS || '3000', 10);
  const autoCleanup = config.autoCleanup !== false;

  console.log('====================================================');
  console.log(`🚀 STARTING PROCTORSHIELD LOAD TEST BENCHMARK`);
  console.log(`   Target Server:       ${serverUrl}`);
  console.log(`   Concurrent Clients:  ${numberOfClients}`);
  console.log(`   Test Duration:       ${testDurationSeconds}s`);
  console.log(`   Signal Interval:     ${signalIntervalMs}ms`);
  console.log(`   Heartbeat Interval:  ${heartbeatIntervalMs}ms`);
  console.log(`   Suspicious Rate:     ${(suspiciousSignalRate * 100).toFixed(1)}%`);
  console.log(`   Ramp-up Window:      ${rampUpMs}ms`);
  console.log('====================================================\n');

  // 1. Provision MongoDB test sessions
  const { examId, candidates } = await provisionLoadTestSessions(numberOfClients);

  const metrics = {
    totalAttempted: numberOfClients,
    successfulConnections: 0,
    failedConnections: 0,
    authFailures: 0,
    joinFailures: 0,
    disconnects: 0,
    heartbeatsSent: 0,
    signalBatchesSent: 0,
    suspiciousBatchesSent: 0,
    flagsReceived: 0,
    serverAcksReceived: 0,
    eventErrors: 0,
    connectionLatencies: [],
    joinLatencies: [],
    batchAckLatencies: []
  };

  const clientWorkers = [];
  const testStartTime = Date.now();
  const testEndTime = testStartTime + (testDurationSeconds * 1000);

  // Ramp-up stagger interval per client
  const staggerIntervalMs = numberOfClients > 1 ? Math.floor(rampUpMs / numberOfClients) : 0;

  console.log(`[LoadTester] Spawning ${numberOfClients} virtual candidate sockets...`);

  // Launch each client worker with controlled ramp-up
  for (let i = 0; i < numberOfClients; i++) {
    const cand = candidates[i];

    const workerPromise = (async () => {
      // Stagger start
      if (staggerIntervalMs > 0 && i > 0) {
        await new Promise((r) => setTimeout(r, i * staggerIntervalMs));
      }

      const connStart = Date.now();
      let socket = null;

      try {
        socket = ioClient(serverUrl, {
          auth: { token: cand.token },
          transports: ['websocket'],
          reconnection: false,
          timeout: 10000
        });

        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Connection timeout')), 10000);
          socket.on('connect', () => {
            clearTimeout(timer);
            resolve();
          });
          socket.on('connect_error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
        });

        metrics.successfulConnections++;
        metrics.connectionLatencies.push(Date.now() - connStart);

        // Join session
        const joinStart = Date.now();
        const joinAck = await new Promise((resolve) => {
          socket.emit('session:join', { sessionId: cand.sessionId, examId }, (res) => {
            resolve(res);
          });
        });

        if (!joinAck || !joinAck.success) {
          metrics.joinFailures++;
          socket.disconnect();
          return;
        }

        metrics.joinLatencies.push(Date.now() - joinStart);

        // Client execution loop
        while (Date.now() < testEndTime) {
          // 1. Send telemetry signal batch
          const isSuspicious = Math.random() < suspiciousSignalRate;
          let signals = [];

          if (isSuspicious) {
            metrics.suspiciousBatchesSent++;
            signals = [
              { code: 'DOM_CHANGE', timestamp: Date.now(), source: 'mutation_observer' },
              { code: 'FIXED_HIGH_Z_NODE', timestamp: Date.now(), source: 'scanner', evidence: { zIndex: 999999 } },
              { code: 'LARGE_VIEWPORT_COVERAGE', timestamp: Date.now(), source: 'scanner', evidence: { coveragePct: 92 } },
              { code: 'KNOWN_FINGERPRINT', timestamp: Date.now(), source: 'fingerprints', evidence: { tool: 'chatgpt' } }
            ];
          } else {
            // Normal lightweight DOM change or visibility heartbeat
            signals = [
              { code: 'DOM_CHANGE', timestamp: Date.now(), source: 'mutation_observer' }
            ];
          }

          const batchStart = Date.now();
          metrics.signalBatchesSent++;

          const ack = await new Promise((resolve) => {
            socket.emit('signals:batch', { sessionId: cand.sessionId, signals }, (res) => {
              resolve(res);
            });
          });

          if (ack && ack.success) {
            metrics.serverAcksReceived++;
            metrics.batchAckLatencies.push(Date.now() - batchStart);
          } else if (ack && ack.error) {
            metrics.eventErrors++;
          }

          // 2. Periodic heartbeat
          if (Math.random() < 0.35) {
            metrics.heartbeatsSent++;
            socket.emit('heartbeat', { sessionId: cand.sessionId });
          }

          // Jittered sleep before next cycle (~signalIntervalMs +/- 25%)
          const jitter = (Math.random() * 0.5 - 0.25) * signalIntervalMs;
          const waitTime = Math.max(800, Math.floor(signalIntervalMs + jitter));

          if (Date.now() + waitTime > testEndTime) break;
          await new Promise((r) => setTimeout(r, waitTime));
        }

        // Clean leave
        await new Promise((resolve) => {
          socket.emit('session:leave', { sessionId: cand.sessionId, examId }, () => {
            resolve();
          });
        });

        socket.disconnect();
        metrics.disconnects++;
      } catch (err) {
        if (err.message?.includes('Authentication')) {
          metrics.authFailures++;
        }
        metrics.failedConnections++;
        if (socket) {
          try { socket.disconnect(); } catch {}
        }
      }
    })();

    clientWorkers.push(workerPromise);
  }

  // Await all virtual candidates to complete
  await Promise.allSettled(clientWorkers);

  const totalDurationSeconds = +((Date.now() - testStartTime) / 1000).toFixed(2);
  const connStats = calculateStats(metrics.connectionLatencies);
  const joinStats = calculateStats(metrics.joinLatencies);
  const ackStats = calculateStats(metrics.batchAckLatencies);
  const successPct = +((metrics.successfulConnections / numberOfClients) * 100).toFixed(2);

  const report = {
    targetServer: serverUrl,
    numberOfClients,
    testDurationSeconds: totalDurationSeconds,
    successPercentage: successPct,
    connections: {
      attempted: numberOfClients,
      successful: metrics.successfulConnections,
      failed: metrics.failedConnections,
      authFailures: metrics.authFailures,
      joinFailures: metrics.joinFailures,
      cleanDisconnects: metrics.disconnects
    },
    traffic: {
      signalBatchesSent: metrics.signalBatchesSent,
      suspiciousBatchesSent: metrics.suspiciousBatchesSent,
      heartbeatsSent: metrics.heartbeatsSent,
      serverAcksReceived: metrics.serverAcksReceived,
      eventErrors: metrics.eventErrors,
      batchesPerSecond: +(metrics.signalBatchesSent / totalDurationSeconds).toFixed(2)
    },
    latencies: {
      connectionMs: connStats,
      joinMs: joinStats,
      batchAckMs: ackStats
    }
  };

  // Cleanup MongoDB test exam/sessions
  if (autoCleanup) {
    console.log(`[LoadTester] Cleaning up test data for exam ${examId}...`);
    await cleanupLoadTestData(examId);
  }

  // Print summary report
  console.log('\n====================================================');
  console.log(`📊 LOAD TEST BENCHMARK RESULTS (${numberOfClients} CLIENTS)`);
  console.log('====================================================');
  console.log(`- Success Rate:         ${report.successPercentage}% (${report.connections.successful}/${report.connections.attempted})`);
  console.log(`- Test Duration:        ${report.testDurationSeconds}s`);
  console.log(`- Batches Sent:         ${report.traffic.signalBatchesSent} (${report.traffic.batchesPerSecond} batches/sec)`);
  console.log(`- Suspicious Batches:   ${report.traffic.suspiciousBatchesSent}`);
  console.log(`- Heartbeats Sent:      ${report.traffic.heartbeatsSent}`);
  console.log(`- Server ACKs:          ${report.traffic.serverAcksReceived}`);
  console.log(`- Event Errors:         ${report.traffic.eventErrors}`);
  console.log(`- Connect Latency:      p50=${connStats.p50}ms, p95=${connStats.p95}ms, p99=${connStats.p99}ms, max=${connStats.max}ms`);
  console.log(`- Batch ACK Latency:    p50=${ackStats.p50}ms, p95=${ackStats.p95}ms, p99=${ackStats.p99}ms, max=${ackStats.max}ms`);
  console.log('====================================================\n');

  return report;
}
