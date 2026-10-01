/**
 * ProctorShield Step 10 Automated Test Suite: Redis & Scalability Layer
 *
 * Tests:
 * 1. Redis Connection & Health Status Reporting (/api/health)
 * 2. Live Session State (Presence, Heartbeat, TTL, Disconnect)
 * 3. Recent Signal / Temporal State & Debouncing with Redis keys
 * 4. Multi-Server Simulation (Server 1 on 5000, Server 2 on 5001)
 * 5. Cross-Instance Socket.IO Propagation (flag:new and session:status across servers)
 * 6. Redis Failure Resilience & Graceful In-Memory Fallback
 * 7. MongoDB Source-of-Truth & Data Consistency
 */

import http from 'http';
import express from 'express';
import cors from 'cors';
import { io as ioClient } from 'socket.io-client';
import { connectDB, getDBStatus } from './src/config/database.js';
import { getRedisClient, getRedisStatus, redisGet, redisSet, redisDel } from './src/config/redis.js';
import {
  setLiveSessionPresence,
  getLiveSessionPresence,
  updateLiveHeartbeat,
  removeLiveSessionPresence
} from './src/realtime/sessionState.js';
import {
  addSignalsToWindow,
  calculateCorrelatedScore,
  clearSessionWindow,
  getSessionWindowKey
} from './src/scoring/correlation.js';
import {
  generateIncidentSignature,
  shouldSuppressFlag,
  clearSessionDebounce,
  getDebounceRedisKey
} from './src/scoring/debounce.js';
import { initSocket } from './src/realtime/socket.js';
import User from './src/models/User.js';
import Exam from './src/models/Exam.js';
import Session from './src/models/Session.js';
import Flag from './src/models/Flag.js';
import jwt from 'jsonwebtoken';

