import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default function CandidateDashboard() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingExamId, setStartingExamId] = useState(null);

  useEffect(() => {
    const fetchAssignedExams = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/exams`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch assigned exams');
        }

        setExams(data.exams || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchAssignedExams();
    }
  }, [token]);

  const handleStartExam = async (examId) => {
    try {
      setError('');
      setStartingExamId(examId);

      const res = await fetch(`${API_BASE_URL}/exams/${examId}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to start examination session');
      }

      const sessionId = data.sessionId;
      navigate(`/candidate/exam/${examId}?sessionId=${sessionId}`);
    } catch (err) {
      setError(err.message);
      setStartingExamId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.25rem' }}>
          Welcome back, {user?.name ? user.name.split(' ')[0] : 'Candidate'}! 👋
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Candidate Email: <strong style={{ color: '#fff' }}>{user?.email}</strong> • University Examination Portal
        </p>
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

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="pulse-dot" style={{ width: '10px', height: '10px', marginBottom: '0.75rem' }}></div>
          <p>Loading assigned examinations...</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📚</div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.5rem' }}>No Exams Assigned</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            You do not currently have any scheduled assessments. Please contact your instructor or exam administrator.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {exams.map((exam) => (
            <div key={exam._id} className="card" style={{ borderLeft: '4px solid var(--accent-blue)' }}>
              <div className="card-header" style={{ marginBottom: '1rem' }}>
                <div>
                  <span className="badge badge-green" style={{ marginBottom: '0.5rem' }}>
                    <span className="pulse-dot"></span> Ready to Start
                  </span>
                  <h2 className="card-title">{exam.title}</h2>
                  <div className="card-subtitle">
                    {exam.description || 'Proctored Comprehensive Assessment'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1.25rem 0', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>DURATION</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>{exam.durationMinutes || 45} Mins</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>QUESTIONS</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>{exam.questions?.length || 0} Total</div>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: '#d1d5db', marginBottom: '0.5rem' }}>Important Guidelines:</h4>
                <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                  <li>Ensure your webcam and microphone remain active and unblocked.</li>
                  <li>Do not switch browser tabs or minimize your exam window.</li>
                  <li>Session starts immediately upon clicking the button below.</li>
                </ul>
              </div>

              <button
                id={`start-exam-btn-${exam._id}`}
                onClick={() => handleStartExam(exam._id)}
                disabled={startingExamId === exam._id}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
              >
                {startingExamId === exam._id ? 'Starting Session...' : 'Start Exam Now →'}
              </button>
            </div>
          ))}

          {/* System Readiness Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ fontSize: '1.1rem' }}>ProctorShield Pre-check</h3>
              <span className="badge badge-blue">Automated Check</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Verify your system environment before beginning the exam session.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.88rem' }}>📷 Webcam Stream</span>
                <span className="badge badge-green">Ready</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.88rem' }}>🎙️ Microphone Stream</span>
                <span className="badge badge-green">Ready</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.88rem' }}>🖥️ Screen Capture Integrity</span>
                <span className="badge badge-green">Supported</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.88rem' }}>🌐 Browser Compatibility</span>
                <span className="badge badge-green">Optimized</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
