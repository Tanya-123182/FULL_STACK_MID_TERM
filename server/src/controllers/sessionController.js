import mongoose from 'mongoose';
import Session from '../models/Session.js';
import Exam from '../models/Exam.js';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// POST /api/v1/exams/:id/sessions (Candidate only)
export const startSession = async (req, res) => {
  const { id: examId } = req.params;
  const candidateId = req.user.id;

  if (!isValidObjectId(examId)) {
    return res.status(400).json({ error: 'Invalid exam ID format' });
  }

  try {
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Check candidate assignment
    const isAssigned = exam.candidateIds.some(
      c => c.toString() === candidateId
    );

    if (!isAssigned) {
      return res.status(403).json({ error: 'You are not registered for this examination' });
    }

    // Availability check
    const now = new Date();
    if (exam.endAt && now > new Date(exam.endAt)) {
      return res.status(400).json({ error: 'This examination window has already concluded' });
    }

    // Check for existing active session to prevent duplicates
    const existingActiveSession = await Session.findOne({
      examId,
      candidateId,
      status: 'active'
    });

    if (existingActiveSession) {
      // Update lastHeartbeat
      existingActiveSession.lastHeartbeat = new Date();
      await existingActiveSession.save();

      return res.status(200).json({
        message: 'Resumed existing active exam session',
        sessionId: existingActiveSession._id.toString(),
        examId: existingActiveSession.examId.toString(),
        status: existingActiveSession.status,
        startedAt: existingActiveSession.startedAt
      });
    }

    // Create new session
    const newSession = await Session.create({
      examId,
      candidateId,
      status: 'active',
      startedAt: now,
      lastHeartbeat: now,
      userAgent: req.headers['user-agent'] || 'Unknown'
    });

    return res.status(201).json({
      message: 'Exam session initialized successfully',
      sessionId: newSession._id.toString(),
      examId: newSession.examId.toString(),
      status: newSession.status,
      startedAt: newSession.startedAt
    });
  } catch (error) {
    console.error('Error starting session:', error);
    return res.status(500).json({ error: 'Failed to start exam session' });
  }
};

// POST /api/v1/sessions/:id/end (Candidate only)
export const endSession = async (req, res) => {
  const { id: sessionId } = req.params;
  const candidateId = req.user.id;

  if (!isValidObjectId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  try {
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Exam session not found' });
    }

    if (session.candidateId.toString() !== candidateId) {
      return res.status(403).json({ error: 'Unauthorized to conclude another candidate\'s session' });
    }

    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Session is already completed' });
    }

    const now = new Date();
    session.status = 'completed';
    session.endedAt = now;
    session.lastHeartbeat = now;
    await session.save();

    return res.status(200).json({
      message: 'Exam session completed and submitted successfully',
      session: {
        id: session._id.toString(),
        examId: session.examId.toString(),
        candidateId: session.candidateId.toString(),
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        flagCount: session.flagCount,
        maxSeverity: session.maxSeverity
      }
    });
  } catch (error) {
    console.error('Error ending session:', error);
    return res.status(500).json({ error: 'Failed to complete exam session' });
  }
};

// GET /api/v1/exams/:id/sessions (Proctor / Admin only)
export const getExamSessions = async (req, res) => {
  const { id: examId } = req.params;
  const userRole = req.user.role;
  const userId = req.user.id;

  if (!isValidObjectId(examId)) {
    return res.status(400).json({ error: 'Invalid exam ID format' });
  }

  try {
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (userRole === 'proctor') {
      const isAssigned = exam.proctorIds.some(
        p => p.toString() === userId
      );

      if (!isAssigned) {
        return res.status(403).json({ error: 'You are not assigned to monitor this exam' });
      }
    }

    const sessions = await Session.find({ examId })
      .populate('candidateId', 'name email role')
      .sort({ startedAt: -1 });

    const safeSessions = sessions.map(s => ({
      id: s._id.toString(),
      examId: s.examId.toString(),
      candidate: s.candidateId ? {
        id: s.candidateId._id.toString(),
        name: s.candidateId.name,
        email: s.candidateId.email
      } : { name: 'Unknown Candidate', email: '' },
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      lastHeartbeat: s.lastHeartbeat,
      flagCount: s.flagCount,
      maxSeverity: s.maxSeverity
    }));

    return res.status(200).json({
      examTitle: exam.title,
      totalSessions: safeSessions.length,
      sessions: safeSessions
    });
  } catch (error) {
    console.error('Error fetching exam sessions:', error);
    return res.status(500).json({ error: 'Failed to retrieve exam sessions' });
  }
};

// GET /api/v1/sessions/:id (Candidate owner, assigned Proctor, Admin)
export const getSessionById = async (req, res) => {
  const { id: sessionId } = req.params;
  const userRole = req.user.role;
  const userId = req.user.id;

  if (!isValidObjectId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  try {
    const session = await Session.findById(sessionId)
      .populate('candidateId', 'name email role')
      .populate('examId', 'title description durationMinutes sensitivity startAt endAt proctorIds candidateIds');

    if (!session) {
      return res.status(404).json({ error: 'Exam session not found' });
    }

    // Candidate access check
    if (userRole === 'candidate') {
      const isOwner = session.candidateId?._id
        ? session.candidateId._id.toString() === userId
        : session.candidateId?.toString() === userId;

      if (!isOwner) {
        return res.status(403).json({ error: 'Unauthorized to access another candidate\'s session' });
      }
    }

    // Proctor access check
    if (userRole === 'proctor') {
      const isAssigned = session.examId?.proctorIds?.some(
        p => (p._id ? p._id.toString() : p.toString()) === userId
      );

      if (!isAssigned) {
        return res.status(403).json({ error: 'Unauthorized: You are not assigned to monitor this exam session' });
      }
    }

    return res.status(200).json({
      session: {
        id: session._id.toString(),
        examId: session.examId?._id?.toString() || session.examId?.toString(),
        examTitle: session.examId?.title || 'Examination',
        examDuration: session.examId?.durationMinutes || 60,
        examSensitivity: session.examId?.sensitivity || 'medium',
        candidate: session.candidateId ? {
          id: session.candidateId._id?.toString() || session.candidateId.toString(),
          name: session.candidateId.name || 'Candidate',
          email: session.candidateId.email || ''
        } : { name: 'Unknown Candidate', email: '' },
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        lastHeartbeat: session.lastHeartbeat,
        flagCount: session.flagCount || 0,
        maxSeverity: session.maxSeverity || 'none'
      }
    });
  } catch (error) {
    console.error('Error retrieving session by ID:', error);
    return res.status(500).json({ error: 'Failed to retrieve session details' });
  }
};
