import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { connectSocket, getSocket } from '../../realtime/socket.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const SEVERITY_RANK = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export default function ProctorDashboard() {
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('all');
  const [sessionsByExam, setSessionsByExam] = useState({}); // { [examId]: sessions[] }
  const [liveFlags, setLiveFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);

  // Keep a ref to exams for socket event handlers
  const examsRef = useRef(exams);
  useEffect(() => {
    examsRef.current = exams;
  }, [exams]);

  const fetchProctorData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      // 1. Fetch exams assigned to this proctor
      const examsRes = await fetch(`${API_BASE_URL}/exams`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const examsData = await examsRes.json();
      if (!examsRes.ok) {
        throw new Error(examsData.error || 'Failed to fetch assigned exams');
      }

      const assignedExams = examsData.exams || [];
      setExams(assignedExams);

      // 2. Fetch sessions and existing flags for all assigned exams
      const sessionMap = {};
      const initialFlags = [];

      await Promise.all(
        assignedExams.map(async (exam) => {
          try {
            const sessRes = await fetch(`${API_BASE_URL}/exams/${exam._id}/sessions`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const sessData = await sessRes.json();
            sessionMap[exam._id] = sessRes.ok ? (sessData.sessions || []) : [];

            // Fetch existing flags
            const flagRes = await fetch(`${API_BASE_URL}/exams/${exam._id}/flags`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const flagData = await flagRes.json();
            if (flagRes.ok && Array.isArray(flagData.flags)) {
              for (const f of flagData.flags) {
                initialFlags.push({
                  flagId: f._id,
                  sessionId: f.sessionId?.toString(),
                  examId: f.examId?.toString(),
                  candidateId: f.candidateId?._id?.toString() || f.candidateId?.toString(),
                  candidateName: f.candidateId?.name || 'Candidate',
                  candidateEmail: f.candidateId?.email || '',
                  examTitle: exam.title,
                  code: f.code,
                  severity: f.severity,
                  score: f.score,
                  evidence: f.evidence,
                  reviewed: f.reviewed,
                  verdict: f.verdict,
                  raisedAt: f.raisedAt
                });
              }
            }
          } catch (e) {
            sessionMap[exam._id] = [];
          }
        })
      );

      setSessionsByExam(sessionMap);
      initialFlags.sort((a, b) => new Date(b.raisedAt) - new Date(a.raisedAt));
      setLiveFlags(initialFlags.slice(0, 50));
    } catch (err) {
      console.error('Error fetching proctor data:', err);
      setError(err.message || 'Unable to load proctor data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchProctorData();
    }
  }, [token, fetchProctorData]);

  // Connect to Socket.IO and listen for flag:new and session:status
  useEffect(() => {
    if (!token) return;

    const socket = connectSocket(token);

    const handleConnect = () => {
      setSocketConnected(true);
      // Join all assigned exam rooms
      examsRef.current.forEach((exam) => {
        socket.emit('exam:join', { examId: exam._id });
      });
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    // When a new flag arrives in real time
    const handleNewFlag = (newFlag) => {
      console.log('[ProctorDashboard Realtime] Received flag:new:', newFlag);

      // 1. Prepend to live flag alerts feed WITHOUT page refresh
      setLiveFlags((prev) => {
        const matchingExam = examsRef.current.find((e) => e._id === newFlag.examId);
        const enrichedFlag = {
          ...newFlag,
          examTitle: matchingExam?.title || 'Examination'
        };
        // Avoid duplicate rendering
        if (prev.some((f) => (f.flagId && f.flagId === newFlag.flagId))) {
          return prev;
        }
        return [enrichedFlag, ...prev.slice(0, 49)];
      });

      // 2. Update candidate tile / session row in memory WITHOUT refetching
      setSessionsByExam((prevMap) => {
        const updated = { ...prevMap };
        for (const examId of Object.keys(updated)) {
          let updatedList = updated[examId].map((s) => {
            if (s.id === newFlag.sessionId) {
              const currentRank = SEVERITY_RANK[s.maxSeverity?.toLowerCase()] ?? 0;
              const flagRank = SEVERITY_RANK[newFlag.severity?.toLowerCase()] ?? 0;
              const newSeverity = flagRank > currentRank ? newFlag.severity.toLowerCase() : s.maxSeverity;

              return {
                ...s,
                flagCount: (s.flagCount || 0) + 1,
                maxSeverity: newSeverity,
                lastScore: newFlag.score,
                lastFlagCode: newFlag.code,
                lastEvidence: newFlag.evidence
              };
            }
            return s;
          });
          updated[examId] = updatedList;
        }
        return updated;
      });
    };

    // When session status changes in real time (active, completed, disconnected)
    const handleSessionStatus = (statusUpdate) => {
      if (!statusUpdate.sessionId) return;

      setSessionsByExam((prevMap) => {
        const updated = { ...prevMap };
        for (const examId of Object.keys(updated)) {
          let updatedList = updated[examId].map((s) => {
            if (s.id === statusUpdate.sessionId) {
              return {
                ...s,
                status: statusUpdate.status === 'disconnected' ? 'active' : statusUpdate.status,
                realtimeStatus: statusUpdate.status
              };
            }
            return s;
          });
          updated[examId] = updatedList;
        }
        return updated;
      });
    };

    if (socket.connected) {
      handleConnect();
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('flag:new', handleNewFlag);
    socket.on('session:status', handleSessionStatus);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('flag:new', handleNewFlag);
      socket.off('session:status', handleSessionStatus);
    };
  }, [token]);

  // When assigned exams finish loading, join their rooms
  useEffect(() => {
    const socket = getSocket();
    if (socket && socket.connected && exams.length > 0) {
      exams.forEach((exam) => {
        socket.emit('exam:join', { examId: exam._id });
      });
    }
  }, [exams]);

  // Aggregate sessions based on filter
  const allSessions = Object.entries(sessionsByExam).flatMap(([examId, list]) => {
    const matchingExam = exams.find((e) => e._id === examId);
    return list.map((s) => ({
      ...s,
      examTitle: matchingExam?.title || 'Examination'
    }));
  });

  const displayedSessions =
    selectedExamId === 'all'
      ? allSessions
      : (sessionsByExam[selectedExamId] || []).map((s) => {
          const matchingExam = exams.find((e) => e._id === selectedExamId);
          return {
            ...s,
            examTitle: matchingExam?.title || 'Examination'
          };
        });

  const filteredFlags =
    selectedExamId === 'all'
      ? liveFlags
      : liveFlags.filter((f) => f.examId === selectedExamId);

  // Requirement A: Required KPI Metrics
  const totalSessionsCount = displayedSessions.length;
  const totalActive = displayedSessions.filter((s) => s.status === 'active').length;
  const flaggedCount = displayedSessions.filter((s) => (s.flagCount || 0) > 0).length;
  const highSeverityCount = displayedSessions.filter(
    (s) => (s.maxSeverity || '').toLowerCase() === 'high' || (s.maxSeverity || '').toLowerCase() === 'critical'
  ).length;
  const mediumSeverityCount = displayedSessions.filter(
    (s) => (s.maxSeverity || '').toLowerCase() === 'medium'
  ).length;
  const lowSeverityCount = displayedSessions.filter(
    (s) => (s.maxSeverity || '').toLowerCase() === 'low'
  ).length;

  const getSeverityBadge = (severity = 'none') => {
    const s = (severity || 'none').toLowerCase();
    switch (s) {
      case 'high':
      case 'critical':
        return <span className="badge badge-red">High Risk</span>;
      case 'medium':
        return <span className="badge badge-amber">Moderate</span>;
      case 'low':
        return <span className="badge badge-blue">Low</span>;
      default:
        return <span className="badge badge-green">Pristine</span>;
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '—';
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800' }}>Live Proctoring Center</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Supervising as: <strong style={{ color: '#fff' }}>{user?.name}</strong> ({user?.email})
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            id="refresh-sessions-btn"
            onClick={() => fetchProctorData(true)}
            disabled={refreshing || loading}
            className="btn btn-outline btn-sm"
          >
            {refreshing ? '⟳ Refreshing...' : '⟳ Refresh Data'}
          </button>
          <span className="exam-monitoring-badge" id="realtime-status-indicator">
            <span className="pulse-dot" style={{ backgroundColor: socketConnected ? '#10b981' : '#f59e0b' }}></span>
            {socketConnected ? 'Realtime Connected' : 'Connecting Realtime...'}
          </span>
        </div>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Requirement A: Real Proctor Dashboard Data - 6 Core KPI Metrics */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '1.5rem' }}>
        <div className="stat-card" id="stat-card-total">
          <span className="stat-label">Total Sessions</span>
          <span className="stat-value" id="stat-total-sessions">{totalSessionsCount}</span>
          <span className="stat-hint">Across assigned exams</span>
        </div>
        <div className="stat-card" id="stat-card-active">
          <span className="stat-label">Active Candidates</span>
          <span className="stat-value" style={{ color: '#10b981' }} id="stat-active-candidates">{totalActive}</span>
          <span className="stat-hint">Online in progress</span>
        </div>
        <div className="stat-card" id="stat-card-flagged">
          <span className="stat-label">Flagged Candidates</span>
          <span className="stat-value" id="stat-flagged-candidates" style={{ color: flaggedCount > 0 ? '#ef4444' : 'var(--text-muted)' }}>
            {flaggedCount}
          </span>
          <span className="stat-hint">Requires review</span>
        </div>
        <div className="stat-card" id="stat-card-high">
          <span className="stat-label">High Severity</span>
          <span className="stat-value" id="stat-high-severity" style={{ color: highSeverityCount > 0 ? '#ef4444' : 'var(--text-muted)' }}>
            {highSeverityCount}
          </span>
          <span className="stat-hint">Elevated risk</span>
        </div>
        <div className="stat-card" id="stat-card-medium">
          <span className="stat-label">Medium Severity</span>
          <span className="stat-value" id="stat-medium-severity" style={{ color: mediumSeverityCount > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
            {mediumSeverityCount}
          </span>
          <span className="stat-hint">Moderate anomalies</span>
        </div>
        <div className="stat-card" id="stat-card-low">
          <span className="stat-label">Low Severity</span>
          <span className="stat-value" id="stat-low-severity" style={{ color: lowSeverityCount > 0 ? '#60a5fa' : 'var(--text-muted)' }}>
            {lowSeverityCount}
          </span>
          <span className="stat-hint">Minor observations</span>
        </div>
      </div>

      {/* Available Exams Filter Bar */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header" style={{ marginBottom: '0.5rem' }}>
          <div>
            <h2 className="card-title">Assigned Examination Rosters</h2>
            <p className="card-subtitle">Filter dashboard telemetry by assigned examination or view all combined.</p>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="pulse-dot" style={{ width: '8px', height: '8px', marginBottom: '0.5rem' }}></div>
            <p>Loading assigned examinations...</p>
          </div>
        ) : exams.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No exams are currently assigned to your proctor account.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button
              id="filter-exam-all"
              onClick={() => setSelectedExamId('all')}
              className={`btn btn-sm ${selectedExamId === 'all' ? 'btn-primary' : 'btn-outline'}`}
            >
              All Exams ({allSessions.length} Sessions)
            </button>
            {exams.map((exam) => {
              const count = sessionsByExam[exam._id]?.length || 0;
              return (
                <button
                  key={exam._id}
                  id={`filter-exam-${exam._id}`}
                  onClick={() => setSelectedExamId(exam._id)}
                  className={`btn btn-sm ${selectedExamId === exam._id ? 'btn-primary' : 'btn-outline'}`}
                >
                  {exam.title} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Requirement D: Real-Time Live Flag Alerts Feed */}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--accent-red)' }} id="live-flag-feed-container">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2 className="card-title" style={{ fontSize: '1.15rem' }}>Real-Time Incident & Flag Feed</h2>
              <span className="badge badge-red">
                <span className="pulse-dot red"></span> LIVE FEED
              </span>
            </div>
            <p className="card-subtitle">Real-time flags correlated on server and emitted via Socket.IO flag:new without page reload.</p>
          </div>
          <span className="badge badge-gray" id="feed-flag-count">
            {filteredFlags.length} {filteredFlags.length === 1 ? 'Incident' : 'Incidents'}
          </span>
        </div>

        {filteredFlags.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            🛡️ No suspicious overlay or integrity flags detected for active sessions.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {filteredFlags.map((flag, idx) => {
              const sev = (flag.severity || 'low').toLowerCase();
              const sevBadgeClass = sev === 'high' || sev === 'critical' ? 'badge-red' : (sev === 'medium' ? 'badge-amber' : 'badge-blue');

              return (
                <div
                  key={flag.flagId || idx}
                  id={`flag-alert-${flag.flagId || idx}`}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: `1px solid ${sev === 'high' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                    borderRadius: '8px',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span className={`badge ${sevBadgeClass}`}>
                        {flag.severity?.toUpperCase()}
                      </span>
                      <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{flag.code}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: '600' }}>
                        (Score: {flag.score})
                      </span>
                      {flag.reviewed && (
                        <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                          ✓ Reviewed
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Candidate: <strong style={{ color: '#fff' }}>{flag.candidateName || 'Candidate'}</strong> •
                      Session: <code>{flag.sessionId ? flag.sessionId.slice(-6) : 'N/A'}</code> •
                      Signals: <strong style={{ color: '#fca5a5' }}>
                        {Array.isArray(flag.evidence?.signals) ? flag.evidence.signals.join(', ') : 'Telemetry'}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {formatTimestamp(flag.raisedAt)}
                    </span>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => navigate(`/proctor/session/${flag.sessionId}`)}
                    >
                      Inspect Candidate →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Requirement B: Real Candidate Sessions Grid / Table */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">Candidate Assessment Sessions</h2>
            <p className="card-subtitle">Real-time candidate telemetry, connection status, and persistent flag counts.</p>
          </div>
          <span className="badge badge-blue">
            {displayedSessions.length} {displayedSessions.length === 1 ? 'Session' : 'Sessions'}
          </span>
        </div>

        <div className="table-container">
          {displayedSessions.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No candidate sessions have been initiated for this examination yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Exam</th>
                  <th>Status & Connection</th>
                  <th>Start Time</th>
                  <th>Flag Count</th>
                  <th>Severity</th>
                  <th>Telemetry Summary</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedSessions.map((session) => {
                  const isOnline = session.realtimeStatus !== 'disconnected' && session.status === 'active';
                  const isDisconnected = session.realtimeStatus === 'disconnected';

                  return (
                    <tr
                      key={session.id}
                      id={`session-row-${session.id}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/proctor/session/${session.id}`)}
                    >
                      <td style={{ fontWeight: '600' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span
                            className={`pulse-dot ${isDisconnected ? 'red' : ''}`}
                            style={{
                              backgroundColor: isDisconnected ? '#ef4444' : isOnline ? '#10b981' : '#6b7280'
                            }}
                          ></span>
                          <div>
                            <div>{session.candidate?.name || 'Candidate'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                              {session.candidate?.email || 'No email'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{session.examTitle}</td>
                      <td>
                        <span
                          className={`badge ${
                            isDisconnected
                              ? 'badge-red'
                              : session.status === 'active'
                              ? 'badge-green'
                              : 'badge-blue'
                          }`}
                        >
                          {isDisconnected
                            ? 'Disconnected'
                            : session.status === 'active'
                            ? 'Active (Online)'
                            : 'Completed'}
                        </span>
                      </td>
                      <td><code>{formatTimestamp(session.startedAt)}</code></td>
                      <td>
                        <span
                          id={`session-flags-${session.id}`}
                          style={{
                            fontWeight: '700',
                            color: (session.flagCount || 0) > 0 ? '#ef4444' : 'var(--text-muted)',
                            fontSize: '1rem'
                          }}
                        >
                          {session.flagCount || 0}
                        </span>
                      </td>
                      <td id={`session-severity-${session.id}`}>
                        {getSeverityBadge(session.maxSeverity)}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '200px' }}>
                        {session.lastFlagCode ? (
                          <div>
                            <strong style={{ color: '#f87171' }}>{session.lastFlagCode}</strong>
                            {session.lastScore && <span> (Score: {session.lastScore})</span>}
                          </div>
                        ) : (
                          <span>Normal Integrity</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/proctor/session/${session.id}`);
                          }}
                        >
                          Inspect →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
