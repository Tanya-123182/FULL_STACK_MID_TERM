import React from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ allowedRoles }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="pulse-dot" style={{ width: '12px', height: '12px', marginBottom: '1rem' }}></div>
        <p>Verifying secure session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const getTargetDashboard = (role) => {
      switch (role) {
        case 'candidate': return '/candidate/dashboard';
        case 'proctor': return '/proctor/dashboard';
        case 'admin': return '/admin/dashboard';
        default: return '/login';
      }
    };

    return (
      <div style={{ maxWidth: '520px', margin: '3rem auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2rem', borderTop: '4px solid var(--accent-red)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⛔</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: '700', marginBottom: '0.5rem', color: '#fff' }}>
            Access Restricted
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            This resource requires <strong>[{allowedRoles.join(', ')}]</strong> privilege level. Your current account role is <span className="badge badge-amber">{user.role}</span>.
          </p>
          <button 
            onClick={() => navigate(getTargetDashboard(user.role))} 
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            Go to Your {user.role.charAt(0).toUpperCase() + user.role.slice(1)} Portal →
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
