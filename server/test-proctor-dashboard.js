/**
 * ProctorShield Step 9: Real-time Proctor Dashboard & Flag Review Workflow Test Suite
 * Tests all requirements from Step 9:
 * - Proctor exam session retrieval & drill-down API
 * - Role-based authorization & unassigned access rejection
 * - Candidate restriction on flag review & proctor endpoints
 * - Flag review workflow (PATCH /api/v1/flags/:id) with verdict, note, and reviewedBy
 * - Persistence verification across independent queries
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

async function runStep9Tests() {
  await waitForServer();
  console.log('🧪 Starting ProctorShield Step 9 Proctor Dashboard & Review Test Suite...\n');

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

  assert(candidateToken && cand2Token && proctorToken && adminToken, 'All users authenticated successfully');

  // 2. Setup Test Exam & Candidate Sessions
  const examPayload = {
    title: 'Step 9 Dashboard Verification Exam',
    description: 'Testing live candidate tracking, flag review workflow, and MongoDB persistence.',
    startAt: new Date(Date.now() - 3600000).toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
    durationMinutes: 60,
    sensitivity: 'high',
    candidateIds: [candidateUser.id, cand2User.id],
    proctorIds: [proctorUser.id],
    questions: [
      {
        questionText: 'What is the primary role of Socket.IO in ProctorShield?',
        options: ['Realtime telemetry and flag alerts', 'Database indexing', 'Image rendering', 'File compression'],
        correctAnswer: 'Realtime telemetry and flag alerts'
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
  assert(session2Id && startSession2Res.data.status === 'active', 'Candidate 2 started active session in MongoDB');

  // 3. Proctor retrieves exam sessions (Requirement A & B)
  const proctorSessionsRes = await request(`/exams/${examId}/sessions`, {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  assert(proctorSessionsRes.status === 200, 'Proctor can retrieve exam sessions');
  assert(proctorSessionsRes.data.sessions?.length >= 2, 'Sessions list populated with assigned candidates');
  const foundSession1 = proctorSessionsRes.data.sessions.find((s) => s.id === sessionId);
  assert(foundSession1?.candidate?.email === 'candidate@proctorshield.io', 'Session candidate populated correctly');

  // 4. Proctor retrieves individual session drill-down details (Requirement E)
  const sessionDetailRes = await request(`/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  assert(sessionDetailRes.status === 200, 'Proctor can retrieve individual session drill-down (GET /api/v1/sessions/:id)');
  assert(sessionDetailRes.data.session?.examTitle === 'Step 9 Dashboard Verification Exam', 'Session drill-down includes exam title');
  assert(sessionDetailRes.data.session?.candidate?.name === 'Alex Candidate', 'Session drill-down includes candidate name');

  // 5. Unauthorized candidate cannot access another candidate's session drill-down (Requirement H)
  const candUnauthorizedSess = await request(`/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${cand2Token}` }
  });
  assert(candUnauthorizedSess.status === 403, 'Candidate 2 forbidden from accessing Candidate 1 session details (403)');

  // 6. Proctor not assigned to an exam cannot access session details (Requirement H)
  const unassignedExamRes = await request('/exams', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      title: 'Unassigned Secret Exam',
      startAt: new Date(Date.now() - 3600000).toISOString(),
      endAt: new Date(Date.now() + 86400000).toISOString(),
      candidateIds: [candidateUser.id],
      proctorIds: [], // Proctor not assigned
      questions: []
    })
  });
  const unassignedExamId = unassignedExamRes.data.exam._id;
  const unassignedSessRes = await request(`/exams/${unassignedExamId}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  const unassignedSessionId = unassignedSessRes.data.sessionId;

  const proctorForbiddenSess = await request(`/sessions/${unassignedSessionId}`, {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  assert(proctorForbiddenSess.status === 403, 'Unassigned proctor is forbidden from accessing unassigned session details (403)');

  // 7. Candidate triggers overlay flag via Socket.IO
  const candidateSocket = io(SOCKET_URL, {
    auth: { token: candidateToken },
    transports: ['websocket'],
    reconnection: false
  });
  await new Promise((resolve) => candidateSocket.on('connect', resolve));
  await new Promise((resolve) => candidateSocket.emit('session:join', { sessionId }, resolve));

  const proctorSocket = io(SOCKET_URL, {
    auth: { token: proctorToken },
    transports: ['websocket'],
    reconnection: false
  });
  await new Promise((resolve) => proctorSocket.on('connect', resolve));
  await new Promise((resolve) => proctorSocket.emit('exam:join', { examId }, resolve));

  let realtimeReceivedFlag = null;
  const flagPromise = new Promise((resolve) => {
    proctorSocket.on('flag:new', (f) => {
      realtimeReceivedFlag = f;
      resolve(f);
    });
    setTimeout(() => resolve(null), 4000);
  });

  await delay(600);
  const overlayAck = await new Promise((resolve) => {
    candidateSocket.emit('signals:batch', {
      sessionId,
      signals: [
        { code: 'DOM_CHANGE', timestamp: Date.now(), source: 'mutation_observer' },
        { code: 'FIXED_HIGH_Z_NODE', timestamp: Date.now(), source: 'scanner', evidence: { zIndex: 999999 } },
        { code: 'LARGE_VIEWPORT_COVERAGE', timestamp: Date.now(), source: 'scanner', evidence: { coveragePct: 90 } },
        { code: 'KNOWN_FINGERPRINT', timestamp: Date.now(), source: 'fingerprints', evidence: { tool: 'chatgpt' } }
      ]
    }, resolve);
  });
  assert(overlayAck?.flagCreated === true, 'Candidate overlay signals created persistent flag');

  await flagPromise;
  assert(realtimeReceivedFlag !== null, 'Proctor received real-time flag:new over Socket.IO');

  // 8. Fetch flags for session
  const sessionFlagsRes = await request(`/sessions/${sessionId}/flags`, {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  assert(sessionFlagsRes.status === 200 && sessionFlagsRes.data.flags?.length >= 1, 'Proctor retrieved flags for session');
  const targetFlag = sessionFlagsRes.data.flags[0];
  const flagId = targetFlag._id;
  assert(targetFlag.reviewed === false && targetFlag.verdict === 'pending', 'Flag initially has reviewed=false and verdict=pending');

  // 9. Candidate attempts to review flag -> 403 Forbidden (Requirement H)
  const candReviewAttempt = await request(`/flags/${flagId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${candidateToken}` },
    body: JSON.stringify({ reviewed: true, verdict: 'dismissed' })
  });
  assert(candReviewAttempt.status === 403, 'Candidate cannot review flags (403 Forbidden)');

  // 10. Unauthenticated request to review flag -> 401 Unauthorized (Requirement H)
  const unauthReviewAttempt = await request(`/flags/${flagId}`, {
    method: 'PATCH',
    body: JSON.stringify({ reviewed: true })
  });
  assert(unauthReviewAttempt.status === 401, 'Unauthenticated user cannot review flags (401 Unauthorized)');

  // 11. Authorized proctor reviews flag (Requirement F)
  const reviewPayload = {
    reviewed: true,
    verdict: 'valid',
    note: 'Supervisor confirmed high z-index overlay injecting unauthorized ChatGPT DOM nodes during assessment.'
  };

  const proctorReviewRes = await request(`/flags/${flagId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${proctorToken}` },
    body: JSON.stringify(reviewPayload)
  });

  assert(proctorReviewRes.status === 200, 'Authorized proctor successfully reviewed flag (PATCH /api/v1/flags/:id)');
  const updatedFlag = proctorReviewRes.data.flag;
  assert(updatedFlag?.reviewed === true, 'Flag state updated to reviewed=true');
  assert(updatedFlag?.verdict === 'valid', 'Flag verdict updated to "valid"');
  assert(updatedFlag?.note === reviewPayload.note, 'Flag review note saved properly');
  assert(updatedFlag?.reviewedBy?.email === 'proctor@proctorshield.io', 'Flag reviewedBy populated with proctor');

  // 12. Persistence check: Fetch flag independently via GET /api/v1/flags/:id and GET /api/v1/sessions/:id/flags
  const directFlagRes = await request(`/flags/${flagId}`, {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  assert(directFlagRes.status === 200, 'GET /api/v1/flags/:id retrieves reviewed flag');
  assert(directFlagRes.data.flag?.reviewed === true && directFlagRes.data.flag?.verdict === 'valid', 'Flag review state persists in MongoDB on direct retrieval');
  assert(directFlagRes.data.flag?.note === reviewPayload.note, 'Flag review note persists in MongoDB');

  const reloadedSessionFlags = await request(`/sessions/${sessionId}/flags`, {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  const persistedFlag = reloadedSessionFlags.data.flags.find((f) => f._id === flagId);
  assert(persistedFlag?.reviewed === true && persistedFlag?.verdict === 'valid', 'Flag review state verified in session flags list');

  // 13. Invalid verdict rejected
  const invalidVerdictRes = await request(`/flags/${flagId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${proctorToken}` },
    body: JSON.stringify({ verdict: 'invalid_hacker_verdict' })
  });
  assert(invalidVerdictRes.status === 400, 'Invalid verdict string rejected with 400 Bad Request');

  // Teardown
  candidateSocket.disconnect();
  proctorSocket.disconnect();

  console.log(`\n📊 Step 9 Proctor Dashboard & Review Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runStep9Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
