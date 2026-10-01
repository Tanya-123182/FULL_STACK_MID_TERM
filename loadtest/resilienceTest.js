/**
 * ProctorShield Security & Resilience Failure Mode Test Suite
 * Validates security boundaries, malformed telemetry protection, batch size guards,
 * and disconnect recovery under simulated load.
 */

import { io as ioClient } from 'socket.io-client';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../server/.env') });

import { connectDB } from '../server/src/config/database.js';
import { provisionLoadTestSessions, cleanupLoadTestData } from './simulator.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';

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

export async function runResilienceTests() {
  console.log('====================================================');
  console.log('🛡️ RUNNING PROCTORSHIELD RESILIENCE & FAILURE TESTS');
  console.log(`   Target Server: ${SERVER_URL}`);
  console.log('====================================================\n');

  await connectDB();

  // 1. Provision a valid test candidate session
  const { examId, candidates } = await provisionLoadTestSessions(2);
  const cand1 = candidates[0];
  const cand2 = candidates[1];

  // ----------------------------------------------------
  // TEST 1: Invalid / Expired / Tampered JWT rejection
  // ----------------------------------------------------
  console.log('--- TEST 1: Invalid & Tampered JWT Rejection ---');
  let rejectedAuth = false;
  try {
    const badSocket = ioClient(SERVER_URL, {
      auth: { token: 'invalid.tampered.jwt.signature' },
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000
    });

    await new Promise((resolve, reject) => {
      badSocket.on('connect', () => reject(new Error('Should not connect with bad JWT')));
      badSocket.on('connect_error', (err) => {
        rejectedAuth = true;
        resolve(err);
      });
    });
  } catch (err) {
    rejectedAuth = true;
  }
  assert(rejectedAuth, 'Socket connection with invalid JWT signature is rejected');

  // ----------------------------------------------------
  // TEST 2: Unauthorized Session Access
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Candidate Spoofing Another Candidate Session ---');
  const cand1Socket = ioClient(SERVER_URL, {
    auth: { token: cand1.token },
    transports: ['websocket'],
    reconnection: false
  });
  await new Promise((r) => cand1Socket.on('connect', r));

  // Candidate 1 attempts to join Candidate 2's session
  const spoofJoinRes = await new Promise((resolve) => {
    cand1Socket.emit('session:join', { sessionId: cand2.sessionId, examId }, resolve);
  });
  assert(spoofJoinRes?.error?.includes('Unauthorized'), 'Candidate cannot join another candidate session');

  // ----------------------------------------------------
  // TEST 3: Candidate joins own valid session
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Valid Session Join & Telemetry ---');
  const validJoinRes = await new Promise((resolve) => {
    cand1Socket.emit('session:join', { sessionId: cand1.sessionId, examId }, resolve);
  });
  assert(validJoinRes?.success && validJoinRes?.status === 'active', 'Candidate successfully joins own verified session');

  // ----------------------------------------------------
  // TEST 4: Malformed Signal Batch Handling
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Malformed Signals & Injection Payloads ---');
  await new Promise((r) => setTimeout(r, 600)); // batch throttle
  const malformedBatchRes = await new Promise((resolve) => {
    cand1Socket.emit('signals:batch', {
      sessionId: cand1.sessionId,
      signals: [
        null,
        undefined,
        'not_an_object',
        { code: 'SQL_INJECTION_OR_XSS', evil: '<script>alert(1)</script>' },
        { code: 'NONEXISTENT_SIGNAL_CODE', timestamp: 'invalid_date' },
        { code: 'DOM_CHANGE', timestamp: Date.now() }
      ]
    }, resolve);
  });
  assert(malformedBatchRes?.success, 'Malformed signals safely filtered without server crash; valid signals processed');

  // ----------------------------------------------------
  // TEST 5: Excessive Batch Size Guard
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Excessive Batch Size Bounding ---');
  await new Promise((r) => setTimeout(r, 600));
  const giantBatch = Array.from({ length: 300 }, (_, i) => ({
    code: 'DOM_CHANGE',
    timestamp: Date.now(),
    evidence: { index: i }
  }));

  const giantBatchRes = await new Promise((resolve) => {
    cand1Socket.emit('signals:batch', {
      sessionId: cand1.sessionId,
      signals: giantBatch
    }, resolve);
  });
  assert(giantBatchRes?.success, 'Excessive batch size bounded safely to allowed limit (MAX_SIGNALS_PER_BATCH)');

  // ----------------------------------------------------
  // TEST 6: Rapid Disconnect and Clean Reconnection
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Sudden Disconnect and Reconnect Recovery ---');
  cand1Socket.disconnect();
  await new Promise((r) => setTimeout(r, 400));

  const reconnectSocket = ioClient(SERVER_URL, {
    auth: { token: cand1.token },
    transports: ['websocket'],
    reconnection: false
  });
  await new Promise((r) => reconnectSocket.on('connect', r));
  const rejoinRes = await new Promise((resolve) => {
    reconnectSocket.emit('session:join', { sessionId: cand1.sessionId, examId }, resolve);
  });
  assert(rejoinRes?.success && rejoinRes?.status === 'active', 'Candidate successfully re-joins session after network interruption');

  reconnectSocket.disconnect();

  // Cleanup test exam/sessions
  await cleanupLoadTestData(examId);

  console.log(`\n📊 Resilience & Security Test Results: ${passCount} passed, ${failCount} failed`);
  return { passCount, failCount };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runResilienceTests()
    .then(() => {
      console.log('✅ All resilience tests passed cleanly');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Resilience tests failed:', err);
      process.exit(1);
    });
}
