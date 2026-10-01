import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from './config/database.js';
import User from './models/User.js';
import Exam from './models/Exam.js';

dotenv.config();

const DEFAULT_PASSWORD = 'Password123!';

export const seedUsers = [
  {
    name: 'Alex Candidate',
    email: 'candidate@proctorshield.io',
    password: DEFAULT_PASSWORD,
    role: 'candidate',
    isActive: true
  },
  {
    name: 'Bob Candidate (Secondary)',
    email: 'candidate2@proctorshield.io',
    password: DEFAULT_PASSWORD,
    role: 'candidate',
    isActive: true
  },
  {
    name: 'Sarah Proctor',
    email: 'proctor@proctorshield.io',
    password: DEFAULT_PASSWORD,
    role: 'proctor',
    isActive: true
  },
  {
    name: 'Dr. Eleanor Admin',
    email: 'admin@proctorshield.io',
    password: DEFAULT_PASSWORD,
    role: 'admin',
    isActive: true
  }
];

export const demoQuestions = [
  {
    questionText: 'Which HTTP status code corresponds to an "Internal Server Error"?',
    options: ['200 OK', '404 Not Found', '500 Internal Server Error', '502 Bad Gateway'],
    correctAnswer: '500 Internal Server Error'
  },
  {
    questionText: 'Which data structure operates on a Last-In, First-Out (LIFO) principle?',
    options: ['Queue', 'Stack', 'Binary Search Tree', 'Linked List'],
    correctAnswer: 'Stack'
  },
  {
    questionText: 'In React, which built-in hook is specifically designed to perform side effects in functional components?',
    options: ['useState', 'useEffect', 'useContext', 'useMemo'],
    correctAnswer: 'useEffect'
  },
  {
    questionText: 'In an Express.js middleware pipeline, what is the primary role of invoking next()?',
    options: [
      'Terminate the HTTP request immediately',
      'Pass execution control to the next middleware or route handler',
      'Reset the Express routing table',
      'Automatically serialize response data to JSON'
    ],
    correctAnswer: 'Pass execution control to the next middleware or route handler'
  },
  {
    questionText: 'Which Mongoose method is commonly used to replace reference ObjectIds with actual documents from other collections?',
    options: ['populate()', 'aggregate()', 'join()', 'lookup()'],
    correctAnswer: 'populate()'
  }
];

export async function runSeed() {
  console.log('🌱 Starting ProctorShield database user & exam seeding...');

  const connected = await connectDB();
  if (!connected) {
    console.error('❌ Database connection failed. Aborting seed.');
    process.exit(1);
  }

  const saltRounds = 10;
  const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, saltRounds);

  const createdUsers = {};

  for (const userConfig of seedUsers) {
    let user = await User.findOne({ email: userConfig.email.toLowerCase() });

    if (user) {
      user.name = userConfig.name;
      user.role = userConfig.role;
      user.isActive = userConfig.isActive;
      user.passwordHash = defaultHash;
      await user.save();
      console.log(`✅ Synced existing user: [${userConfig.role}] ${userConfig.email}`);
    } else {
      user = await User.create({
        name: userConfig.name,
        email: userConfig.email.toLowerCase(),
        passwordHash: defaultHash,
        role: userConfig.role,
        isActive: userConfig.isActive
      });
      console.log(`✅ Created test user: [${userConfig.role}] ${userConfig.email}`);
    }

    createdUsers[userConfig.role] = user;
  }

  // Seed demo exam
  const demoTitle = 'Full Stack Web Development Certification Exam';
  let demoExam = await Exam.findOne({ title: demoTitle });

  const now = new Date();
  const startAt = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
  const endAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days ahead

  const candidateId = createdUsers.candidate._id;
  const proctorId = createdUsers.proctor._id;

  if (demoExam) {
    demoExam.description = 'Comprehensive assessment covering HTTP fundamentals, data structures, React lifecycle, and Node.js backend architecture.';
    demoExam.startAt = startAt;
    demoExam.endAt = endAt;
    demoExam.durationMinutes = 45;
    demoExam.sensitivity = 'medium';
    demoExam.candidateIds = [candidateId];
    demoExam.proctorIds = [proctorId];
    demoExam.questions = demoQuestions;
    demoExam.status = 'scheduled';
    await demoExam.save();
    console.log(`✅ Updated existing demo exam: "${demoTitle}" (ID: ${demoExam._id})`);
  } else {
    demoExam = await Exam.create({
      title: demoTitle,
      description: 'Comprehensive assessment covering HTTP fundamentals, data structures, React lifecycle, and Node.js backend architecture.',
      startAt,
      endAt,
      durationMinutes: 45,
      sensitivity: 'medium',
      candidateIds: [candidateId],
      proctorIds: [proctorId],
      questions: demoQuestions,
      status: 'scheduled'
    });
    console.log(`✅ Created demo exam: "${demoTitle}" (ID: ${demoExam._id})`);
  }

  console.log('\n=============================================');
  console.log('🎉 Seed Completed Successfully!');
  console.log('---------------------------------------------');
  console.log('Demo Exam ID:', demoExam._id.toString());
  console.log('Candidate: candidate@proctorshield.io | Password: Password123!');
  console.log('Proctor:   proctor@proctorshield.io   | Password: Password123!');
  console.log('Admin:     admin@proctorshield.io     | Password: Password123!');
  console.log('=============================================\n');

  await mongoose.disconnect();
}

if (process.argv[1]?.endsWith('seed.js')) {
  runSeed().catch(err => {
    console.error('Seed execution error:', err);
    process.exit(1);
  });
}
