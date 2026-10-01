import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default function AdminExams() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [exams, setExams] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [proctors, setProctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal & Form State
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Exam Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [sensitivity, setSensitivity] = useState('medium');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [selectedProctorIds, setSelectedProctorIds] = useState([]);
  const [questions, setQuestions] = useState([]);

  // Question Form Fields
  const [qText, setQText] = useState('');
  const [opt0, setOpt0] = useState('');
  const [opt1, setOpt1] = useState('');
  const [opt2, setOpt2] = useState('');
  const [opt3, setOpt3] = useState('');
  const [correctOptIdx, setCorrectOptIdx] = useState('0');
  const [questionError, setQuestionError] = useState('');

  // Fetch Exams & Registered Users
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // 1. Fetch Exams
      const examRes = await fetch(`${API_BASE_URL}/exams`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const examData = await examRes.json();
      if (!examRes.ok) throw new Error(examData.error || 'Failed to fetch exams');
      setExams(examData.exams || []);

      // 2. Fetch Users for Candidate & Proctor selection
      const usersRes = await fetch(`${API_BASE_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const usersData = await usersRes.json();
      if (usersRes.ok && usersData.users) {
        setCandidates(usersData.users.filter(u => u.role === 'candidate'));
        setProctors(usersData.users.filter(u => u.role === 'proctor'));
      }
    } catch (err) {
      console.error('Error fetching admin exam data:', err);
      setError(err.message || 'Unable to load exams and users');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token, fetchData]);

  const initModal = () => {
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const toLocalISO = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setTitle('');
    setDescription('');
    setStartAt(toLocalISO(now));
    setEndAt(toLocalISO(twoHoursLater));
    setSensitivity('medium');
    setSelectedCandidateIds(candidates.map(c => c._id)); // Select all available by default
    setSelectedProctorIds(proctors.map(p => p._id));     // Select all available by default
    setQuestions([]);
    setQuestionError('');
    setShowModal(true);
  };

  const handleAddQuestion = () => {
    setQuestionError('');
    if (!qText.trim()) {
      setQuestionError('Please enter question text');
      return;
    }
    const options = [opt0.trim(), opt1.trim(), opt2.trim(), opt3.trim()];
    if (options.some(o => !o)) {
      setQuestionError('All 4 options must be filled out');
      return;
    }

    const correctChoice = options[parseInt(correctOptIdx, 10)];

    setQuestions(prev => [
      ...prev,
      {
        questionText: qText.trim(),
        options,
        correctAnswer: correctChoice
      }
    ]);

    // Reset question inputs
    setQText('');
    setOpt0('');
    setOpt1('');
    setOpt2('');
    setOpt3('');
    setCorrectOptIdx('0');
  };

  const handleRemoveQuestion = (idx) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleToggleCandidate = (id) => {
    setSelectedCandidateIds(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const handleToggleProctor = (id) => {
    setSelectedProctorIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!title.trim()) {
      setError('Exam title is required');
      return;
    }

    if (new Date(endAt) <= new Date(startAt)) {
      setError('End time must be strictly after start time');
      return;
    }

    if (questions.length === 0) {
      setError('Please add at least 1 question to the exam');
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        title: title.trim(),
        description: description.trim(),
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        sensitivity,
        candidateIds: selectedCandidateIds,
        proctorIds: selectedProctorIds,
        questions
      };

      const res = await fetch(`${API_BASE_URL}/exams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create exam');
      }

      setSuccessMsg(`Exam "${data.exam?.title || title}" created successfully in MongoDB!`);
      setShowModal(false);
      fetchData();
    } catch (err) {
      console.error('Error creating exam:', err);
      setError(err.message || 'Error occurred while saving exam');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button 
            onClick={() => navigate('/admin/dashboard')} 
            className="btn btn-outline btn-sm"
            style={{ marginBottom: '0.5rem' }}
          >
            ← Back to Admin Dashboard
          </button>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800' }}>Exam Scheduling & Configurations</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Create and manage examinations, assign candidates and proctors, and define MCQ assessments.
          </p>
        </div>

        <button 
          id="create-exam-btn"
          onClick={initModal} 
          className="btn btn-primary"
        >
          + Create New Exam
        </button>
      </div>

      {successMsg && (
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
          <span>✓</span> {successMsg}
        </div>
      )}

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

      {/* Modal for Creating Exam */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem',
          overflowY: 'auto'
        }}>
          <div className="card" style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card-header" style={{ marginBottom: '1.25rem' }}>
              <h3 className="card-title">Schedule New Exam</h3>
              <button 
                onClick={() => setShowModal(false)}
                className="btn btn-outline btn-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExam}>
              {/* Basic Info */}
              <div className="form-group">
                <label className="form-label">Exam Title *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. CS-402 Distributed Systems Final"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description / Subject</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Comprehensive proctored mid-term assessment"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Start Time *</label>
                  <input 
                    type="datetime-local" 
                    className="form-input" 
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time *</label>
                  <input 
                    type="datetime-local" 
                    className="form-input" 
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">AI Sensitivity Level</label>
                <select
                  className="form-input"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(e.target.value)}
                >
                  <option value="low">Low (Permissive)</option>
                  <option value="medium">Medium (Standard Proctored)</option>
                  <option value="high">High (Strict Flagging)</option>
                </select>
              </div>

              {/* Candidate Selection */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">
                  Assigned Candidates ({selectedCandidateIds.length} Selected)
                </label>
                <div style={{ maxHeight: '100px', overflowY: 'auto', background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '6px' }}>
                  {candidates.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No candidate accounts found</div>
                  ) : (
                    candidates.map(c => (
                      <label key={c._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.35rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedCandidateIds.includes(c._id)} 
                          onChange={() => handleToggleCandidate(c._id)}
                        />
                        <span>{c.name} ({c.email})</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Proctor Selection */}
              <div className="form-group">
                <label className="form-label">
                  Assigned Proctors ({selectedProctorIds.length} Selected)
                </label>
                <div style={{ maxHeight: '100px', overflowY: 'auto', background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '6px' }}>
                  {proctors.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No proctor accounts found</div>
                  ) : (
                    proctors.map(p => (
                      <label key={p._id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.35rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedProctorIds.includes(p._id)} 
                          onChange={() => handleToggleProctor(p._id)}
                        />
                        <span>{p.name} ({p.email})</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Question Builder */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                  Exam Questions ({questions.length} Added)
                </h4>

                {questions.map((q, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-secondary)', padding: '0.65rem 0.85rem', borderRadius: '6px', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>Q{idx + 1}: {q.questionText}</div>
                      <div style={{ fontSize: '0.78rem', color: '#10b981' }}>✓ Correct: {q.correctAnswer}</div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveQuestion(idx)} 
                      className="btn btn-outline btn-sm"
                      style={{ color: '#ef4444' }}
                    >
                      Delete
                    </button>
                  </div>
                ))}

                {/* Add New Question Section */}
                <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px dashed var(--accent-blue)', padding: '1rem', borderRadius: '8px', marginTop: '0.75rem' }}>
                  <div style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '0.5rem', color: '#60a5fa' }}>
                    + Add New MCQ Question
                  </div>

                  {questionError && (
                    <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                      ⚠️ {questionError}
                    </div>
                  )}

                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Question prompt text"
                      value={qText}
                      onChange={(e) => setQText(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Option 1"
                      value={opt0}
                      onChange={(e) => setOpt0(e.target.value)}
                    />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Option 2"
                      value={opt1}
                      onChange={(e) => setOpt1(e.target.value)}
                    />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Option 3"
                      value={opt2}
                      onChange={(e) => setOpt2(e.target.value)}
                    />
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Option 4"
                      value={opt3}
                      onChange={(e) => setOpt3(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                      <span>Correct Answer:</span>
                      <select 
                        className="form-input" 
                        style={{ padding: '0.25rem 0.5rem', width: 'auto' }}
                        value={correctOptIdx}
                        onChange={(e) => setCorrectOptIdx(e.target.value)}
                      >
                        <option value="0">Option 1</option>
                        <option value="1">Option 2</option>
                        <option value="2">Option 3</option>
                        <option value="3">Option 4</option>
                      </select>
                    </div>

                    <button 
                      type="button" 
                      onClick={handleAddQuestion}
                      className="btn btn-outline btn-sm"
                    >
                      + Add Question
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving Exam...' : 'Save & Publish Exam'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Existing Exams Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Configured Assessments ({exams.length})</h2>
            <p className="card-subtitle">All assessments stored in MongoDB database.</p>
          </div>
          <span className="badge badge-blue">Active Roster</span>
        </div>

        <div className="table-container">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="pulse-dot" style={{ width: '8px', height: '8px', marginBottom: '0.5rem' }}></div>
              <p>Loading configured assessments...</p>
            </div>
          ) : exams.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No exams found. Click "+ Create New Exam" above to add your first assessment.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Exam ID</th>
                  <th>Title & Description</th>
                  <th>Schedule Window</th>
                  <th>Sensitivity</th>
                  <th>Enrolled</th>
                  <th>Proctors</th>
                  <th>Questions</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam._id}>
                    <td><code>{exam._id.slice(-6)}</code></td>
                    <td style={{ fontWeight: '600' }}>
                      {exam.title}
                      {exam.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                          {exam.description}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      <div>{new Date(exam.startAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        to {new Date(exam.endAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${exam.sensitivity === 'high' ? 'badge-red' : exam.sensitivity === 'medium' ? 'badge-amber' : 'badge-green'}`}>
                        {exam.sensitivity}
                      </span>
                    </td>
                    <td>
                      <strong>{exam.candidateIds?.length || 0}</strong> Candidates
                    </td>
                    <td>
                      <strong>{exam.proctorIds?.length || 0}</strong> Proctors
                    </td>
                    <td>
                      <span className="badge badge-gray">{exam.questions?.length || 0} MCQs</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

