/**
 * ProctorShield Admin Operations Controller
 * Handles platform statistics, exam reporting, CSV/JSON data export,
 * candidate/proctor assignment management, and anti-cheat fingerprint configurations.
 */

import mongoose from 'mongoose';
import User from '../models/User.js';
import Exam from '../models/Exam.js';
import Session from '../models/Session.js';
import Flag from '../models/Flag.js';
import Fingerprint from '../models/Fingerprint.js';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Default seed fingerprints if collection is empty
const DEFAULT_FINGERPRINTS = [
  {
    name: 'ChatGPT Injected Overlay / Extension',
    tool: 'chatgpt',
    pattern: '[data-chatgpt-overlay], [id*="chatgpt-sidebar"]',
    category: 'GenAI Tool',
    weight: 10,
    severity: 'high',
    isActive: true
  },
  {
    name: 'Cursor AI Composer / Workspace Agent',
    tool: 'cursor',
    pattern: 'cursor.exe, .cursor-tutor, api.cursor.sh',
    category: 'GenAI Tool',
    weight: 10,
    severity: 'high',
    isActive: true
  },
  {
    name: 'Claude Artifacts / Anthropic Helper',
    tool: 'claude',
    pattern: 'claude-sidebar-host, anthropic-extension',
    category: 'GenAI Tool',
    weight: 10,
    severity: 'high',
    isActive: true
  },
  {
    name: 'Browser DevTools / Script Inspector',
    tool: 'devtools',
    pattern: '__REACT_DEVTOOLS_GLOBAL_HOOK__, debugger',
    category: 'Debugger',
    weight: 8,
    severity: 'medium',
    isActive: true
  },
  {
    name: 'Remote Desktop / Screen Sharing Mirror',
    tool: 'remotedesktop',
    pattern: 'anydesk, teamviewer, rustdesk-screen',
    category: 'Remote Access',
    weight: 10,
    severity: 'high',
    isActive: true
  }
];

/**
 * GET /api/v1/admin/dashboard
 * Retrieves comprehensive platform statistics, recent exams, and recent flags.
 */
export const getAdminDashboard = async (req, res) => {
  try {
    const now = new Date();

    const [
      totalExams,
      activeExams,
      totalCandidates,
      totalProctors,
      activeSessions,
      totalFlags,
      highSeverityFlags,
      recentExams,
      recentFlags
    ] = await Promise.all([
      Exam.countDocuments(),
      Exam.countDocuments({
        $or: [
          { status: 'active' },
          { startAt: { $lte: now }, endAt: { $gte: now }, status: { $ne: 'archived' } }
        ]
      }),
      User.countDocuments({ role: 'candidate' }),
      User.countDocuments({ role: 'proctor' }),
      Session.countDocuments({ status: 'active' }),
      Flag.countDocuments(),
      Flag.countDocuments({ severity: 'high' }),
      Exam.find()
        .populate('candidateIds', 'name email')
        .populate('proctorIds', 'name email')
        .sort({ createdAt: -1 })
        .limit(6),
      Flag.find()
        .populate('candidateId', 'name email')
        .populate('examId', 'title')
        .sort({ raisedAt: -1 })
        .limit(8)
    ]);

    return res.status(200).json({
      statistics: {
        totalExams,
        activeExams,
        totalCandidates,
        totalProctors,
        activeSessions,
        totalFlags,
        highSeverityFlags
      },
      recentExams,
      recentFlags
    });
  } catch (err) {
    console.error('Error fetching admin dashboard:', err);
    return res.status(500).json({ error: 'Failed to retrieve admin dashboard data' });
  }
};

/**
 * GET /api/v1/admin/exams/:id/report
 * Generates an aggregated audit and security report for a specific exam.
 */
