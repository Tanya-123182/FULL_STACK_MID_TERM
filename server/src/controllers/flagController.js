/**
 * Flag Controller
 * Retrieves persistent flags for exams and sessions.
 */

import mongoose from 'mongoose';
import Flag from '../models/Flag.js';
import Exam from '../models/Exam.js';
import Session from '../models/Session.js';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// GET /api/v1/exams/:id/flags (Proctor / Admin)
export const getExamFlags = async (req, res) => {
  const { id: examId } = req.params;
  const user = req.user;

  if (!isValidObjectId(examId)) {
    return res.status(400).json({ error: 'Invalid exam ID format' });
  }

  try {
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (user.role === 'proctor') {
      const isAssigned = exam.proctorIds.some(
        (p) => (p._id ? p._id.toString() : p.toString()) === user.id
      );
      if (!isAssigned) {
        return res.status(403).json({ error: 'Unauthorized: Not assigned to monitor this exam' });
      }
    }

    const flags = await Flag.find({ examId })
      .populate('candidateId', 'name email')
      .sort({ raisedAt: -1 })
      .limit(100);

    return res.status(200).json({
      examId,
      total: flags.length,
      flags
    });
  } catch (err) {
    console.error('Error fetching exam flags:', err);
    return res.status(500).json({ error: 'Failed to retrieve flags' });
  }
};

// GET /api/v1/sessions/:id/flags (Proctor / Admin / Candidate owner)
export const getSessionFlags = async (req, res) => {
  const { id: sessionId } = req.params;
  const user = req.user;

  if (!isValidObjectId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  try {
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (user.role === 'candidate' && session.candidateId.toString() !== user.id) {
      return res.status(403).json({ error: 'Unauthorized to view another candidate\'s flags' });
    }

    if (user.role === 'proctor') {
      const exam = await Exam.findById(session.examId);
      if (exam) {
        const isAssigned = exam.proctorIds.some(
          (p) => (p._id ? p._id.toString() : p.toString()) === user.id
        );
        if (!isAssigned) {
          return res.status(403).json({ error: 'Unauthorized: Not assigned to this exam' });
        }
      }
    }

    const flags = await Flag.find({ sessionId })
      .populate('candidateId', 'name email')
      .sort({ raisedAt: -1 });

    return res.status(200).json({
      sessionId,
      total: flags.length,
      flags
    });
  } catch (err) {
    console.error('Error fetching session flags:', err);
    return res.status(500).json({ error: 'Failed to retrieve session flags' });
  }
};

// GET /api/v1/flags/:id (Proctor / Admin / Candidate owner)
export const getFlagById = async (req, res) => {
  const { id: flagId } = req.params;
  const user = req.user;

  if (!isValidObjectId(flagId)) {
    return res.status(400).json({ error: 'Invalid flag ID format' });
  }

  try {
    const flag = await Flag.findById(flagId)
      .populate('candidateId', 'name email')
      .populate('reviewedBy', 'name email');

    if (!flag) {
      return res.status(404).json({ error: 'Flag not found' });
    }

    if (user.role === 'candidate' && flag.candidateId._id.toString() !== user.id) {
      return res.status(403).json({ error: 'Unauthorized to view another candidate\'s flag' });
    }

    if (user.role === 'proctor') {
      const exam = await Exam.findById(flag.examId);
      if (exam) {
        const isAssigned = exam.proctorIds.some(
          (p) => (p._id ? p._id.toString() : p.toString()) === user.id
        );
        if (!isAssigned) {
          return res.status(403).json({ error: 'Unauthorized: Not assigned to this exam' });
        }
      }
    }

    return res.status(200).json({ flag });
  } catch (err) {
    console.error('Error fetching flag by ID:', err);
    return res.status(500).json({ error: 'Failed to retrieve flag' });
  }
};

// PATCH /api/v1/flags/:id (Proctor / Admin only)
export const reviewFlag = async (req, res) => {
  const { id: flagId } = req.params;
  const user = req.user;
  const { reviewed, note, verdict } = req.body;

  if (!isValidObjectId(flagId)) {
    return res.status(400).json({ error: 'Invalid flag ID format' });
  }

  try {
    const flag = await Flag.findById(flagId);
    if (!flag) {
      return res.status(404).json({ error: 'Flag record not found' });
    }

    if (user.role === 'proctor') {
      const exam = await Exam.findById(flag.examId);
      if (!exam) {
        return res.status(404).json({ error: 'Associated exam not found' });
      }

      const isAssigned = exam.proctorIds.some(
        (p) => (p._id ? p._id.toString() : p.toString()) === user.id
      );

      if (!isAssigned) {
        return res.status(403).json({ error: 'Unauthorized: You are not assigned to review flags for this exam' });
      }
    }

    if (reviewed !== undefined) {
      flag.reviewed = Boolean(reviewed);
      if (flag.reviewed) {
        flag.reviewedBy = user.id;
      } else {
        flag.reviewedBy = null;
      }
    }

    if (note !== undefined) {
      flag.note = typeof note === 'string' ? note.trim() : '';
    }

    if (verdict !== undefined) {
      const validVerdicts = ['pending', 'valid', 'false_positive', 'dismissed'];
      if (!validVerdicts.includes(verdict)) {
        return res.status(400).json({
          error: `Invalid verdict "${verdict}". Allowed values: [${validVerdicts.join(', ')}]`
        });
      }
      flag.verdict = verdict;
    }

    await flag.save();

    const updatedFlag = await Flag.findById(flag._id)
      .populate('candidateId', 'name email')
      .populate('reviewedBy', 'name email');

    return res.status(200).json({
      message: 'Flag review updated successfully',
      flag: updatedFlag
    });
  } catch (err) {
    console.error('Error reviewing flag:', err);
    return res.status(500).json({ error: 'Failed to update flag review' });
  }
};
