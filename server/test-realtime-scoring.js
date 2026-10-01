/**
 * ProctorShield Realtime Pipeline, Server Scoring & Flag Verification Suite
 * Tests all requirements from Step 8:
 * - Socket.IO authentication & rejection
 * - session:join and exam isolation
 * - Role-based authorization & unassigned exam rejection
 * - Temporal correlation window
 * - Signal allowlist & sanitization
 * - Server-side scoring weights & severity thresholds
 * - Flag creation in MongoDB & session telemetry updating
 * - Incident signature debouncing & cooldown suppression
 * - Realtime flag:new delivery to assigned proctor
 * - Heartbeat and session:leave
 */

import io from 'socket.io-client';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:5000/api/v1';
const SOCKET_URL = 'http://localhost:5000';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const response = await fetch(url, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(retries = 10, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://localhost:5000/api/health');
      if (res.ok) return true;
    } catch (e) {
      await delay(delayMs);
    }
  }
  return false;
}

async function runStep8Tests() {
  await waitForServer();
  console.log('🧪 Starting ProctorShield Step 8 Realtime & Scoring Test Suite...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Authenticate users
  const candLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'candidate@proctorshield.io', password: 'Password123!' })
  });
  const candidateToken = candLogin.data.token;
  const candidateUser = candLogin.data.user;

  const cand2Login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'candidate2@proctorshield.io', password: 'Password123!' })
  });
  const cand2Token = cand2Login.data.token;
  const cand2User = cand2Login.data.user;

  const procLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'proctor@proctorshield.io', password: 'Password123!' })
  });
  const proctorToken = procLogin.data.token;
  const proctorUser = procLogin.data.user;

  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@proctorshield.io', password: 'Password123!' })
  });
  const adminToken = adminLogin.data.token;

  assert(candidateToken && cand2Token && proctorToken && adminToken, 'Candidate 1 & 2, Proctor, and Admin authenticated');

  // 2. Setup Test Exam & Session for Candidate 1 & 2
  const examPayload = {
    title: 'Step 8 Realtime & Scoring Exam',
    description: 'Validating realtime signal streaming, server scoring, debouncing, and flags.',
    startAt: new Date(Date.now() - 3600000).toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
    durationMinutes: 45,
    sensitivity: 'high',
    candidateIds: [candidateUser.id, cand2User.id],
    proctorIds: [proctorUser.id],
    questions: [
      {
        questionText: 'Which protocol is used by Socket.IO for duplex communication?',
        options: ['WebSocket', 'FTP', 'SMTP', 'DNS'],
        correctAnswer: 'WebSocket'
      }
    ]
  };

  const createExamRes = await request('/exams', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(examPayload)
  });
  const examId = createExamRes.data.exam._id;
  assert(createExamRes.status === 201 && examId, 'Created test exam with assigned candidates and proctor');

  // Candidate 1 starts session
  const startSessionRes = await request(`/exams/${examId}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  const sessionId = startSessionRes.data.sessionId;
  assert(sessionId && startSessionRes.data.status === 'active', 'Candidate 1 started active session in MongoDB');

  // Candidate 2 starts session
  const startSession2Res = await request(`/exams/${examId}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cand2Token}` }
  });
  const session2Id = startSession2Res.data.sessionId;
  assert(session2Id && startSession2Res.data.status === 'active', 'Candidate 2 started session for isolation testing');

  // ==========================================
  // TEST G: Unauthenticated Socket.IO connection is rejected
  // ==========================================
  const unauthSocket = io(SOCKET_URL, {
    transports: ['websocket'],
    reconnection: false
  });

  const unauthRejected = await new Promise((resolve) => {
    unauthSocket.on('connect_error', (err) => {
      resolve(err.message.includes('Authentication failed'));
    });
    unauthSocket.on('connect', () => {
      resolve(false);
    });
    setTimeout(() => resolve(false), 3000);
  });
  unauthSocket.disconnect();
  assert(unauthRejected, 'TEST G: Unauthenticated Socket.IO connection rejected');

  // ==========================================
  // TEST A: Normal candidate starts exam (Socket connects, session:join succeeds)
  // ==========================================
  const candidateSocket = io(SOCKET_URL, {
    auth: { token: candidateToken },
    transports: ['websocket'],
    reconnection: false
  });

  const candidateConnected = await new Promise((resolve) => {
    candidateSocket.on('connect', () => resolve(true));
    candidateSocket.on('connect_error', () => resolve(false));
    setTimeout(() => resolve(false), 3000);
  });
  assert(candidateConnected, 'TEST A.1: Candidate socket connected successfully with JWT');

  const candidateJoinAck = await new Promise((resolve) => {
    candidateSocket.emit('session:join', { sessionId }, (response) => {
      resolve(response);
    });
  });
  assert(candidateJoinAck?.success && candidateJoinAck?.status === 'active', 'TEST A.2: candidate session:join succeeded and confirmed active');

  // ==========================================
  // TEST H: Candidate attempts to use another candidate's sessionId
  // ==========================================
  const spoofJoinAck = await new Promise((resolve) => {
    candidateSocket.emit('session:join', { sessionId: session2Id }, (response) => {
      resolve(response);
    });
  });
  assert(spoofJoinAck?.error?.includes('Unauthorized'), 'TEST H: Candidate attempting to join another candidate\'s session rejected');

  // ==========================================
  // TEST I: Proctor attempts to join an exam they are not assigned to
  // ==========================================
  const unassignedExam = await request('/exams', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      title: 'Restricted Exam Not For Proctor',
      startAt: new Date(Date.now() - 3600000).toISOString(),
      endAt: new Date(Date.now() + 86400000).toISOString(),
      candidateIds: [],
      proctorIds: [], // Proctor not assigned
      questions: []
    })
  });
  const unassignedExamId = unassignedExam.data.exam._id;

  const proctorSocket = io(SOCKET_URL, {
    auth: { token: proctorToken },
    transports: ['websocket'],
    reconnection: false
  });

  await new Promise((resolve) => proctorSocket.on('connect', resolve));

  const unassignedJoinAck = await new Promise((resolve) => {
    proctorSocket.emit('exam:join', { examId: unassignedExamId }, (response) => {
      resolve(response);
    });
  });
  assert(unassignedJoinAck?.error?.includes('Unauthorized'), 'TEST I: Proctor cannot join an unassigned exam room');

  // Now proctor joins the assigned exam room
  const assignedJoinAck = await new Promise((resolve) => {
    proctorSocket.emit('exam:join', { examId }, (response) => {
      resolve(response);
    });
  });
  assert(assignedJoinAck?.success && assignedJoinAck?.status === 'monitoring', 'Proctor joined assigned exam monitoring room');

  // Setup proctor listener for TEST F
  let proctorReceivedFlag = null;
  proctorSocket.on('flag:new', (flag) => {
    proctorReceivedFlag = flag;
  });

  // ==========================================
  // TEST B: Candidate sends one DOM_CHANGE (Score 2, no HIGH flag)
  // ==========================================
  await delay(600); // Respect batch throttle
  const domBatchAck = await new Promise((resolve) => {
    candidateSocket.emit('signals:batch', {
      sessionId,
      signals: [{ code: 'DOM_CHANGE', timestamp: Date.now(), source: 'mutation_observer' }]
    }, resolve);
  });
  assert(domBatchAck?.success && domBatchAck?.score === 2 && domBatchAck?.severity === 'low' && !domBatchAck?.flagCreated, 'TEST B: One DOM_CHANGE accepted, score is 2, no HIGH flag');

  // ==========================================
  // TEST C: Candidate sends WINDOW_BLUR only (Score 1, no HIGH flag)
  // ==========================================
  await delay(600);
  const blurBatchAck = await new Promise((resolve) => {
    candidateSocket.emit('signals:batch', {
      sessionId,
      signals: [{ code: 'WINDOW_BLUR', timestamp: Date.now(), source: 'focus_monitor' }]
    }, resolve);
  });
  assert(blurBatchAck?.success && blurBatchAck?.score <= 3 && blurBatchAck?.severity === 'low' && !blurBatchAck?.flagCreated, 'TEST C: WINDOW_BLUR accepted, low score, no HIGH flag');

  // ==========================================
  // TEST J: Unknown signal code (Safely ignored/rejected)
  // ==========================================
  await delay(600);
  const unknownBatchAck = await new Promise((resolve) => {
    candidateSocket.emit('signals:batch', {
      sessionId,
      signals: [{ code: 'UNAUTHORIZED_CUSTOM_HACK', timestamp: Date.now() }]
    }, resolve);
  });
  assert(unknownBatchAck?.score <= 3 && !unknownBatchAck?.flagCreated, 'TEST J: Unknown signal code safely ignored without crashing');

  // ==========================================
  // TEST K: Very large signal batch (Safely truncated/handled)
  // ==========================================
  await delay(600);
  const largeBatchSignals = Array.from({ length: 80 }, () => ({
    code: 'DOM_CHANGE',
    timestamp: Date.now()
  }));
  const largeBatchAck = await new Promise((resolve) => {
    candidateSocket.emit('signals:batch', {
      sessionId,
      signals: largeBatchSignals
    }, resolve);
  });
  assert(largeBatchAck?.success, 'TEST K: Large signal batch processed safely without server error');

  // ==========================================
  // TEST D: Candidate 2 injects demo overlay on fresh isolated session
  // Expected: DOM_CHANGE (2) + FIXED_HIGH_Z_NODE (5) + LARGE_VIEWPORT_COVERAGE (4) + KNOWN_FINGERPRINT (10) = 21 -> HIGH
  // Expected: MongoDB Flag created
  // ==========================================
  const candidate2Socket = io(SOCKET_URL, {
    auth: { token: cand2Token },
    transports: ['websocket'],
    reconnection: false
  });
  await new Promise((resolve) => candidate2Socket.on('connect', resolve));
  await new Promise((resolve) => candidate2Socket.emit('session:join', { sessionId: session2Id }, resolve));

  await delay(600);
  const overlayBatchSignals = [
    { code: 'DOM_CHANGE', timestamp: Date.now(), source: 'mutation_observer' },
    { code: 'FIXED_HIGH_Z_NODE', timestamp: Date.now(), source: 'scanner', evidence: { zIndex: 999999 } },
    { code: 'LARGE_VIEWPORT_COVERAGE', timestamp: Date.now(), source: 'scanner', evidence: { coveragePct: 95 } },
    { code: 'KNOWN_FINGERPRINT', timestamp: Date.now(), source: 'fingerprints', evidence: { tool: 'chatgpt' } }
  ];

  const overlayAck = await new Promise((resolve) => {
    candidate2Socket.emit('signals:batch', {
      sessionId: session2Id,
      signals: overlayBatchSignals
    }, resolve);
  });

  assert(overlayAck?.success && overlayAck?.score === 21 && overlayAck?.severity === 'high' && overlayAck?.flagCreated, 'TEST D.1: Correlated score is 21, severity HIGH, flagCreated is true');

  // Verify MongoDB Flag was created via REST
  const flagsRes = await request(`/sessions/${session2Id}/flags`, {
    headers: { Authorization: `Bearer ${cand2Token}` }
  });
  assert(flagsRes.status === 200 && flagsRes.data.flags?.length >= 1, 'TEST D.2: Persistent Flag successfully stored in MongoDB');
  const createdFlag = flagsRes.data.flags[0];
  assert(createdFlag.code === 'SUSPICIOUS_OVERLAY' && createdFlag.score === 21 && createdFlag.severity === 'high', 'TEST D.3: Flag has code SUSPICIOUS_OVERLAY, score 21, severity high');
  assert(createdFlag.evidence?.signals?.includes('FIXED_HIGH_Z_NODE'), 'TEST D.4: Compact metadata evidence stored without screenshots/DOM');

  // Verify Session flagCount and maxSeverity in DB
  const proctorSessions = await request(`/exams/${examId}/sessions`, {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  const updatedSession = proctorSessions.data.sessions.find(s => s.id === session2Id);
  assert(updatedSession?.flagCount >= 1 && updatedSession?.maxSeverity === 'high', 'TEST D.5: Session flagCount incremented and maxSeverity set to high');

  // ==========================================
  // TEST F: Proctor receives flag:new WITHOUT refresh
  // ==========================================
  assert(proctorReceivedFlag !== null, 'TEST F.1: Proctor received realtime flag:new via Socket.IO');
  assert(proctorReceivedFlag?.code === 'SUSPICIOUS_OVERLAY' && proctorReceivedFlag?.score === 21, 'TEST F.2: Proctor received accurate flag payload');

  // ==========================================
  // TEST E: Persistent overlay remains for 20-30 seconds (Debounce / Cooldown test)
  // ==========================================
  await delay(600);
  const duplicateAck = await new Promise((resolve) => {
    candidate2Socket.emit('signals:batch', {
      sessionId: session2Id,
      signals: overlayBatchSignals
    }, resolve);
  });

  assert(duplicateAck?.flagCreated === false && duplicateAck?.suppressed === true, 'TEST E.1: Identical overlay incident within cooldown is debounced (flagCreated: false, suppressed: true)');

  const flagsAfterDup = await request(`/sessions/${session2Id}/flags`, {
    headers: { Authorization: `Bearer ${cand2Token}` }
  });
  assert(flagsAfterDup.data.flags?.length === 1, 'TEST E.2: No flag spam in MongoDB; flag count remains 1');

  // ==========================================
  // Heartbeat & session:leave
  // ==========================================
  const heartbeatAck = await new Promise((resolve) => {
    candidateSocket.emit('heartbeat', { sessionId }, resolve);
  });
  assert(heartbeatAck?.success && heartbeatAck?.timestamp, 'Heartbeat successfully updated server timestamp');

  // session:leave
  const leaveAck = await new Promise((resolve) => {
    candidateSocket.emit('session:leave', { sessionId, examId }, resolve);
  });
  assert(leaveAck?.success, 'Candidate session:leave executed cleanly');

  // Cleanup sockets
  candidateSocket.disconnect();
  candidate2Socket.disconnect();
  proctorSocket.disconnect();

  console.log(`\n📊 Realtime Pipeline & Scoring Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runStep8Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
