import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB, getDBStatus } from './src/config/database.js';
import User from './src/models/User.js';
import Exam from './src/models/Exam.js';
import Session from './src/models/Session.js';
import Flag from './src/models/Flag.js';

dotenv.config();

async function runVerification() {
  console.log('--- Starting ProctorShield Backend & DB Verification ---');

  // 1. Connect
  const isConnected = await connectDB();
  if (!isConnected) {
    throw new Error('Failed to connect to MongoDB');
  }
  console.log('1. DB Connection test: PASSED (Status:', getDBStatus(), ')');

  // 2. Validate User Model
  const testUser = new User({
    name: 'Test Candidate',
    email: `test-${Date.now()}@university.edu`,
    passwordHash: 'argon2_hashed_secret',
    role: 'candidate',
    isActive: true
  });
  await testUser.validate();
  console.log('2. User Model schema validation: PASSED');

  // 3. Validate Exam Model
  const testExam = new Exam({
    title: 'Automated Test Certification Exam',
    description: 'Verifying MongoDB Schema',
    startAt: new Date(),
    endAt: new Date(Date.now() + 3600000),
    durationMinutes: 60,
    sensitivity: 'high',
    candidateIds: [testUser._id],
    proctorIds: [],
    status: 'scheduled'
  });
  await testExam.validate();
  console.log('3. Exam Model schema validation: PASSED');

  // 4. Validate Session Model
  const testSession = new Session({
    examId: testExam._id,
    candidateId: testUser._id,
    status: 'active',
    startedAt: new Date(),
    flagCount: 0,
    maxSeverity: 'low',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  });
  await testSession.validate();
  console.log('4. Session Model schema validation: PASSED');

  // 5. Validate Flag Model
  const testFlag = new Flag({
    sessionId: testSession._id,
    examId: testExam._id,
    candidateId: testUser._id,
    code: 'MULTI_FACE',
    severity: 'high',
    score: 80,
    evidence: { facesDetected: 2, confidence: 0.94 },
    note: 'Automated test incident',
    verdict: 'pending'
  });
  await testFlag.validate();
  console.log('5. Flag Model schema validation: PASSED');

  await mongoose.disconnect();
  console.log('--- All Backend & Schema Validations Passed Successfully ---');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
