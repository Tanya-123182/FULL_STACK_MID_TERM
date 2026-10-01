import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('candidate@proctorshield.io');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated && user) {
    if (user.role === 'candidate') return <Navigate to="/candidate/dashboard" replace />;
    if (user.role === 'proctor') return <Navigate to="/proctor/dashboard" replace />;
    if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success) {
      const role = result.user.role;
      if (role === 'candidate') {
        navigate('/candidate/dashboard');
      } else if (role === 'proctor') {
        navigate('/proctor/dashboard');
      } else if (role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/candidate/dashboard');
      }
    } else {
      setError(result.error || 'Invalid email or password');
    }
  };

  const handleQuickFill = (roleType) => {
    setError('');
    setPassword('Password123!');
    if (roleType === 'candidate') {
      setEmail('candidate@proctorshield.io');
    } else if (roleType === 'proctor') {
      setEmail('proctor@proctorshield.io');
    } else if (roleType === 'admin') {
      setEmail('admin@proctorshield.io');
    }
  };

  return (
    <div style={{ maxWidth: '440px', margin: '2rem auto' }}>
      <div className="card" style={{ padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
              fontSize: '1.5rem',
              marginBottom: '0.75rem'
            }}
          >
            🛡️
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#fff' }}>ProctorShield Login</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Sign in with your verified institutional credentials
          </p>
        </div>

        {error && (
          <div
            id="login-error-message"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              marginBottom: '1.25rem',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email-input">
              Email Address
            </label>
            <input
              id="email-input"
              type="email"
              className="form-input"
              placeholder="name@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password-input">
              Password
            </label>
            <input
              id="password-input"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <button
              id="login-submit-btn"
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ width: '100%', padding: '0.75rem' }}
            >
              {isSubmitting ? 'Authenticating...' : 'Sign In to Portal →'}
            </button>
          </div>
        </form>

        {/* Development Helper Quick Fill */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quick Test Accounts (Password: <code>Password123!</code>)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => handleQuickFill('candidate')}
            >
              Candidate
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => handleQuickFill('proctor')}
            >
              Proctor
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => handleQuickFill('admin')}
            >
              Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
