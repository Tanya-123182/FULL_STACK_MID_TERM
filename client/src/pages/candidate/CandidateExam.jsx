import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { startDetector, stopDetector } from '../../detector/detector.js';
import DetectorDebugPanel from '../../detector/DetectorDebugPanel.jsx';
import { connectSocket, disconnectSocket, getSocket } from '../../realtime/socket.js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default function CandidateExam() {
  const { examId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const navigate = useNavigate();
  const { token } = useAuth();

  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionId]: optionIndex }
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(45 * 60);

  // Initialize Realtime Socket.IO and Detector only during an active candidate exam session
  useEffect(() => {
    if (!sessionId || !token || !exam || isSubmitted) return;

    const socket = connectSocket(token);

    // Join session and exam rooms on server
    socket.emit('session:join', { sessionId });

    // Start detector with batch streaming callback
    startDetector(sessionId, {
      onBatch: (batch) => {
        if (socket.connected && batch?.signals?.length > 0) {
          socket.emit('signals:batch', {
            sessionId,
            signals: batch.signals
          });
        }
      }
    });

    // Periodic heartbeat every 15 seconds
    const heartbeatTimer = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { sessionId });
      }
    }, 15000);

    return () => {
      clearInterval(heartbeatTimer);
      if (socket.connected) {
        socket.emit('session:leave', { sessionId });
      }
      stopDetector();
    };
  }, [sessionId, token, exam, isSubmitted]);

  // Fetch real exam details from MongoDB
  useEffect(() => {
    const fetchExam = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/exams/${examId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load exam contents');
        }

        const loadedExam = data.exam;
        setExam(loadedExam);

        if (loadedExam.durationMinutes) {
          setTimeLeft(loadedExam.durationMinutes * 60);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (token && examId) {
      fetchExam();
    }
  }, [examId, token]);

  // Timer countdown
  useEffect(() => {
    if (isSubmitted || loading || !exam) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSubmitted, loading, exam]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const questions = exam?.questions || [];
  const currentQuestion = questions[currentIndex] || null;
  const totalQuestions = questions.length;
  const answeredCount = Object.keys(answers).length;

  const handleSelectOption = (optIndex) => {
    if (isSubmitted || !currentQuestion) return;
    setAnswers(prev => ({
      ...prev,
      [currentQuestion._id || currentIndex]: optIndex
    }));
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleSubmitExam = async () => {
    if (isSubmitted || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const socket = getSocket();
      if (socket && socket.connected && sessionId) {
        socket.emit('session:leave', { sessionId });
      }
      stopDetector(); // Cleanly deactivate detection engine immediately upon submission
      disconnectSocket();

      if (sessionId) {
        await fetch(`${API_BASE_URL}/sessions/${sessionId}/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
      }
      setIsSubmitted(true);
    } catch (err) {
      console.error('Error concluding session:', err);
      // Still show completion screen
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="pulse-dot" style={{ width: '12px', height: '12px', marginBottom: '1rem' }}></div>
        <h2>Initializing Secure Assessment Environment...</h2>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div style={{ maxWidth: '540px', margin: '3rem auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2rem', borderTop: '4px solid var(--accent-red)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '0.5rem', color: '#fff' }}>
            Unable to Load Examination
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {error || 'The requested exam could not be loaded.'}
          </p>
          <button onClick={() => navigate('/candidate/dashboard')} className="btn btn-primary" style={{ width: '100%' }}>
            Return to Candidate Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              fontSize: '2rem',
              marginBottom: '1rem'
            }}
          >
            ✓
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.5rem' }}>
            Exam Submitted Successfully
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Your assessment for <strong>{exam.title}</strong> has been concluded and recorded in MongoDB.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              background: 'var(--bg-secondary)',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '2rem'
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>QUESTIONS ATTEMPTED</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#60a5fa' }}>
                {answeredCount} / {totalQuestions}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>SESSION STATUS</div>
              <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#10b981' }}>Completed</div>
            </div>
          </div>

          <button
            id="back-to-dashboard-btn"
            onClick={() => navigate('/candidate/dashboard')}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem' }}
          >
            Return to Candidate Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div style={{ maxWidth: '600px', margin: '3rem auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <h3>No Questions Found</h3>
          <p style={{ color: 'var(--text-muted)', margin: '1rem 0' }}>This exam does not currently contain questions.</p>
          <button onClick={() => navigate('/candidate/dashboard')} className="btn btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Exam Header */}
      <div className="exam-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <span className="exam-monitoring-badge" id="monitoring-indicator">
              <span className="pulse-dot"></span> ProctorShield Monitoring Active
            </span>
            <span className="badge badge-gray">Session: {sessionId ? sessionId.slice(-6) : 'Active'}</span>
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '700' }}>{exam.title}</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="exam-timer" id="exam-timer">
            ⏱️ {formatTime(timeLeft)}
          </div>
          <button
            id="submit-exam-btn"
            onClick={handleSubmitExam}
            disabled={isSubmitting}
            className="btn btn-danger btn-sm"
          >
            {isSubmitting ? 'Submitting...' : 'End & Submit Exam'}
          </button>
        </div>
      </div>

      {/* Main Question Card */}
      {currentQuestion && (
        <div className="question-card">
          <div className="question-meta">
            <span style={{ fontWeight: '600', color: '#fff' }} id="question-number-display">
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            <span>{answeredCount} of {totalQuestions} answered</span>
          </div>

          <h2 className="question-title" id="question-text">
            {currentQuestion.questionText}
          </h2>

          {/* Options */}
          <div className="options-list">
            {currentQuestion.options.map((optionText, optIdx) => {
              const qKey = currentQuestion._id || currentIndex;
              const isSelected = answers[qKey] === optIdx;
              return (
                <label
                  key={optIdx}
                  className={`option-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectOption(optIdx)}
                >
                  <input
                    type="radio"
                    name={`question-${qKey}`}
                    className="option-radio"
                    checked={isSelected}
                    onChange={() => handleSelectOption(optIdx)}
                  />
                  <span style={{ fontSize: '0.95rem' }}>{optionText}</span>
                </label>
              );
            })}
          </div>

          {/* Navigation & Controls */}
          <div className="exam-nav-bar">
            <button
              id="prev-question-btn"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="btn btn-secondary"
            >
              ← Previous
            </button>

            <div className="question-palette">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = answers[q._id || idx] !== undefined;
                return (
                  <button
                    key={q._id || idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`palette-btn ${isCurrent ? 'current' : ''} ${isAnswered ? 'answered' : ''}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <button
              id="next-question-btn"
              onClick={handleNext}
              disabled={currentIndex === totalQuestions - 1}
              className="btn btn-primary"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Development Detector Telemetry & Test Overlay Panel */}
      {import.meta.env.DEV && !isSubmitted && sessionId && (
        <DetectorDebugPanel />
      )}
    </div>
  );
}
