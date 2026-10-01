/**
 * ProctorShield Server-Side Scoring & Flag Pipeline
 * Validates detector signals, updates temporal sliding windows, correlates multi-signal
 * integrity indicators, debounces duplicate alerts, and persists elevated flags to MongoDB.
 */

import Flag from '../models/Flag.js';
import Session from '../models/Session.js';
import {
  ALLOWED_SIGNAL_CODES,
  FLAG_CREATION_SCORE_THRESHOLD,
  SEVERITY_RANK,
  MAX_SIGNALS_PER_BATCH,
  MAX_EVIDENCE_SIZE_BYTES
} from './thresholds.js';
import { addSignalsToWindow, calculateCorrelatedScore } from './correlation.js';
import { generateIncidentSignature, shouldSuppressFlag } from './debounce.js';
import { getExamRoom } from '../realtime/rooms.js';
import { SOCKET_EVENTS } from '../realtime/events.js';
import { broadcastCrossServer } from '../realtime/crossServerRelay.js';
import { metricsCollector } from '../monitoring/metrics.js';



/**
 * Validates and sanitizes a batch of signals from a client.
 *
 * @param {Array} rawSignals
 * @returns {Array} List of validated, sanitized signals
 */
export function validateSignalBatch(rawSignals) {
  if (!Array.isArray(rawSignals)) return [];

  // Enforce max signals per batch guard
  const boundedSignals = rawSignals.slice(0, MAX_SIGNALS_PER_BATCH);
  const validated = [];

  for (const sig of boundedSignals) {
    if (!sig || typeof sig !== 'object') continue;

    // Check allowlist
    if (!ALLOWED_SIGNAL_CODES.has(sig.code)) {
      // Safely ignore unknown signal codes
      continue;
    }

    // Sanitize evidence - ensure it's not oversized and contains no raw HTML / screenshots
    let sanitizedEvidence = {};
    if (sig.evidence && typeof sig.evidence === 'object') {
      try {
        const serialized = JSON.stringify(sig.evidence);
        if (serialized.length <= MAX_EVIDENCE_SIZE_BYTES) {
          sanitizedEvidence = JSON.parse(serialized);
        } else {
          sanitizedEvidence = { note: 'Evidence payload exceeded size limit and was truncated' };
        }
      } catch (e) {
        sanitizedEvidence = {};
      }
    }

    validated.push({
      code: sig.code,
      timestamp: typeof sig.timestamp === 'number' ? sig.timestamp : Date.now(),
      source: typeof sig.source === 'string' ? sig.source.slice(0, 50) : 'detector',
      evidence: sanitizedEvidence
    });
  }

  return validated;
}

/**
 * Processes an incoming validated signal batch through the temporal scoring pipeline.
 *
 * @param {import('socket.io').Server} io
 * @param {Object} context
 * @param {string} context.sessionId
 * @param {string} context.examId
 * @param {string} context.candidateId
 * @param {Array} context.signals
 * @returns {Promise<{ score: number, severity: string, flagCreated: boolean, flag?: Object }>}
 */
export async function processSignalBatch(io, { sessionId, examId, candidateId, signals }) {
  // 1. Sanitize & validate incoming signals against allowlist
  const validSignals = validateSignalBatch(signals);
  if (validSignals.length === 0) {
    return { score: 0, severity: 'low', flagCreated: false };
  }

  // 2. Add to session temporal sliding window (10-15s) and prune expired
  const activeWindow = addSignalsToWindow(sessionId, validSignals);

  // 3. Compute correlated score and severity across the temporal window
  const { score, severity, uniqueCodes, dominantCode } = calculateCorrelatedScore(activeWindow);

  // 4. Check if score crosses the flag creation threshold
  if (score < FLAG_CREATION_SCORE_THRESHOLD) {
    return { score, severity, flagCreated: false };
  }

  // 5. Determine high-level flag code (e.g. SUSPICIOUS_OVERLAY)
  const isOverlayIncident = uniqueCodes.some(c =>
    c === 'FIXED_HIGH_Z_NODE' ||
    c === 'LARGE_VIEWPORT_COVERAGE' ||
    c === 'KNOWN_FINGERPRINT' ||
    c === 'SUSPICIOUS_IFRAME'
  );

  const flagCode = isOverlayIncident ? 'SUSPICIOUS_OVERLAY' : (dominantCode || 'SUSPICIOUS_ACTIVITY');

  // 6. Check incident debouncing to suppress duplicate flags during sustained incidents
  const incidentSignature = generateIncidentSignature(flagCode, uniqueCodes);
  const isSuppressed = shouldSuppressFlag(sessionId, incidentSignature);

  if (isSuppressed) {
    metricsCollector.increment('suppressedDebounces');
    return {
      score,
      severity,
      flagCreated: false,
      suppressed: true,
      signature: incidentSignature
    };
  }

  // 7. Assemble compact metadata evidence (NO full DOM, screenshots, webcam, or passwords)
  const compactEvidence = {
    signals: uniqueCodes,
    timestamp: new Date().toISOString()
  };

  try {
    // 8. Create persistent MongoDB Flag
    const flag = await Flag.create({
      sessionId,
      examId,
      candidateId,
      code: flagCode,
      severity,
      score,
      evidence: compactEvidence,
      raisedAt: new Date(),
      reviewed: false,
      verdict: 'pending'
    });

    metricsCollector.increment('flagsCreated');

    // 9. Update Session flagCount and maxSeverity
    const session = await Session.findById(sessionId);
    if (session) {
      session.flagCount = (session.flagCount || 0) + 1;

      const currentRank = SEVERITY_RANK[session.maxSeverity] ?? 0;
      const newRank = SEVERITY_RANK[severity] ?? 0;
      if (newRank > currentRank) {
        session.maxSeverity = severity;
      }

      await session.save();
    }

    // 10. Emit flag:new in real time to the exam room
    const flagPayload = {
      flagId: flag._id.toString(),
      sessionId: flag.sessionId.toString(),
      candidateId: flag.candidateId.toString(),
      code: flag.code,
      severity: flag.severity,
      score: flag.score,
      evidence: flag.evidence,
      raisedAt: flag.raisedAt
    };

    if (io) {
      await broadcastCrossServer(io, getExamRoom(examId), SOCKET_EVENTS.FLAG_NEW, flagPayload);
    }

    return {
      score,
      severity,
      flagCreated: true,
      flag: flagPayload
    };
  } catch (err) {
    metricsCollector.recordError('mongo');
    console.error('[ScoringEngine] Error persisting flag or updating session:', err);
    return { score, severity, flagCreated: false, error: err.message };
  }
}