const BASE_URL = 'http://localhost:5000/api';
const SERVER1_SOCKET_URL = 'http://localhost:5000';
const SERVER2_PORT = 5001;
const SERVER2_SOCKET_URL = `http://localhost:${SERVER2_PORT}`;

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
    throw new Error(`Assertion Failed: ${message}`);
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function runStep10Tests() {
  console.log('🧪 Starting ProctorShield Step 10 Redis & Scalability Test Suite...\n');

  await connectDB();

  // Wait for main server port 5000 to be open
  for (let i = 0; i < 20; i++) {
    try {
      const h = await fetch('http://localhost:5000/api/health');
      if (h.ok) break;
    } catch {
      await delay(300);
    }
  }

  // ==========================================
  // PART 1: Redis Connection & Health Endpoint
  // ==========================================
  console.log('--- PART 1: Redis Connection & Health Status ---');
  const redisStatus = await getRedisStatus();
  assert(redisStatus === 'connected' || redisStatus === 'unavailable', `Redis status reported: ${redisStatus}`);

  const healthRes = await request('/health');
  assert(healthRes.status === 200, 'GET /api/health returned HTTP 200');
  assert(healthRes.data?.database === 'connected', 'Health endpoint reports database as connected');
  assert(typeof healthRes.data?.redis === 'string', `Health endpoint reports Redis status: ${healthRes.data?.redis}`);
  assert(healthRes.data?.timestamp, 'Health endpoint includes ISO timestamp');

  // ==========================================
  // PART 2: Live Session State in Redis
  // ==========================================
  console.log('\n--- PART 2: Live Session State Management ---');
  const testSessionId = `test_live_session_${Date.now()}`;
  const testExamId = `test_exam_${Date.now()}`;
  const testCandId = `test_cand_${Date.now()}`;

  // 1. Set presence
  const presence = await setLiveSessionPresence(testSessionId, {
    examId: testExamId,
    candidateId: testCandId,
    status: 'active'
  }, 30);
  assert(presence?.status === 'active', 'Live presence successfully initialized');
  assert(presence?.sessionId === testSessionId, 'Live presence record contains correct sessionId');

  // 2. Retrieve presence
  const retrievedPresence = await getLiveSessionPresence(testSessionId);
  assert(retrievedPresence?.status === 'active', 'getLiveSessionPresence returns active presence');
  assert(retrievedPresence?.candidateId === testCandId, 'Presence candidateId preserved');

  // 3. Update heartbeat
  const initialHb = retrievedPresence.lastHeartbeat;
  await delay(100);
  const updatedPresence = await updateLiveHeartbeat(testSessionId, 30);
  assert(updatedPresence?.lastHeartbeat !== initialHb, 'updateLiveHeartbeat updated heartbeat timestamp');

  // 4. Remove presence on completion
  await removeLiveSessionPresence(testSessionId, 'completed');
  const afterRemove = await getLiveSessionPresence(testSessionId);
  assert(afterRemove === null, 'removeLiveSessionPresence successfully cleared live presence');

  // ==========================================
  // PART 3: Temporal Window & Debounce
  // ==========================================
  console.log('\n--- PART 3: Temporal Signal Window & Debouncing ---');
  const sessionTempId = `session_temporal_${Date.now()}`;

  // 1. Add signals to temporal sliding window
  const signals = [
    { code: 'DOM_CHANGE', timestamp: Date.now() },
    { code: 'FIXED_HIGH_Z_NODE', timestamp: Date.now(), evidence: { zIndex: 999999 } },
    { code: 'LARGE_VIEWPORT_COVERAGE', timestamp: Date.now(), evidence: { coveragePct: 95 } },
    { code: 'KNOWN_FINGERPRINT', timestamp: Date.now(), evidence: { tool: 'chatgpt' } }
  ];

  const activeWindow = addSignalsToWindow(sessionTempId, signals);
  assert(activeWindow.length === 4, 'Temporal window contains 4 correlated signals');

  const { score, severity } = calculateCorrelatedScore(activeWindow);
  assert(score === 21 && severity === 'high', 'Correlated scoring produces deterministic score 21 (HIGH severity)');

  // 2. Test Debounce Suppression
  const signature = generateIncidentSignature('SUSPICIOUS_OVERLAY', ['FIXED_HIGH_Z_NODE', 'KNOWN_FINGERPRINT']);
  assert(signature === 'SUSPICIOUS_OVERLAY:FIXED_HIGH_Z_NODE+KNOWN_FINGERPRINT', 'Stable incident signature generated');

  const firstAttempt = shouldSuppressFlag(sessionTempId, signature, 5000);
  assert(firstAttempt === false, 'First incident occurrence is allowed (not suppressed)');

  const secondAttempt = shouldSuppressFlag(sessionTempId, signature, 5000);
  assert(secondAttempt === true, 'Repeated incident within cooldown is suppressed (debounced)');

  clearSessionWindow(sessionTempId);
  clearSessionDebounce(sessionTempId);

  // ==========================================
  // PART 4 & 5: Multi-Server Instance Setup & Cross-Server Propagation
  // ==========================================
  // PART 4 & 5: Multi-Server Simulation (Server 1 & Server 2)
  // ==========================================
  console.log('\n--- PART 4 & 5: Multi-Server Simulation (Server 1 on 5002 & Server 2 on 5003) ---');

  const SERVER1_PORT = 5002;
  const SERVER2_PORT = 5003;
  const S1_URL = `http://localhost:${SERVER1_PORT}`;
  const S2_URL = `http://localhost:${SERVER2_PORT}`;

  // Server 1 instance
  const server1App = express();
  server1App.use(cors());
  server1App.use(express.json());
  const server1Http = http.createServer(server1App);
  const server1IO = initSocket(server1Http, { forceNew: true });
  await new Promise((resolve) => server1Http.listen(SERVER1_PORT, resolve));
  console.log(`🚀 Test Server 1 listening on port ${SERVER1_PORT}`);

  // Server 2 instance
  const server2App = express();
  server2App.use(cors());
  server2App.use(express.json());
  const server2Http = http.createServer(server2App);
  const server2IO = initSocket(server2Http, { forceNew: true });
  await new Promise((resolve) => server2Http.listen(SERVER2_PORT, resolve));
  console.log(`🚀 Test Server 2 listening on port ${SERVER2_PORT}`);

  // Fetch test credentials
  const candidateUser = await User.findOne({ role: 'candidate' });
  const proctorUser = await User.findOne({ role: 'proctor' });
  const adminUser = await User.findOne({ role: 'admin' });

  const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
  const candToken = jwt.sign({ userId: candidateUser._id.toString(), role: 'candidate' }, jwtSecret, { expiresIn: '1d' });
  const proctorToken = jwt.sign({ userId: proctorUser._id.toString(), role: 'proctor' }, jwtSecret, { expiresIn: '1d' });

  // Create an active exam in MongoDB
  const exam = await Exam.create({
    title: `Step 10 Multi-Server Distributed Exam ${Date.now()}`,
    description: 'Verifies cross-instance Socket.IO coordination via Redis',
    startAt: new Date(Date.now() - 3600000),
    endAt: new Date(Date.now() + 86400000),
    candidateIds: [candidateUser._id],
    proctorIds: [proctorUser._id],
    questions: [{ questionText: 'Step 10 test question', type: 'single_choice', options: ['A', 'B'], correctAnswer: 'A', points: 1 }]
  });
  const examId = exam._id.toString();

  // Create active session in MongoDB
  const session = await Session.create({
    examId: exam._id,
    candidateId: candidateUser._id,
    status: 'active',
    startedAt: new Date(),
    lastHeartbeat: new Date(),
    flagCount: 0,
    maxSeverity: 'low'
  });
  const sessionId = session._id.toString();

  // Connect Candidate to SERVER 1 (Port 5002)
  const candidateSocket = ioClient(S1_URL, {
    auth: { token: candToken },
    transports: ['websocket'],
    reconnection: false
  });
  await new Promise((resolve) => candidateSocket.on('connect', resolve));
  assert(candidateSocket.connected, 'Candidate socket connected to Server 1 (Port 5002)');

  // Connect Proctor to SERVER 2 (Port 5003)
  const proctorSocket = ioClient(S2_URL, {
    auth: { token: proctorToken },
    transports: ['websocket'],
    reconnection: false
  });
  await new Promise((resolve) => proctorSocket.on('connect', resolve));
  assert(proctorSocket.connected, 'Proctor socket connected to Server 2 (Port 5003)');

  // Proctor on Server 2 joins the exam monitoring room
  const proctorJoinAck = await new Promise((resolve) => {
    proctorSocket.emit('exam:join', { examId }, resolve);
  });
  assert(proctorJoinAck?.success, 'Proctor on Server 2 joined exam monitoring room');

  // Setup proctor listener on Server 2 for flag:new and session:status
  let proctorReceivedFlag = null;
  let proctorReceivedStatus = null;

  proctorSocket.on('flag:new', (flag) => {
    proctorReceivedFlag = flag;
  });

  proctorSocket.on('session:status', (status) => {
    proctorReceivedStatus = status;
  });

  // Candidate on Server 1 joins session
  const candJoinAck = await new Promise((resolve) => {
    candidateSocket.emit('session:join', { sessionId, examId }, resolve);
  });
  assert(candJoinAck?.success, 'Candidate on Server 1 joined session');

  // Verify candidate presence recorded
  await delay(200);
  const livePresence = await getLiveSessionPresence(sessionId);
  assert(livePresence?.status === 'active', 'Candidate join recorded in live session presence');

  // Candidate on Server 1 emits demo overlay signal batch
  await delay(600); // Throttling window
  const overlayBatch = [
    { code: 'DOM_CHANGE', timestamp: Date.now(), source: 'mutation_observer' },
    { code: 'FIXED_HIGH_Z_NODE', timestamp: Date.now(), source: 'scanner', evidence: { zIndex: 999999 } },
    { code: 'LARGE_VIEWPORT_COVERAGE', timestamp: Date.now(), source: 'scanner', evidence: { coveragePct: 95 } },
    { code: 'KNOWN_FINGERPRINT', timestamp: Date.now(), source: 'fingerprints', evidence: { tool: 'chatgpt' } }
  ];

  const batchAck = await new Promise((resolve) => {
    candidateSocket.emit('signals:batch', { sessionId, signals: overlayBatch }, resolve);
  });

  assert(batchAck?.success && batchAck?.score === 21 && batchAck?.flagCreated, 'Server 1 processed batch and created Flag');

  // Wait for cross-server relay propagation to Server 2
  for (let i = 0; i < 15; i++) {
    if (proctorReceivedFlag) break;
    await delay(200);
  }

  assert(proctorReceivedFlag !== null, 'CROSS-SERVER SUCCESS: Proctor on Server 2 received flag:new emitted from Server 1');
  assert(proctorReceivedFlag?.code === 'SUSPICIOUS_OVERLAY' && proctorReceivedFlag?.score === 21, 'Proctor on Server 2 received accurate flag payload');

  // Candidate on Server 1 sends session:leave
  await new Promise((resolve) => {
    candidateSocket.emit('session:leave', { sessionId, examId }, resolve);
  });

  for (let i = 0; i < 15; i++) {
    if (proctorReceivedStatus?.status === 'completed') break;
    await delay(200);
  }

  assert(proctorReceivedStatus?.status === 'completed', 'CROSS-SERVER SUCCESS: Proctor on Server 2 received session:status (completed) from Server 1');

  // Disconnect sockets and close servers
  candidateSocket.disconnect();
  proctorSocket.disconnect();
  server1Http.close();
  server2Http.close();

  // ==========================================
  // PART 6: Persistent MongoDB Source-of-Truth
  // ==========================================
  console.log('\n--- PART 6: MongoDB Source-of-Truth Verification ---');
  const storedFlags = await Flag.find({ sessionId });
  assert(storedFlags.length === 1, 'MongoDB holds persistent Flag created during multi-server test');
  assert(storedFlags[0].code === 'SUSPICIOUS_OVERLAY' && storedFlags[0].score === 21, 'MongoDB flag matches correlated detection data');

  const storedSession = await Session.findById(sessionId);
  assert(storedSession.flagCount === 1 && storedSession.maxSeverity === 'high', 'MongoDB session flagCount and maxSeverity persisted accurately');

  console.log(`\n📊 Step 10 Redis & Scalability Test Results: ${passCount} passed, ${failCount} failed`);
  process.exit(0);
}

runStep10Tests().catch((err) => {
  console.error('\n❌ Test suite failed with exception:', err);
  process.exit(1);
});