export const getExamReport = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid exam ID format' });
  }

  try {
    const exam = await Exam.findById(id)
      .populate('candidateIds', 'name email')
      .populate('proctorIds', 'name email');

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Fetch all sessions for this exam
    const sessions = await Session.find({ examId: id }).populate('candidateId', 'name email');

    // Fetch all flags for this exam
    const flags = await Flag.find({ examId: id })
      .populate('candidateId', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ raisedAt: -1 });

    // Calculate session counts
    const sessionStats = {
      total: sessions.length,
      active: sessions.filter(s => s.status === 'active').length,
      completed: sessions.filter(s => s.status === 'completed').length,
      abandoned: sessions.filter(s => s.status === 'abandoned').length,
      notStarted: Math.max(0, exam.candidateIds.length - sessions.length)
    };

    // Calculate flag metrics
    const flagStats = {
      total: flags.length,
      high: flags.filter(f => f.severity === 'high').length,
      medium: flags.filter(f => f.severity === 'medium').length,
      low: flags.filter(f => f.severity === 'low').length,
      reviewed: flags.filter(f => f.reviewed).length,
      unreviewed: flags.filter(f => !f.reviewed).length,
      verdicts: {
        pending: flags.filter(f => f.verdict === 'pending').length,
        valid: flags.filter(f => f.verdict === 'valid').length,
        falsePositive: flags.filter(f => f.verdict === 'false_positive').length,
        dismissed: flags.filter(f => f.verdict === 'dismissed').length
      }
    };

    // Distinct candidates with flags
    const distinctFlaggedCandidates = new Set(flags.map(f => f.candidateId?._id?.toString() || f.candidateId?.toString())).size;
    const flagRate = exam.candidateIds.length > 0
      ? +((distinctFlaggedCandidates / exam.candidateIds.length) * 100).toFixed(1)
      : 0;

    // Average duration of completed sessions in minutes
    let totalCompletedDurationMs = 0;
    let completedCountWithDuration = 0;
    for (const s of sessions) {
      if (s.status === 'completed' && s.startedAt && s.endedAt) {
        totalCompletedDurationMs += (new Date(s.endedAt) - new Date(s.startedAt));
        completedCountWithDuration++;
      }
    }
    const avgDurationMinutes = completedCountWithDuration > 0
      ? Math.round((totalCompletedDurationMs / completedCountWithDuration) / 60000)
      : 0;

    // Candidate session summary table
    const candidateSummary = exam.candidateIds.map(cand => {
      const candIdStr = cand._id.toString();
      const session = sessions.find(s => s.candidateId?._id?.toString() === candIdStr || s.candidateId?.toString() === candIdStr);
      const candFlags = flags.filter(f => f.candidateId?._id?.toString() === candIdStr || f.candidateId?.toString() === candIdStr);

      return {
        candidateId: candIdStr,
        name: cand.name,
        email: cand.email,
        sessionId: session ? session._id.toString() : null,
        sessionStatus: session ? session.status : 'not_started',
        flagCount: candFlags.length,
        maxSeverity: session?.maxSeverity || (candFlags.length > 0 ? 'high' : 'none'),
        startedAt: session?.startedAt || null,
        endedAt: session?.endedAt || null,
        durationMinutes: (session?.startedAt && session?.endedAt)
          ? Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000)
          : null
      };
    });

    return res.status(200).json({
      exam: {
        id: exam._id.toString(),
        title: exam.title,
        description: exam.description,
        startAt: exam.startAt,
        endAt: exam.endAt,
        durationMinutes: exam.durationMinutes,
        sensitivity: exam.sensitivity,
        status: exam.status,
        candidatesAssignedCount: exam.candidateIds.length,
        proctorsAssignedCount: exam.proctorIds.length
      },
      sessionStats,
      flagStats,
      metrics: {
        distinctFlaggedCandidates,
        flagRatePercent: flagRate,
        averageDurationMinutes: avgDurationMinutes
      },
      candidateSummary,
      recentFlags: flags.slice(0, 50)
    });
  } catch (err) {
    console.error('Error generating exam report:', err);
    return res.status(500).json({ error: 'Failed to generate exam report' });
  }
};

/**
 * GET /api/v1/admin/exams/:id/export?format=csv
 * Exports exam flags and candidate integrity data to CSV or JSON format.
 * STRICT SECURITY: Never includes password hashes, JWTs, or raw credentials.
 */
