import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:5000/api/v1';

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

async function runExamSessionTests() {
  console.log('🧪 Starting ProctorShield Exam & Session Test Suite...\n');

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

  // 1. Authenticate Candidate, Proctor, and Admin
  const candLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'candidate@proctorshield.io', password: 'Password123!' })
  });
  const candidateToken = candLogin.data.token;
  const candidateUser = candLogin.data.user;

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

  assert(candidateToken && proctorToken && adminToken, 'All 3 test users authenticated');

  // 2. Admin Creates a New Exam
  const newExamPayload = {
    title: 'Distributed Systems & Cloud Architecture Final',
    description: 'Advanced assessment on distributed consensus, CAP theorem, and microservices.',
    startAt: new Date(Date.now() - 3600000).toISOString(),
    endAt: new Date(Date.now() + 86400000 * 7).toISOString(),
    durationMinutes: 60,
    sensitivity: 'high',
    candidateIds: [candidateUser.id],
    proctorIds: [proctorUser.id],
    questions: [
      {
        questionText: 'Which consensus algorithm is primarily used in Apache Kafka / Raft?',
        options: ['Paxos', 'Raft', 'Two-Phase Commit', 'Gossip'],
        correctAnswer: 'Raft'
      },
      {
        questionText: 'In the CAP theorem, what does "P" stand for?',
        options: ['Performance', 'Persistence', 'Partition Tolerance', 'Parallelism'],
        correctAnswer: 'Partition Tolerance'
      }
    ]
  };

  const createRes = await request('/exams', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(newExamPayload)
  });
  if (createRes.status !== 201) {
    console.error('Create exam failed with status:', createRes.status, createRes.data);
  }
  assert(createRes.status === 201 && createRes.data.exam?._id, 'Admin successfully created exam in MongoDB');
  const createdExamId = createRes.data.exam?._id;

  // 3. Candidate creates exam attempt rejected with 403
  const candCreateRes = await request('/exams', {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateToken}` },
    body: JSON.stringify(newExamPayload)
  });
  assert(candCreateRes.status === 403, 'Candidate forbidden from creating exams (403)');

  // 4. Candidate fetches assigned exams list
  const candExamsList = await request('/exams', {
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(candExamsList.status === 200 && candExamsList.data.exams?.length > 0, 'Candidate retrieves assigned exams list');

  // 5. Candidate fetches exam by ID - verify correctAnswer is NEVER present!
  const candExamRes = await request(`/exams/${createdExamId}`, {
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(candExamRes.status === 200, 'Candidate fetched assigned exam by ID');
  const candQuestions = candExamRes.data.exam?.questions || [];
  const hasCorrectAnswer = candQuestions.some(q => q.correctAnswer !== undefined);
  assert(!hasCorrectAnswer, 'CRITICAL SECURITY: correctAnswer is completely sanitized and absent for candidate');

  // 6. Candidate Starts Exam Session
  const startSessionRes = await request(`/exams/${createdExamId}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(startSessionRes.status === 201 && startSessionRes.data.sessionId && startSessionRes.data.status === 'active', 'Candidate started exam session with status "active"');
  const sessionId = startSessionRes.data.sessionId;

  // 7. Duplicate Active Session Test: Starting same exam again returns existing active session
  const duplicateStartRes = await request(`/exams/${createdExamId}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(duplicateStartRes.status === 200 && duplicateStartRes.data.sessionId === sessionId, 'Duplicate start returns existing active session without creating new doc');

  // 8. Proctor views sessions for assigned exam
  const proctorSessionsRes = await request(`/exams/${createdExamId}/sessions`, {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  assert(proctorSessionsRes.status === 200 && proctorSessionsRes.data.sessions?.length > 0, 'Proctor retrieved active sessions for assigned exam');
  const proctorFoundSession = proctorSessionsRes.data.sessions.find(s => s.id === sessionId);
  assert(proctorFoundSession?.candidate?.email === 'candidate@proctorshield.io', 'Session candidate populated correctly for proctor');

  // 9. Candidate ends session
  const endSessionRes = await request(`/sessions/${sessionId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(endSessionRes.status === 200 && endSessionRes.data.session?.status === 'completed' && endSessionRes.data.session?.endedAt, 'Candidate ended session successfully (status: completed)');

  // 10. Ending already completed session returns 400
  const repeatEndRes = await request(`/sessions/${sessionId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(repeatEndRes.status === 400, 'Ending already completed session returns 400 Bad Request');

  // 11. Unassigned candidate access test
  const unassignedExamPayload = {
    title: 'Restricted Executive Assessment',
    startAt: new Date(Date.now() - 3600000).toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
    candidateIds: [], // No candidates assigned
    proctorIds: [],
    questions: []
  };
  const unassignedRes = await request('/exams', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(unassignedExamPayload)
  });
  const unassignedExamId = unassignedRes.data.exam._id;

  const unassignedAccess = await request(`/exams/${unassignedExamId}`, {
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(unassignedAccess.status === 403, 'Unassigned candidate is denied access to exam (403)');

  // 12. Proctor cannot access an exam not assigned to them
  const unassignedProctorAccess = await request(`/exams/${unassignedExamId}`, {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  assert(unassignedProctorAccess.status === 403, 'Proctor cannot access an exam not assigned to them (403)');

  // 13. Candidate cannot access admin/proctor endpoints
  const candAdminEndpoint = await request('/auth/users', {
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(candAdminEndpoint.status === 403, 'Candidate cannot access admin user list endpoint (403)');

  // 14. Unauthenticated requests return 401
  const unauthRes = await request('/exams');
  assert(unauthRes.status === 401, 'Unauthenticated request to /exams returns 401');

  // 15. Admin can list all users for assignment
  const adminUsersRes = await request('/auth/users', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminUsersRes.status === 200 && adminUsersRes.data.users?.length >= 3, 'Admin can list registered users for assignments');

  console.log(`\n📊 Exam & Session Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runExamSessionTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
