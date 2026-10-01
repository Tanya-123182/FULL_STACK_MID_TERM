import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return <span className="badge badge-red">Admin</span>;
      case 'proctor':
        return <span className="badge badge-amber">Proctor</span>;
      case 'candidate':
        return <span className="badge badge-blue">Candidate</span>;
      default:
        return null;
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="nav-brand" onClick={() => navigate(isAuthenticated ? `/${user.role}/dashboard` : '/login')} style={{ cursor: 'pointer' }}>
          <div className="brand-shield">🛡️</div>
          <span>ProctorShield</span>
        </div>

        {isAuthenticated && (
          <nav>
            <ul className="nav-links">
              {user.role === 'candidate' && (
                <li>
                  <NavLink
                    to="/candidate/dashboard"
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    Candidate Dashboard
                  </NavLink>
                </li>
              )}

              {user.role === 'proctor' && (
                <li>
                  <NavLink
                    to="/proctor/dashboard"
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    Proctor Control Center
                  </NavLink>
                </li>
              )}

              {user.role === 'admin' && (
                <>
                  <li>
                    <NavLink
                      to="/admin/dashboard"
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    >
                      Admin Dashboard
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/admin/exams"
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    >
                      Assessments
                    </NavLink>
                  </li>
                  <li>
                    <NavLink
                      to="/admin/fingerprints"
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    >
                      Anti-Cheat Rules
                    </NavLink>
                  </li>
                </>
              )}
            </ul>
          </nav>
        )}

        <div className="nav-auth-badge">
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <span style={{ color: '#fff', fontWeight: '600' }}>{user.name}</span>
                {getRoleBadge(user.role)}
              </div>
              <button
                id="logout-btn"
                onClick={handleLogout}
                className="btn btn-outline btn-sm"
                style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171' }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <NavLink to="/login" className="btn btn-primary btn-sm">
              Sign In
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