export const exportExamReport = async (req, res) => {
  const { id } = req.params;
  const format = (req.query.format || 'csv').toLowerCase();

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid exam ID format' });
  }

  try {
    const exam = await Exam.findById(id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const [sessions, flags] = await Promise.all([
      Session.find({ examId: id }).populate('candidateId', 'name email'),
      Flag.find({ examId: id })
        .populate('candidateId', 'name email')
        .populate('reviewedBy', 'name email')
        .sort({ raisedAt: 1 })
    ]);

    if (format === 'json') {
      const sanitizedFlags = flags.map(f => ({
        flagId: f._id.toString(),
        examTitle: exam.title,
        candidateName: f.candidateId?.name || 'Unknown',
        candidateEmail: f.candidateId?.email || 'Unknown',
        sessionId: f.sessionId?.toString(),
        code: f.code,
        severity: f.severity,
        score: f.score,
        raisedAt: f.raisedAt,
        reviewed: f.reviewed,
        verdict: f.verdict,
        reviewedBy: f.reviewedBy?.name || null,
        reviewedAt: f.reviewedAt || null,
        note: f.note || ''
      }));

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="exam-report-${id}.json"`);
      return res.status(200).json(sanitizedFlags);
    }

    // CSV Export
    const csvHeaders = [
      'Flag ID',
      'Exam Title',
      'Candidate Name',
      'Candidate Email',
      'Session ID',
      'Flag Code',
      'Severity',
      'Score',
      'Timestamp (UTC)',
      'Reviewed',
      'Verdict',
      'Reviewed By',
      'Review Note'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const csvRows = [csvHeaders.join(',')];

    for (const f of flags) {
      csvRows.push([
        escapeCsv(f._id.toString()),
        escapeCsv(exam.title),
        escapeCsv(f.candidateId?.name || 'Unknown'),
        escapeCsv(f.candidateId?.email || 'Unknown'),
        escapeCsv(f.sessionId?.toString() || ''),
        escapeCsv(f.code),
        escapeCsv(f.severity),
        escapeCsv(f.score),
        escapeCsv(f.raisedAt ? new Date(f.raisedAt).toISOString() : ''),
        escapeCsv(f.reviewed ? 'YES' : 'NO'),
        escapeCsv(f.verdict || 'pending'),
        escapeCsv(f.reviewedBy?.name || ''),
        escapeCsv(f.note || '')
      ].join(','));
    }

    // If no flags, output placeholder row for session metadata
    if (flags.length === 0) {
      for (const s of sessions) {
        csvRows.push([
          escapeCsv('NO_FLAGS'),
          escapeCsv(exam.title),
          escapeCsv(s.candidateId?.name || 'Unknown'),
          escapeCsv(s.candidateId?.email || 'Unknown'),
          escapeCsv(s._id.toString()),
          escapeCsv('NONE'),
          escapeCsv('LOW'),
          escapeCsv(0),
          escapeCsv(s.startedAt ? new Date(s.startedAt).toISOString() : ''),
          escapeCsv('N/A'),
          escapeCsv('clean'),
          escapeCsv(''),
          escapeCsv('No suspicious incidents recorded')
        ].join(','));
      }
    }

    const csvContent = csvRows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="exam-report-${id}.csv"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Error exporting exam report:', err);
    return res.status(500).json({ error: 'Failed to export exam report' });
  }
};

/**
 * POST /api/v1/admin/exams/:id/candidates
 * Assigns one or more candidates to an exam without creating duplicates.
 */
export const assignCandidatesToExam = async (req, res) => {
  const { id } = req.params;
  const { candidateIds, candidateId } = req.body;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid exam ID format' });
  }

  const idsToAdd = Array.isArray(candidateIds) ? candidateIds : (candidateId ? [candidateId] : []);
  if (idsToAdd.length === 0) {
    return res.status(400).json({ error: 'candidateIds array or candidateId string is required' });
  }

  try {
    const exam = await Exam.findById(id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Filter valid user IDs with candidate role
    const validCandidates = await User.find({
      _id: { $in: idsToAdd },
      role: 'candidate'
    }).select('_id');

    const validCandidateIds = validCandidates.map(c => c._id);

    // Add unique candidates
    await Exam.findByIdAndUpdate(id, {
      $addToSet: { candidateIds: { $each: validCandidateIds } }
    });

    const updatedExam = await Exam.findById(id).populate('candidateIds', 'name email role');

    return res.status(200).json({
      message: 'Candidates assigned successfully',
      assignedCount: updatedExam.candidateIds.length,
      exam: updatedExam
    });
  } catch (err) {
    console.error('Error assigning candidates:', err);
    return res.status(500).json({ error: 'Failed to assign candidates' });
  }
};

/**
 * DELETE /api/v1/admin/exams/:id/candidates/:userId
 * Removes a candidate from an exam.
 */
export const removeCandidateFromExam = async (req, res) => {
  const { id, userId } = req.params;

  if (!isValidObjectId(id) || !isValidObjectId(userId)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  try {
    const exam = await Exam.findByIdAndUpdate(
      id,
      { $pull: { candidateIds: userId } },
      { new: true }
    ).populate('candidateIds', 'name email role');

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    return res.status(200).json({
      message: 'Candidate removed successfully',
      assignedCount: exam.candidateIds.length,
      exam
    });
  } catch (err) {
    console.error('Error removing candidate:', err);
    return res.status(500).json({ error: 'Failed to remove candidate' });
  }
};

/**
 * POST /api/v1/admin/exams/:id/proctors
 * Assigns one or more proctors to an exam without creating duplicates.
 */
export const assignProctorsToExam = async (req, res) => {
  const { id } = req.params;
  const { proctorIds, proctorId } = req.body;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid exam ID format' });
  }

  const idsToAdd = Array.isArray(proctorIds) ? proctorIds : (proctorId ? [proctorId] : []);
  if (idsToAdd.length === 0) {
    return res.status(400).json({ error: 'proctorIds array or proctorId string is required' });
  }

  try {
    const exam = await Exam.findById(id);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const validProctors = await User.find({
      _id: { $in: idsToAdd },
      role: { $in: ['proctor', 'admin'] }
    }).select('_id');

    const validProctorIds = validProctors.map(p => p._id);

    await Exam.findByIdAndUpdate(id, {
      $addToSet: { proctorIds: { $each: validProctorIds } }
    });

    const updatedExam = await Exam.findById(id).populate('proctorIds', 'name email role');

    return res.status(200).json({
      message: 'Proctors assigned successfully',
      assignedCount: updatedExam.proctorIds.length,
      exam: updatedExam
    });
  } catch (err) {
    console.error('Error assigning proctors:', err);
    return res.status(500).json({ error: 'Failed to assign proctors' });
  }
};

/**
 * DELETE /api/v1/admin/exams/:id/proctors/:userId
 * Removes a proctor from an exam.
 */
export const removeProctorFromExam = async (req, res) => {
  const { id, userId } = req.params;

  if (!isValidObjectId(id) || !isValidObjectId(userId)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  try {
    const exam = await Exam.findByIdAndUpdate(
      id,
      { $pull: { proctorIds: userId } },
      { new: true }
    ).populate('proctorIds', 'name email role');

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    return res.status(200).json({
      message: 'Proctor removed successfully',
      assignedCount: exam.proctorIds.length,
      exam
    });
  } catch (err) {
    console.error('Error removing proctor:', err);
    return res.status(500).json({ error: 'Failed to remove proctor' });
  }
};

/**
 * GET /api/v1/admin/fingerprints
 * Retrieves all anti-cheat detector fingerprints (seeds defaults if collection empty).
 */
export const getFingerprints = async (req, res) => {
  try {
    let fingerprints = await Fingerprint.find().sort({ createdAt: -1 });

    if (fingerprints.length === 0) {
      await Fingerprint.insertMany(DEFAULT_FINGERPRINTS);
      fingerprints = await Fingerprint.find().sort({ createdAt: -1 });
    }

    return res.status(200).json({ fingerprints });
  } catch (err) {
    console.error('Error fetching fingerprints:', err);
    return res.status(500).json({ error: 'Failed to retrieve fingerprints' });
  }
};

/**
 * POST /api/v1/admin/fingerprints
 * Creates a new anti-cheat detector fingerprint rule.
 */
export const createFingerprint = async (req, res) => {
  const { name, tool, pattern, category = 'GenAI Tool', weight = 10, severity = 'high', isActive = true } = req.body;

  if (!name || !name.trim() || !tool || !tool.trim() || !pattern || !pattern.trim()) {
    return res.status(400).json({ error: 'name, tool, and pattern are required' });
  }

  try {
    const fingerprint = await Fingerprint.create({
      name: name.trim(),
      tool: tool.trim().toLowerCase(),
      pattern: pattern.trim(),
      category,
      weight: Number(weight) || 10,
      severity,
      isActive: Boolean(isActive)
    });

    return res.status(201).json({
      message: 'Fingerprint created successfully',
      fingerprint
    });
  } catch (err) {
    console.error('Error creating fingerprint:', err);
    return res.status(500).json({ error: 'Failed to create fingerprint. ' + err.message });
  }
};

/**
 * PATCH /api/v1/admin/fingerprints/:id
 * Updates an existing fingerprint or toggles its active state.
 */
export const updateFingerprint = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid fingerprint ID format' });
  }

  try {
    const allowed = ['name', 'tool', 'pattern', 'category', 'weight', 'severity', 'isActive'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const updated = await Fingerprint.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ error: 'Fingerprint not found' });
    }

    return res.status(200).json({
      message: 'Fingerprint updated successfully',
      fingerprint: updated
    });
  } catch (err) {
    console.error('Error updating fingerprint:', err);
    return res.status(500).json({ error: 'Failed to update fingerprint' });
  }
};

/**
 * DELETE /api/v1/admin/fingerprints/:id
 * Deletes a fingerprint rule.
 */
export const deleteFingerprint = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid fingerprint ID format' });
  }

  try {
    const deleted = await Fingerprint.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Fingerprint not found' });
    }

    return res.status(200).json({
      message: 'Fingerprint deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting fingerprint:', err);
    return res.status(500).json({ error: 'Failed to delete fingerprint' });
  }
};
