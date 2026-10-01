import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:5000/api/v1/auth';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function runAuthTests() {
  console.log('🧪 Starting ProctorShield Authentication & Authorization Test Suite...\n');

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

  // 1. Candidate Login
  const candLogin = await request('/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'candidate@proctorshield.io', password: 'Password123!' })
  });
  assert(candLogin.status === 200 && candLogin.data.token && candLogin.data.user?.role === 'candidate', 'Candidate login successful and returned token');
  const candidateToken = candLogin.data.token;

  // 2. Proctor Login
  const procLogin = await request('/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'proctor@proctorshield.io', password: 'Password123!' })
  });
  assert(procLogin.status === 200 && procLogin.data.token && procLogin.data.user?.role === 'proctor', 'Proctor login successful and returned token');
  const proctorToken = procLogin.data.token;

  // 3. Admin Login
  const adminLogin = await request('/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@proctorshield.io', password: 'Password123!' })
  });
  assert(adminLogin.status === 200 && adminLogin.data.token && adminLogin.data.user?.role === 'admin', 'Admin login successful and returned token');
  const adminToken = adminLogin.data.token;

  // 4. Invalid Password
  const invalidPass = await request('/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'candidate@proctorshield.io', password: 'WrongPassword999!' })
  });
  assert(invalidPass.status === 401 && invalidPass.data.error === 'Invalid email or password', 'Invalid password returns 401 generic error');

  // 5. Nonexistent Email
  const invalidEmail = await request('/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'unknown_user_999@domain.com', password: 'Password123!' })
  });
  assert(invalidEmail.status === 401 && invalidEmail.data.error === 'Invalid email or password', 'Nonexistent email returns 401 generic error');

  // 6. GET /me with valid token
  const meRes = await request('/me', {
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(meRes.status === 200 && meRes.data.user?.email === 'candidate@proctorshield.io', 'GET /me with valid token returns user info');

  // 7. GET /me without token
  const meNoToken = await request('/me');
  assert(meNoToken.status === 401, 'GET /me without token returns 401');

  // 8. GET /me with invalid token
  const meInvalidToken = await request('/me', {
    headers: { Authorization: 'Bearer this_is_an_invalid_tampered_jwt_token' }
  });
  assert(meInvalidToken.status === 401, 'GET /me with invalid token returns 401');

  // 9. Candidate Access to Candidate Test Endpoint
  const candTestWithCand = await request('/candidate-test', {
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(candTestWithCand.status === 200, 'Candidate token allowed on /candidate-test');

  // 10. Candidate Rejected from Proctor Test Endpoint
  const procTestWithCand = await request('/proctor-test', {
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(procTestWithCand.status === 403, 'Candidate token rejected on /proctor-test with 403 Forbidden');

  // 11. Candidate Rejected from Admin Test Endpoint
  const adminTestWithCand = await request('/admin-test', {
    headers: { Authorization: `Bearer ${candidateToken}` }
  });
  assert(adminTestWithCand.status === 403, 'Candidate token rejected on /admin-test with 403 Forbidden');

  // 12. Proctor Access to Proctor Test Endpoint & Rejection from Admin Test
  const procTestWithProc = await request('/proctor-test', {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  const adminTestWithProc = await request('/admin-test', {
    headers: { Authorization: `Bearer ${proctorToken}` }
  });
  assert(procTestWithProc.status === 200, 'Proctor token allowed on /proctor-test');
  assert(adminTestWithProc.status === 403, 'Proctor token rejected on /admin-test with 403 Forbidden');

  // 13. Admin Access to Admin Test Endpoint
  const adminTestWithAdmin = await request('/admin-test', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminTestWithAdmin.status === 200, 'Admin token allowed on /admin-test');

  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAuthTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
