/**
 * ProctorShield Realtime Socket.IO Core Server
 * Handles JWT authentication, secure room isolation, candidate telemetry,
 * rate limiting, and proctor monitoring dispatches.
 */

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Session from '../models/Session.js';
import Exam from '../models/Exam.js';
import { getExamRoom, getSessionRoom } from './rooms.js';
import { SOCKET_EVENTS } from './events.js';
import { processSignalBatch } from '../scoring/scoringEngine.js';
import { clearSessionWindow } from '../scoring/correlation.js';
import { clearSessionDebounce } from '../scoring/debounce.js';
import { MIN_BATCH_INTERVAL_MS } from '../scoring/thresholds.js';
import {
  setLiveSessionPresence,
  updateLiveHeartbeat,
  removeLiveSessionPresence
} from './sessionState.js';
import {
  initCrossServerRelay,
  broadcastCrossServer
} from './crossServerRelay.js';
import { metricsCollector } from '../monitoring/metrics.js';


let ioInstance = null;

// Per-socket rate limiting tracking
const socketBatchThrottle = new Map();

/**
 * Initializes and mounts Socket.IO to the existing Express HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
export function initSocket(httpServer, { forceNew = false } = {}) {
  if (ioInstance && !forceNew) {
    return ioInstance;
  }

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Initialize cross-server relay for multi-instance scaling
  initCrossServerRelay(io);


  // ==========================================
  // Socket.IO JWT Authentication Middleware
  // ==========================================
  io.use(async (socket, next) => {
    try {
      // 1. Extract token from auth payload, authorization headers, or query
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization &&
          socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')) ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication failed: Missing JWT token'));
      }

      // 2. Verify token
      const secret = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
      const decoded = jwt.verify(token, secret);

      if (!decoded || !decoded.userId) {
        return next(new Error('Authentication failed: Malformed token payload'));
      }

      // 3. Verify user in MongoDB
      const user = await User.findById(decoded.userId).select('-passwordHash');
      if (!user) {
        return next(new Error('Authentication failed: User no longer exists'));
      }

      if (!user.isActive) {
        return next(new Error('Authentication failed: Account has been deactivated'));
      }

      // 4. Attach verified user context to socket (NEVER trust client-provided IDs)
      socket.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role
      };

      return next();
    } catch (err) {
      return next(new Error('Authentication failed: ' + (err.message || 'Invalid token')));
    }
  });

  // ==========================================
  // Connection Handler
  // ==========================================
  io.on('connection', (socket) => {
    metricsCollector.increment('totalConnections');
    metricsCollector.increment('activeConnections');

    // 1. session:join
    socket.on(SOCKET_EVENTS.SESSION_JOIN, async (payload = {}, callback) => {
      try {
        const { sessionId, examId } = payload;
        const user = socket.user;

        // --- CANDIDATE JOIN FLOW ---
        if (user.role === 'candidate') {
          if (!sessionId) {
            const errResponse = { error: 'Candidate session:join requires a valid sessionId' };
            socket.emit('error', errResponse);
            if (typeof callback === 'function') callback(errResponse);
            return;
          }

          // Fetch session from MongoDB
          const session = await Session.findById(sessionId);
          if (!session) {
            const errResponse = { error: 'Exam session not found' };
            socket.emit('error', errResponse);
            if (typeof callback === 'function') callback(errResponse);
            return;
          }

          // Verify session belongs to authenticated candidate
          if (session.candidateId.toString() !== user.id) {
            const errResponse = { error: 'Unauthorized: Session belongs to another candidate' };
            socket.emit('error', errResponse);
            if (typeof callback === 'function') callback(errResponse);
            return;
          }

          // Verify session is active
          if (session.status !== 'active') {
            const errResponse = { error: 'Cannot join inactive or completed session' };
            socket.emit('error', errResponse);
            if (typeof callback === 'function') callback(errResponse);
            return;
          }

          // Obtain verified examId from database record
          const verifiedExamId = session.examId.toString();

          // Join session and exam rooms
          const sessionRoom = getSessionRoom(sessionId);
          const examRoom = getExamRoom(verifiedExamId);
          socket.join(sessionRoom);
          socket.join(examRoom);

          // Store verified references on socket
          socket.data.sessionId = sessionId;
          socket.data.examId = verifiedExamId;

          // Update live session presence in Redis & memory
          await setLiveSessionPresence(sessionId, {
            examId: verifiedExamId,
            candidateId: user.id,
            status: 'active'
          });

          // Emit session status confirmation to candidate
          const statusPayload = {
            sessionId,
            examId: verifiedExamId,
            status: 'active',
            joined: true
          };
          socket.emit(SOCKET_EVENTS.SESSION_STATUS, statusPayload);

          // Broadcast active candidate status to proctors in the exam room across all instances
          await broadcastCrossServer(io, examRoom, SOCKET_EVENTS.SESSION_STATUS, {
            sessionId,
            candidateId: user.id,
            candidateName: user.name,
            status: 'active',
            timestamp: new Date()
          });

          if (typeof callback === 'function') {
            callback({ success: true, ...statusPayload });
          }
          return;
        }

        // --- PROCTOR / ADMIN JOIN FLOW ---
        if (user.role === 'proctor' || user.role === 'admin') {
          let targetExamId = examId;

          // If sessionId was provided instead of examId, derive examId
          if (!targetExamId && sessionId) {
            const session = await Session.findById(sessionId);
            if (session) {
              targetExamId = session.examId.toString();
              socket.join(getSessionRoom(sessionId));
              socket.data.sessionId = sessionId;
            }
          }

          if (!targetExamId) {
            const errResponse = { error: 'Proctor join requires examId or valid sessionId' };
            socket.emit('error', errResponse);
            if (typeof callback === 'function') callback(errResponse);
            return;
          }

          const exam = await Exam.findById(targetExamId);
          if (!exam) {
            const errResponse = { error: 'Examination record not found' };
            socket.emit('error', errResponse);
            if (typeof callback === 'function') callback(errResponse);
            return;
          }

          // Check proctor assignment
          if (user.role === 'proctor') {
            const isAssigned = exam.proctorIds.some(
              (p) => (p._id ? p._id.toString() : p.toString()) === user.id
            );
            if (!isAssigned) {
              const errResponse = { error: 'Unauthorized: You are not assigned to monitor this exam' };
              socket.emit('error', errResponse);
              if (typeof callback === 'function') callback(errResponse);
              return;
            }
          }

          // Join the exam room
          const examRoom = getExamRoom(targetExamId);
          socket.join(examRoom);
          socket.data.examId = targetExamId;

          const statusPayload = {
            examId: targetExamId,
            status: 'monitoring',
            joined: true
          };
          socket.emit(SOCKET_EVENTS.SESSION_STATUS, statusPayload);

          if (typeof callback === 'function') {
            callback({ success: true, ...statusPayload });
          }
          return;
        }

        // Other roles
        socket.emit('error', { error: 'Unauthorized role' });
      } catch (err) {
        console.error('[Socket] session:join error:', err);
        socket.emit('error', { error: 'Failed to process session:join' });
      }
    });

    // 2. exam:join (Convenience event for proctors to join an exam room)
    socket.on('exam:join', async (payload = {}, callback) => {
      try {
        const { examId } = payload;
        const user = socket.user;

        if (user.role !== 'proctor' && user.role !== 'admin') {
          const errRes = { error: 'Unauthorized: Only proctors and admins may join exam monitoring rooms' };
          socket.emit('error', errRes);
          if (typeof callback === 'function') callback(errRes);
          return;
        }

        if (!examId) {
          const errRes = { error: 'examId is required' };
          socket.emit('error', errRes);
          if (typeof callback === 'function') callback(errRes);
          return;
        }

        const exam = await Exam.findById(examId);
        if (!exam) {
          const errRes = { error: 'Exam not found' };
          socket.emit('error', errRes);
          if (typeof callback === 'function') callback(errRes);
          return;
        }

        if (user.role === 'proctor') {
          const isAssigned = exam.proctorIds.some(
            (p) => (p._id ? p._id.toString() : p.toString()) === user.id
          );
          if (!isAssigned) {
            const errRes = { error: 'Unauthorized: You are not assigned to monitor this exam' };
            socket.emit('error', errRes);
            if (typeof callback === 'function') callback(errRes);
            return;
          }
        }

        const examRoom = getExamRoom(examId);
        socket.join(examRoom);

        const resPayload = { examId, status: 'monitoring', joined: true };
        socket.emit(SOCKET_EVENTS.SESSION_STATUS, resPayload);
        if (typeof callback === 'function') callback({ success: true, ...resPayload });
      } catch (err) {
        console.error('[Socket] exam:join error:', err);
        socket.emit('error', { error: 'Failed to join exam room' });
      }
    });

    // 3. signals:batch (Candidate sends telemetry batches)
    socket.on(SOCKET_EVENTS.SIGNALS_BATCH, async (payload = {}, callback) => {
      try {
        const user = socket.user;

        // Security check: Only authenticated candidates can submit telemetry signals
        if (user.role !== 'candidate') {
          return;
        }

        // Rate limiting check
        const now = Date.now();
        const lastBatch = socketBatchThrottle.get(socket.id) || 0;
        if (now - lastBatch < MIN_BATCH_INTERVAL_MS) {
          // Throttled: drop safely without server crash
          if (typeof callback === 'function') {
            callback({ success: false, throttled: true });
          }
          return;
        }
        socketBatchThrottle.set(socket.id, now);

        // Derive session & exam from verified server socket state or database
        let sessionId = socket.data.sessionId || payload.sessionId;
        let examId = socket.data.examId;

        if (!sessionId) {
          if (typeof callback === 'function') callback({ success: false, error: 'Session not identified' });
          return;
        }

        if (!examId) {
          const session = await Session.findById(sessionId);
          if (!session || session.candidateId.toString() !== user.id) {
            if (typeof callback === 'function') callback({ success: false, error: 'Invalid session' });
            return;
          }
          examId = session.examId.toString();
          socket.data.sessionId = sessionId;
          socket.data.examId = examId;
        }

        // Process batch through scoring pipeline
        metricsCollector.increment('batchesProcessed');
        metricsCollector.increment('signalsProcessed', payload.signals?.length || 0);

        const result = await processSignalBatch(io, {
          sessionId,
          examId,
          candidateId: user.id,
          signals: payload.signals || []
        });

        if (typeof callback === 'function') {
          callback({
            success: true,
            score: result.score,
            severity: result.severity,
            flagCreated: result.flagCreated,
            suppressed: result.suppressed || false
          });
        }
      } catch (err) {
        metricsCollector.recordError('socket');
        console.error('[Socket] signals:batch processing error:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Internal processing error' });
        }
      }
    });

    // 4. heartbeat (Candidate periodic heartbeat)
    socket.on(SOCKET_EVENTS.HEARTBEAT, async (payload = {}, callback) => {
      try {
        const user = socket.user;
        if (user.role !== 'candidate') return;

        metricsCollector.increment('heartbeatsReceived');

        const sessionId = socket.data.sessionId || payload.sessionId;
        if (sessionId) {
          // Update lastHeartbeat with SERVER TIME (never trust client timestamps)
          const serverNow = new Date();
          await Session.findByIdAndUpdate(sessionId, { lastHeartbeat: serverNow });

          // Update Redis live presence state with extended TTL
          await updateLiveHeartbeat(sessionId);

          if (typeof callback === 'function') {
            callback({ success: true, timestamp: serverNow });
          }
        }
      } catch (err) {
        metricsCollector.recordError('socket');
        console.error('[Socket] heartbeat error:', err);
      }
    });

    // 5. session:leave (Candidate ends assessment or closes session)
    socket.on(SOCKET_EVENTS.SESSION_LEAVE, async (payload = {}, callback) => {
      try {
        const sessionId = socket.data.sessionId || payload.sessionId;
        const examId = socket.data.examId || payload.examId;

        if (sessionId) {
          clearSessionWindow(sessionId);
          clearSessionDebounce(sessionId);
          await removeLiveSessionPresence(sessionId, 'completed');

          if (examId) {
            await broadcastCrossServer(io, getExamRoom(examId), SOCKET_EVENTS.SESSION_STATUS, {
              sessionId,
              candidateId: socket.user.id,
              status: 'completed',
              timestamp: new Date()
            });
            socket.leave(getExamRoom(examId));
          }

          socket.leave(getSessionRoom(sessionId));
        }

        socket.data.sessionId = null;
        socket.data.examId = null;

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (err) {
        metricsCollector.recordError('socket');
        console.error('[Socket] session:leave error:', err);
      }
    });

    // 6. disconnect
    socket.on('disconnect', async () => {
      metricsCollector.decrement('activeConnections');
      metricsCollector.increment('disconnections');
      socketBatchThrottle.delete(socket.id);

      const sessionId = socket.data?.sessionId;
      const examId = socket.data?.examId;

      if (sessionId && examId && socket.user?.role === 'candidate') {
        await removeLiveSessionPresence(sessionId, 'disconnected');

        // Emit temporary disconnected status to proctors in the exam room across all instances
        await broadcastCrossServer(io, getExamRoom(examId), SOCKET_EVENTS.SESSION_STATUS, {
          sessionId,
          candidateId: socket.user.id,
          candidateName: socket.user.name,
          status: 'disconnected',
          timestamp: new Date()
        });
      }
    });
  });

  ioInstance = io;
  return io;
}

/**
 * Returns the active Socket.IO server instance.
 *
 * @returns {Server|null}
 */
export function getIO() {
  return ioInstance;
}
