import React from 'react';
import { useNavigate } from 'react-router-dom';
import { mockAdminExams, mockAdminFingerprints } from '../../data/mockData';

export default function AdminDashboard() {
  const navigate = useNavigate();

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800' }}>Admin Operations Center</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Platform infrastructure, exam scheduling, proctor assignments, and anti-cheat fingerprint management.
        </p>
      </div>

      {/* KPI Stats Grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Total Exams</span>
          <span className="stat-value">{mockAdminExams.length + 10}</span>
          <span className="stat-hint">Active & scheduled exams</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Candidates</span>
          <span className="stat-value">342</span>
          <span className="stat-hint">Registered students</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Proctors</span>
          <span className="stat-value">18</span>
          <span className="stat-hint">Certified supervisors</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active Sessions</span>
          <span className="stat-value" style={{ color: '#3b82f6' }}>8</span>
          <span className="stat-hint">Currently live sessions</span>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Exams Management Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '1.5rem', padding: '0.4rem 0.6rem', background: 'rgba(59, 130, 246, 0.15)', borderRadius: '8px', color: '#60a5fa' }}>📝</div>
              <h2 className="card-title">Exam Management</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Create, configure, and monitor exam schedules, set duration parameters, and manage candidate enrollments.
            </p>
          </div>
          <button 
            id="nav-to-exams-btn"
            onClick={() => navigate('/admin/exams')}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            Manage Exams ({mockAdminExams.length}) →
          </button>
        </div>

        {/* Anti-Cheat Fingerprints Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '1.5rem', padding: '0.4rem 0.6rem', background: 'rgba(168, 85, 247, 0.15)', borderRadius: '8px', color: '#c084fc' }}>🧬</div>
              <h2 className="card-title">Anti-Cheat Fingerprints</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Maintain signatures for GenAI tools, screen-sharing utilities, virtual machines, and unauthorized background processes.
            </p>
          </div>
          <button 
            id="nav-to-fingerprints-btn"
            onClick={() => navigate('/admin/fingerprints')}
            className="btn btn-secondary"
            style={{ width: '100%' }}
          >
            Configure Fingerprints ({mockAdminFingerprints.length}) →
          </button>
        </div>
      </div>

      {/* System Status Summary */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ fontSize: '1.1rem' }}>Platform Health & Integrity Status</h3>
          <span className="badge badge-green"><span className="pulse-dot"></span> All Systems Operational</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
          <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>REST API ENGINE</div>
            <div style={{ fontWeight: '600', color: '#34d399', marginTop: '0.2rem' }}>Online (Express 4.21)</div>
          </div>
          <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>AI TELEMETRY PIPELINE</div>
            <div style={{ fontWeight: '600', color: '#34d399', marginTop: '0.2rem' }}>Ready (Mock Mode)</div>
          </div>
          <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>WEBSOCKET GATEWAY</div>
            <div style={{ fontWeight: '600', color: '#60a5fa', marginTop: '0.2rem' }}>Configured</div>
          </div>
        </div>
      </div>
    </div>
  );
}
