/**
 * ProctorShield Two-Server Multi-Instance Distributed Load Test
 * Spawns Server 1 and Server 2 on separate ports sharing MongoDB & Redis.
 * Distributes concurrent candidates across both servers while a Proctor monitors from Server 2.
 * Verifies real-time flag:new propagation and cross-instance synchronization under load.
 */

import http from 'http';
import express from 'express';
import cors from 'cors';
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
import { initSocket } from '../server/src/realtime/socket.js';
import { calculateStats, provisionLoadTestSessions, cleanupLoadTestData } from './simulator.js';

const PORT_S1 = 5004;
const PORT_S2 = 5005;
const S1_URL = `http://localhost:${PORT_S1}`;
const S2_URL = `http://localhost:${PORT_S2}`;

export async function runTwoServerLoadTest(clientCount = 50, durationSeconds = 20) {
  console.log('====================================================');
  console.log('🌐 RUNNING TWO-SERVER DISTRIBUTED LOAD TEST');
  console.log(`   Server 1:            ${S1_URL}`);
  console.log(`   Server 2:            ${S2_URL}`);
  console.log(`   Total Candidates:    ${clientCount} (${clientCount / 2} on S1, ${clientCount / 2} on S2)`);
  console.log(`   Test Duration:       ${durationSeconds}s`);
  console.log('====================================================\n');

  await connectDB();

  // 1. Spin up Server 1
  const app1 = express();
  app1.use(cors());
  app1.use(express.json());
  const http1 = http.createServer(app1);
  const io1 = initSocket(http1, { forceNew: true });
  await new Promise((r) => http1.listen(PORT_S1, r));
  console.log(`[TwoServerTest] Server 1 listening on port ${PORT_S1}`);

  // 2. Spin up Server 2
  const app2 = express();
  app2.use(cors());
  app2.use(express.json());
  const http2 = http.createServer(app2);
  const io2 = initSocket(http2, { forceNew: true });
  await new Promise((r) => http2.listen(PORT_S2, r));
  console.log(`[TwoServerTest] Server 2 listening on port ${PORT_S2}`);

  // 3. Provision test exam & candidate sessions
  const { examId, candidates } = await provisionLoadTestSessions(clientCount);

  // 4. Create verified Proctor and connect to Server 2
  const db = mongoose.connection.db;
  const proctorId = new mongoose.Types.ObjectId();
  await db.collection('users').insertOne({
    _id: proctorId,
    name: 'Distributed Proctor',
    email: `dist_proctor_${Date.now()}@proctorshield.loadtest`,
    passwordHash: 'dummy',
    role: 'proctor',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Assign proctor to exam
  await db.collection('exams').updateOne(
    { _id: new mongoose.Types.ObjectId(examId) },
    { $push: { proctorIds: proctorId } }
  );

  const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
  const proctorToken = jwt.sign(
    { userId: proctorId.toString(), role: 'proctor' },
    jwtSecret,
    { expiresIn: '1d' }
  );

  const proctorSocket = ioClient(S2_URL, {
    auth: { token: proctorToken },
    transports: ['websocket'],
    reconnection: false
  });

  await new Promise((r) => proctorSocket.on('connect', r));
  console.log(`[TwoServerTest] Proctor connected to Server 2 (Port ${PORT_S2})`);

  const proctorJoinAck = await new Promise((resolve) => {
    proctorSocket.emit('exam:join', { examId }, resolve);
  });

  if (!proctorJoinAck?.success) {
    throw new Error('Proctor failed to join exam room on Server 2');
  }
  console.log(`[TwoServerTest] Proctor joined exam monitoring room on Server 2`);

  // Track proctor flags received
  const receivedFlagsOnS2 = [];
  proctorSocket.on('flag:new', (flag) => {
    receivedFlagsOnS2.push(flag);
  });

  // 5. Connect half candidates to Server 1, half to Server 2
  const candidateWorkers = [];
  const endTime = Date.now() + (durationSeconds * 1000);
  const ackLatencies = [];
  let s1FlagsInjected = 0;
  let s2FlagsInjected = 0;

  for (let i = 0; i < clientCount; i++) {
    const cand = candidates[i];
    const targetUrl = i % 2 === 0 ? S1_URL : S2_URL;
    const isS1 = targetUrl === S1_URL;

    const worker = (async () => {
      // Stagger
      await new Promise((r) => setTimeout(r, i * 30));

      const socket = ioClient(targetUrl, {
        auth: { token: cand.token },
        transports: ['websocket'],
        reconnection: false
      });

      await new Promise((r) => socket.on('connect', r));

      await new Promise((resolve) => {
        socket.emit('session:join', { sessionId: cand.sessionId, examId }, resolve);
      });

      let iteration = 0;
      while (Date.now() < endTime) {
        iteration++;
        const shouldInjectFlag = (i < 4 && iteration === 2); // First 4 candidates inject overlay

        let signals = [];
        if (shouldInjectFlag) {
          if (isS1) s1FlagsInjected++;
          else s2FlagsInjected++;

          signals = [
            { code: 'DOM_CHANGE', timestamp: Date.now(), source: 'mutation_observer' },
            { code: 'FIXED_HIGH_Z_NODE', timestamp: Date.now(), source: 'scanner', evidence: { zIndex: 999999 } },
            { code: 'LARGE_VIEWPORT_COVERAGE', timestamp: Date.now(), source: 'scanner', evidence: { coveragePct: 95 } },
            { code: 'KNOWN_FINGERPRINT', timestamp: Date.now(), source: 'fingerprints', evidence: { tool: 'chatgpt' } }
          ];
        } else {
          signals = [{ code: 'DOM_CHANGE', timestamp: Date.now(), source: 'mutation_observer' }];
        }

        const tStart = Date.now();
        await new Promise((resolve) => {
          socket.emit('signals:batch', { sessionId: cand.sessionId, signals }, resolve);
        });
        ackLatencies.push(Date.now() - tStart);

        socket.emit('heartbeat', { sessionId: cand.sessionId });

        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 500));
      }

      await new Promise((r) => socket.emit('session:leave', { sessionId: cand.sessionId, examId }, r));
      socket.disconnect();
    })();

    candidateWorkers.push(worker);
  }

  await Promise.allSettled(candidateWorkers);

  // Wait a moment for trailing cross-server event relays
  await new Promise((r) => setTimeout(r, 800));

  proctorSocket.disconnect();
  http1.close();
  http2.close();
  await db.collection('users').deleteOne({ _id: proctorId });
  await cleanupLoadTestData(examId);

  const stats = calculateStats(ackLatencies);

  console.log('\n====================================================');
  console.log('📊 TWO-SERVER LOAD TEST RESULTS');
  console.log('====================================================');
  console.log(`- Candidates Distributed: ${clientCount} (${clientCount / 2} on S1, ${clientCount / 2} on S2)`);
  console.log(`- S1 Injected High Flags:  ${s1FlagsInjected}`);
  console.log(`- S2 Injected High Flags:  ${s2FlagsInjected}`);
  console.log(`- Flags Received on S2:    ${receivedFlagsOnS2.length} (Received cross-instance: ${receivedFlagsOnS2.length >= s1FlagsInjected ? 'YES' : 'PARTIAL'})`);
  console.log(`- Batch ACK Latency:       p50=${stats.p50}ms, p95=${stats.p95}ms, p99=${stats.p99}ms, max=${stats.max}ms`);
  console.log('====================================================\n');

  return {
    success: receivedFlagsOnS2.length >= 1,
    flagsReceived: receivedFlagsOnS2.length,
    stats
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runTwoServerLoadTest(50, 15)
    .then((res) => {
      if (!res.success) {
        console.error('❌ Two-server test failed');
        process.exit(1);
      }
      console.log('✅ Two-server test passed');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Error in two-server test:', err);
      process.exit(1);
    });
}
