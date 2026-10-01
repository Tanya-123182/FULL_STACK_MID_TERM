import mongoose from 'mongoose';
import Exam from '../models/Exam.js';
import User from '../models/User.js';

// Helper to validate ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// POST /api/v1/exams (Admin only)
export const createExam = async (req, res) => {
  try {
    const {
      title,
      description,
      startAt,
      endAt,
      durationMinutes,
      sensitivity = 'medium',
      candidateIds = [],
      proctorIds = [],
      questions = []
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Exam title is required' });
    }

    if (!startAt || !endAt) {
      return res.status(400).json({ error: 'Both startAt and endAt timestamps are required' });
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid startAt or endAt date format' });
    }

    if (endDate <= startDate) {
      return res.status(400).json({ error: 'Exam endAt must be after startAt' });
    }

    // Validate questions structure
    if (questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.questionText || !q.questionText.trim()) {
          return res.status(400).json({ error: `Question #${i + 1} must include questionText` });
        }
        if (!Array.isArray(q.options) || q.options.length < 2) {
          return res.status(400).json({ error: `Question #${i + 1} must have at least 2 options` });
        }
        if (q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') {
          return res.status(400).json({ error: `Question #${i + 1} must specify correctAnswer` });
        }
      }
    }

    const exam = await Exam.create({
      title: title.trim(),
      description: description ? description.trim() : '',
      startAt: startDate,
      endAt: endDate,
      durationMinutes: durationMinutes || Math.max(15, Math.round((endDate - startDate) / (1000 * 60))),
      sensitivity,
      candidateIds,
      proctorIds,
      questions,
      status: 'scheduled'
    });

    return res.status(201).json({
      message: 'Exam created successfully',
      exam
    });
  } catch (error) {
    console.error('Error creating exam:', error);
    return res.status(500).json({ error: 'Failed to create exam. ' + error.message });
  }
};

// GET /api/v1/exams/:id (Authenticated)
export const getExamById = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid exam ID format' });
  }

  try {
    const exam = await Exam.findById(id)
      .populate('candidateIds', 'name email role')
      .populate('proctorIds', 'name email role');

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const userRole = req.user.role;
    const userId = req.user.id;

    if (userRole === 'candidate') {
      const isAssigned = exam.candidateIds.some(
        c => (c._id ? c._id.toString() : c.toString()) === userId
      );

      if (!isAssigned) {
        return res.status(403).json({ error: 'You are not assigned to take this exam' });
      }

      // Candidate view: NEVER expose correctAnswer
      return res.status(200).json({ exam: exam.toCandidateJSON() });
    }

    if (userRole === 'proctor') {
      const isAssigned = exam.proctorIds.some(
        p => (p._id ? p._id.toString() : p.toString()) === userId
      );

      if (!isAssigned) {
        return res.status(403).json({ error: 'You are not assigned to proctor this exam' });
      }

      return res.status(200).json({ exam });
    }

    if (userRole === 'admin') {
      return res.status(200).json({ exam });
    }

    return res.status(403).json({ error: 'Unauthorized role' });
  } catch (error) {
    console.error('Error fetching exam:', error);
    return res.status(500).json({ error: 'Failed to retrieve exam' });
  }
};

// PATCH /api/v1/exams/:id (Admin only)
export const updateExam = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid exam ID format' });
  }

  try {
    const allowedUpdates = [
      'title',
      'description',
      'startAt',
      'endAt',
      'durationMinutes',
      'sensitivity',
      'candidateIds',
      'proctorIds',
      'questions',
      'status'
    ];

    const updates = {};
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (updates.startAt && updates.endAt && new Date(updates.endAt) <= new Date(updates.startAt)) {
      return res.status(400).json({ error: 'Exam endAt must be after startAt' });
    }

    const updatedExam = await Exam.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!updatedExam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    return res.status(200).json({
      message: 'Exam updated successfully',
      exam: updatedExam
    });
  } catch (error) {
    console.error('Error updating exam:', error);
    return res.status(500).json({ error: 'Failed to update exam' });
  }
};

// GET /api/v1/exams (Authenticated)
export const getExams = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    let filter = {};

    if (userRole === 'candidate') {
      filter = { candidateIds: userId };
      const exams = await Exam.find(filter).sort({ startAt: 1 });
      const safeExams = exams.map(e => e.toCandidateJSON());
      return res.status(200).json({ exams: safeExams });
    }

    if (userRole === 'proctor') {
      filter = { proctorIds: userId };
      const exams = await Exam.find(filter)
        .populate('candidateIds', 'name email')
        .sort({ startAt: 1 });
      return res.status(200).json({ exams });
    }

    if (userRole === 'admin') {
      const exams = await Exam.find({})
        .populate('candidateIds', 'name email')
        .populate('proctorIds', 'name email')
        .sort({ createdAt: -1 });
      return res.status(200).json({ exams });
    }

    return res.status(403).json({ error: 'Unauthorized role' });
  } catch (error) {
    console.error('Error listing exams:', error);
    return res.status(500).json({ error: 'Failed to retrieve exams list' });
  }
};
