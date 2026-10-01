import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { connectSocket } from '../../realtime/socket.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default function ProctorSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const [session, setSession] = useState(null);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewingFlagId, setReviewingFlagId] = useState(null);
  const [flagEditState, setFlagEditState] = useState({}); // { [flagId]: { note: string, verdict: string, reviewed: boolean } }
  const [savingFlagId, setSavingFlagId] = useState(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const [notes, setNotes] = useState([
    { id: 1, text: 'Initial proctoring inspection initialized.', time: 'Start of session', author: 'Proctor System' }
  ]);
  const [newNote, setNewNote] = useState('');

  // 1. Fetch real session details & flags from MongoDB
  const fetchSessionData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch session details
      const sessRes = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const sessData = await sessRes.json();
      if (!sessRes.ok) {
        throw new Error(sessData.error || 'Failed to load session details');
      }
      setSession(sessData.session);

      // Fetch session flags
      const flagRes = await fetch(`${API_BASE_URL}/sessions/${sessionId}/flags`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const flagData = await flagRes.json();
      if (flagRes.ok && Array.isArray(flagData.flags)) {
        setFlags(flagData.flags);

        // Prepopulate edit states for flags
        const edits = {};
        for (const f of flagData.flags) {
          edits[f._id] = {
            note: f.note || '',
            verdict: f.verdict || 'pending',
            reviewed: Boolean(f.reviewed)
          };
        }
        setFlagEditState(edits);
      }
    } catch (err) {
      console.error('Error fetching proctor session data:', err);
      setError(err.message || 'Unable to load session data');
    } finally {
      setLoading(false);
    }
  }, [sessionId, token]);

  useEffect(() => {
    if (sessionId && token) {
      fetchSessionData();
    }
  }, [sessionId, token, fetchSessionData]);

  // 2. Connect to Socket.IO and listen for real-time flag:new & session:status
  useEffect(() => {
    if (!token || !sessionId) return;

    const socket = connectSocket(token);

    // Join session room and exam room
    socket.emit('session:join', { sessionId });

    const handleNewFlag = (newFlag) => {
      if (newFlag.sessionId === sessionId) {
        setFlags((prev) => {
          if (prev.some((f) => (f._id === newFlag.flagId || f._id === newFlag._id))) {
            return prev;
          }
          const formattedFlag = {
            _id: newFlag.flagId || newFlag._id,
            sessionId: newFlag.sessionId,
            candidateId: { name: session?.candidate?.name || 'Candidate', email: session?.candidate?.email || '' },
            code: newFlag.code,
            severity: newFlag.severity,
            score: newFlag.score,
            evidence: newFlag.evidence,
            reviewed: false,
            verdict: 'pending',
            note: '',
            raisedAt: newFlag.raisedAt || new Date().toISOString()
          };
          return [formattedFlag, ...prev];
        });

        // Update local session flag count
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            flagCount: (prev.flagCount || 0) + 1,
            maxSeverity: newFlag.severity === 'high' ? 'high' : prev.maxSeverity
          };
        });

        // Initialize edit state
        setFlagEditState((prev) => ({
          ...prev,
          [newFlag.flagId || newFlag._id]: {
            note: '',
            verdict: 'pending',
            reviewed: false
          }
        }));
      }
    };

    const handleStatus = (statusUpdate) => {
      if (statusUpdate.sessionId === sessionId) {
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: statusUpdate.status === 'disconnected' ? 'active' : statusUpdate.status,
            realtimeStatus: statusUpdate.status
          };
        });
      }
    };

    socket.on('flag:new', handleNewFlag);
    socket.on('session:status', handleStatus);

    return () => {
      socket.off('flag:new', handleNewFlag);
      socket.off('session:status', handleStatus);
    };
  }, [sessionId, token, session?.candidate]);

  // Requirement F: Flag Review Workflow (PATCH /api/v1/flags/:id)
  const handleSaveFlagReview = async (flagId) => {
    try {
      setSavingFlagId(flagId);
      setSaveSuccessMsg('');

      const editData = flagEditState[flagId] || {};
      const payload = {
        reviewed: editData.reviewed,
        verdict: editData.verdict,
        note: editData.note
      };

      const res = await fetch(`${API_BASE_URL}/flags/${flagId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update flag review');
      }

      // Update flag in state
      setFlags((prev) =>
        prev.map((f) => (f._id === flagId ? data.flag : f))
      );

      setSaveSuccessMsg('Flag review and verdict persisted successfully to MongoDB.');
      setTimeout(() => setSaveSuccessMsg(''), 4000);
      setReviewingFlagId(null);
    } catch (err) {
      console.error('Error saving flag review:', err);
      alert('Error updating flag review: ' + err.message);
    } finally {
      setSavingFlagId(null);
    }
  };

  const handleToggleReviewed = async (flag) => {
    const nextReviewed = !flag.reviewed;
    const currentEdit = flagEditState[flag._id] || {
      note: flag.note || '',
      verdict: flag.verdict || 'pending',
      reviewed: flag.reviewed
    };

    setFlagEditState((prev) => ({
      ...prev,
      [flag._id]: {
        ...currentEdit,
        reviewed: nextReviewed
      }
    }));

    try {
      setSavingFlagId(flag._id);
      const res = await fetch(`${API_BASE_URL}/flags/${flag._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          reviewed: nextReviewed,
          verdict: currentEdit.verdict,
          note: currentEdit.note
        })
      });

      const data = await res.json();
      if (res.ok && data.flag) {
        setFlags((prev) => prev.map((f) => (f._id === flag._id ? data.flag : f)));
      }
    } catch (e) {
      console.error('Error toggling review:', e);
    } finally {
      setSavingFlagId(null);
    }
  };

  const handleAddNote = (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setNotes((prev) => [
      ...prev,
      {
        id: Date.now(),
        text: newNote.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        author: `${user?.name || 'Proctor'} (Supervisor)`
      }
    ]);
    setNewNote('');
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '—';
    }
  };

  const getSeverityBadge = (severity = 'low') => {
    const s = (severity || 'low').toLowerCase();
    switch (s) {
      case 'high':
      case 'critical':
        return <span className="badge badge-red">High Severity</span>;
      case 'medium':
        return <span className="badge badge-amber">Medium Severity</span>;
      default:
        return <span className="badge badge-blue">Low Severity</span>;
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="pulse-dot" style={{ width: '12px', height: '12px', marginBottom: '1rem' }}></div>
        <h2>Loading candidate session data from MongoDB...</h2>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2rem', borderTop: '4px solid var(--accent-red)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.5rem', color: '#fff' }}>
            Unable to Load Exam Session
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {error || 'The requested session could not be retrieved from the server.'}
          </p>
          <button onClick={() => navigate('/proctor/dashboard')} className="btn btn-primary" style={{ width: '100%' }}>
            Return to Proctor Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isCompleted = session.status === 'completed';
  const isDisconnected = session.realtimeStatus === 'disconnected';

  return (
    <div>
      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button
          id="back-to-proctor-dashboard"
          onClick={() => navigate('/proctor/dashboard')}
          className="btn btn-outline btn-sm"
        >
          ← Back to Proctor Dashboard
        </button>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="exam-monitoring-badge" id="session-realtime-badge">
            <span className="pulse-dot" style={{ backgroundColor: isDisconnected ? '#ef4444' : isCompleted ? '#6b7280' : '#10b981' }}></span>
            {isDisconnected ? 'Candidate Disconnected' : isCompleted ? 'Session Concluded' : 'Live Realtime Monitored'}
          </span>
        </div>
      </div>

      {saveSuccessMsg && (
        <div
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span>✓</span> {saveSuccessMsg}
        </div>
      )}

      {/* Requirement E: Real Session Header Banner */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          borderLeft: `4px solid ${
            session.maxSeverity === 'high' ? 'var(--accent-red)' : session.maxSeverity === 'medium' ? '#f59e0b' : 'var(--accent-green)'
          }`
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: '800' }} id="candidate-header-name">
                {session.candidate?.name || 'Candidate'}
              </h1>
              <span className="badge badge-blue">Session: {session.id.slice(-6)}</span>
              <span
                className={`badge ${
                  isDisconnected ? 'badge-red' : session.status === 'active' ? 'badge-green' : 'badge-blue'
                }`}
                id="session-status-badge"
              >
                {isDisconnected ? 'Disconnected' : session.status === 'active' ? 'Active Exam' : 'Completed'}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Email: <strong>{session.candidate?.email || 'N/A'}</strong> • Examination: <strong style={{ color: '#fff' }}>{session.examTitle}</strong> (Sensitivity: {session.examSensitivity})
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL FLAGS</div>
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: '800',
                  color: flags.length > 0 ? '#ef4444' : '#10b981'
                }}
                id="session-flag-count-display"
              >
                {flags.length}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>INTEGRITY STATUS</div>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: flags.length > 0 ? '#ef4444' : '#10b981' }}>
                {flags.length > 0 ? '⚠️ Flagged Incidents' : '🟢 Pristine Integrity'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Telemetry & Notes + Chronological Flag Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Metadata & Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Assessment Telemetry Metadata Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ fontSize: '1.1rem' }}>Candidate Environmental Telemetry</h3>
              <span className="badge badge-green"><span className="pulse-dot"></span> SCREENSHOT-FREE</span>
            </div>

            <div
              style={{
                height: '160px',
                background: '#090d16',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed var(--border-color)',
                position: 'relative'
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.4rem' }}>🛡️</div>
              <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: '600' }}>ProctorShield DOM Sentinel</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem', textAlign: 'center', maxWidth: '80%' }}>
                Privacy-preserving telemetry, temporal correlation, and screenshot-free metadata verification active
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Start Time:</span>{' '}
                <code>{formatTimestamp(session.startedAt)}</code>
              </div>
              <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>End Time:</span>{' '}
                <code>{session.endedAt ? formatTimestamp(session.endedAt) : 'In Progress'}</code>
              </div>
              <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Max Severity:</span>{' '}
                <strong>{session.maxSeverity?.toUpperCase()}</strong>
              </div>
              <div style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Heartbeat:</span>{' '}
                <code>{formatTimestamp(session.lastHeartbeat)}</code>
              </div>
            </div>
          </div>

          {/* Proctor Supervisor Session Notes */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ fontSize: '1.1rem' }}>Proctor Supervisor Notes</h3>
            </div>

            <form onSubmit={handleAddNote} style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
              <input
                id="proctor-note-input"
                type="text"
                className="form-input"
                placeholder="Type an observation note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                style={{ flex: 1 }}
              />
              <button id="add-note-btn" type="submit" className="btn btn-primary btn-sm">
                Add Note
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {notes.map((note) => (
                <div key={note.id} style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                    <strong>{note.author}</strong>
                    <span>{note.time}</span>
                  </div>
                  <div>{note.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Chronological Flag Timeline & Review Workflow */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title" style={{ fontSize: '1.1rem' }}>Detection Event Timeline & Review</h3>
              <p className="card-subtitle">Chronological record of integrity anomalies persisted in MongoDB</p>
            </div>
            <span className="badge badge-amber" id="session-flags-badge">
              {flags.length} {flags.length === 1 ? 'Flag' : 'Flags'} Raised
            </span>
          </div>

          <div className="timeline" id="session-timeline">
            {flags.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '1.5rem 0', textAlign: 'center' }}>
                🛡️ No suspicious flags or integrity alerts detected for this candidate session.
              </div>
            ) : (
              flags.map((flag, idx) => {
                const isEditing = reviewingFlagId === flag._id;
                const editState = flagEditState[flag._id] || {
                  note: flag.note || '',
                  verdict: flag.verdict || 'pending',
                  reviewed: Boolean(flag.reviewed)
                };

                return (
                  <div
                    key={flag._id || idx}
                    className={`timeline-item ${flag.severity?.toLowerCase() || 'medium'}`}
                    id={`flag-item-${flag._id}`}
                  >
                    <div className="timeline-content">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{flag.code}</strong>
                          {getSeverityBadge(flag.severity)}
                          <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: '600' }}>
                            (Score: {flag.score})
                          </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {formatTimestamp(flag.raisedAt)}
                        </span>
                      </div>

                      {/* Evidence signals */}
                      <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                        Correlated Signals:{' '}
                        <strong style={{ color: '#fca5a5' }}>
                          {Array.isArray(flag.evidence?.signals) ? flag.evidence.signals.join(', ') : 'Telemetry Signal'}
                        </strong>
                      </p>

                      {/* Requirement F: Review status & verdict badges */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', padding: '0.5rem 0', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={`badge ${flag.reviewed ? 'badge-green' : 'badge-gray'}`} id={`flag-reviewed-status-${flag._id}`}>
                            {flag.reviewed ? '✓ Reviewed' : 'Pending Review'}
                          </span>
                          <span className="badge badge-outline" style={{ fontSize: '0.75rem' }}>
                            Verdict: <strong>{flag.verdict?.replace('_', ' ')?.toUpperCase() || 'PENDING'}</strong>
                          </span>
                          {flag.reviewedBy && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              by {flag.reviewedBy?.name || 'Proctor'}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            id={`toggle-review-btn-${flag._id}`}
                            className={`btn btn-sm ${flag.reviewed ? 'btn-secondary' : 'btn-success'}`}
                            onClick={() => handleToggleReviewed(flag)}
                            disabled={savingFlagId === flag._id}
                          >
                            {flag.reviewed ? 'Mark Unreviewed' : 'Mark Reviewed ✓'}
                          </button>
                          <button
                            id={`edit-review-btn-${flag._id}`}
                            className="btn btn-outline btn-sm"
                            onClick={() => setReviewingFlagId(isEditing ? null : flag._id)}
                          >
                            {isEditing ? 'Cancel Edit' : 'Edit Review & Note ✎'}
                          </button>
                        </div>
                      </div>

                      {/* Display existing review note if present */}
                      {flag.note && !isEditing && (
                        <div
                          id={`flag-note-display-${flag._id}`}
                          style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            background: 'rgba(0, 0, 0, 0.25)',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            borderLeft: '3px solid var(--accent-blue)'
                          }}
                        >
                          <span style={{ color: 'var(--text-muted)' }}>Supervisor Note:</span> {flag.note}
                        </div>
                      )}

                      {/* Requirement F: Inline Flag Review Form */}
                      {isEditing && (
                        <div
                          id={`flag-review-form-${flag._id}`}
                          style={{
                            marginTop: '0.75rem',
                            padding: '0.85rem',
                            background: 'var(--bg-primary)',
                            borderRadius: '8px',
                            border: '1px solid var(--accent-blue)'
                          }}
                        >
                          <h4 style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.5rem', color: '#fff' }}>
                            Proctor Review Decision
                          </h4>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                                Investigation Verdict
                              </label>
                              <select
                                id={`flag-verdict-select-${flag._id}`}
                                className="form-input"
                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                                value={editState.verdict}
                                onChange={(e) =>
                                  setFlagEditState((prev) => ({
                                    ...prev,
                                    [flag._id]: { ...editState, verdict: e.target.value }
                                  }))
                                }
                              >
                                <option value="pending">Pending Evaluation</option>
                                <option value="valid">Valid Infraction (Cheating)</option>
                                <option value="false_positive">False Positive</option>
                                <option value="dismissed">Dismissed (Minor)</option>
                              </select>
                            </div>

                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                                Review Status
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input
                                  id={`flag-reviewed-checkbox-${flag._id}`}
                                  type="checkbox"
                                  checked={editState.reviewed}
                                  onChange={(e) =>
                                    setFlagEditState((prev) => ({
                                      ...prev,
                                      [flag._id]: { ...editState, reviewed: e.target.checked }
                                    }))
                                  }
                                />
                                Mark as Completed Review
                              </label>
                            </div>
                          </div>

                          <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                              Proctor Investigation Note
                            </label>
                            <textarea
                              id={`flag-note-input-${flag._id}`}
                              className="form-input"
                              rows={2}
                              placeholder="Enter justification or observation details..."
                              style={{ width: '100%', fontSize: '0.8rem', resize: 'vertical' }}
                              value={editState.note}
                              onChange={(e) =>
                                setFlagEditState((prev) => ({
                                  ...prev,
                                  [flag._id]: { ...editState, note: e.target.value }
                                }))
                              }
                            />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setReviewingFlagId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              id={`save-flag-review-btn-${flag._id}`}
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={savingFlagId === flag._id}
                              onClick={() => handleSaveFlagReview(flag._id)}
                            >
                              {savingFlagId === flag._id ? 'Saving to MongoDB...' : 'Save Review to MongoDB ✓'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Initial timeline marker */}
            <div className="timeline-item">
              <div className="timeline-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.88rem' }}>Session Initialized</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {formatTimestamp(session.startedAt)}
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Candidate successfully authenticated and entered the proctored environment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
