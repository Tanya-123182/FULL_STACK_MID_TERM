import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockAdminFingerprints } from '../../data/mockData';

export default function AdminFingerprints() {
  const navigate = useNavigate();
  const [fingerprints, setFingerprints] = useState(mockAdminFingerprints);
  const [showAddForm, setShowAddForm] = useState(false);
  const [toolName, setToolName] = useState('');
  const [fpName, setFpName] = useState('');
  const [category, setCategory] = useState('GenAI Tool');
  const [weight, setWeight] = useState('High (80)');

  const handleToggleStatus = (id) => {
    setFingerprints(prev =>
      prev.map(fp =>
        fp.id === id ? { ...fp, status: fp.status === 'Active' ? 'Inactive' : 'Active' } : fp
      )
    );
  };

  const handleAddFingerprint = (e) => {
    e.preventDefault();
    if (!toolName.trim() || !fpName.trim()) return;

    const newFP = {
      id: `FP-0${fingerprints.length + 1}`,
      tool: toolName.trim(),
      name: fpName.trim(),
      category: category,
      weight: weight,
      status: 'Active'
    };

    setFingerprints([newFP, ...fingerprints]);
    setShowAddForm(false);
    setToolName('');
    setFpName('');
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
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800' }}>Anti-Cheat Fingerprint Signatures</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Configure real-time process detectors, AI assistant signatures, and browser extension blacklists.
          </p>
        </div>

        <button 
          id="add-fingerprint-btn"
          onClick={() => setShowAddForm(true)} 
          className="btn btn-primary"
        >
          + Add Fingerprint Rule
        </button>
      </div>

      {/* Add Fingerprint Modal */}
      {showAddForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%' }}>
            <div className="card-header">
              <h3 className="card-title">Add Detector Fingerprint</h3>
              <button 
                onClick={() => setShowAddForm(false)}
                className="btn btn-outline btn-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddFingerprint}>
              <div className="form-group">
                <label className="form-label">Tool / Application Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Cursor / VSCode AI"
                  value={toolName}
                  onChange={(e) => setToolName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Fingerprint / Signature Pattern</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. cursor.exe / api.cursor.sh"
                  value={fpName}
                  onChange={(e) => setFpName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Threat Category</label>
                <select 
                  className="form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="GenAI Tool">GenAI Tool</option>
                  <option value="Debugger">Debugger / DevTools</option>
                  <option value="Remote Access">Remote Desktop / Mirror</option>
                  <option value="Communication">Communication App</option>
                  <option value="IDE Extension">IDE Extension</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Severity Weight</label>
                <select 
                  className="form-select"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                >
                  <option value="Critical (100)">Critical (100 pts)</option>
                  <option value="High (80)">High (80 pts)</option>
                  <option value="Medium (50)">Medium (50 pts)</option>
                  <option value="Low (20)">Low (20 pts)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddForm(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Signature
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fingerprints Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Active Rule Registry ({fingerprints.length})</h2>
          <span className="badge badge-purple">AI Heuristics & Signatures</span>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Rule ID</th>
                <th>Tool Name</th>
                <th>Fingerprint / Pattern</th>
                <th>Category</th>
                <th>Weight</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {fingerprints.map((fp) => (
                <tr key={fp.id}>
                  <td><code>{fp.id}</code></td>
                  <td style={{ fontWeight: '600' }}>{fp.tool}</td>
                  <td><code>{fp.name}</code></td>
                  <td>
                    <span className="badge badge-blue">{fp.category}</span>
                  </td>
                  <td style={{ fontWeight: '600', color: fp.weight.includes('Critical') ? '#ef4444' : '#fbbf24' }}>
                    {fp.weight}
                  </td>
                  <td>
                    <span className={`badge ${fp.status === 'Active' ? 'badge-green' : 'badge-gray'}`}>
                      {fp.status}
                    </span>
                  </td>
                  <td>
                    <button 
                      onClick={() => handleToggleStatus(fp.id)}
                      className="btn btn-outline btn-sm"
                    >
                      {fp.status === 'Active' ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
