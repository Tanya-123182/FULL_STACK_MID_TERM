import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database.js';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import examRoutes from './routes/examRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import flagRoutes from './routes/flagRoutes.js';

import http from 'http';
import { initSocket } from './realtime/socket.js';

import { getRedisStatus } from './config/redis.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Mount API routes
app.use('/api', healthRoutes);
app.use('/api/v1', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/v1/exams', examRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/v1/flags', flagRoutes);
app.use('/api/flags', flagRoutes);

// Create HTTP server and initialize Socket.IO
const httpServer = http.createServer(app);
const io = initSocket(httpServer);

// Start server after attempting database connection
const startServer = async () => {
  await connectDB();
  const redisStatus = await getRedisStatus();
  console.log(`⚡ Redis Status: ${redisStatus}`);

  httpServer.listen(PORT, () => {
    console.log(`🚀 ProctorShield Server & Socket.IO listening on port ${PORT}`);
  });
};

startServer();

export { app, httpServer, io };
export default app;
