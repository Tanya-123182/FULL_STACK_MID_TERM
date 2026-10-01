/**
 * ProctorShield Development Detector Debug Panel
 * Displayed ONLY during development mode to inspect real-time detector status,
 * pending batches, recent signals, and trigger the controlled test overlay.
 */

import React, { useState, useEffect } from 'react';
import { getDetectorStatus, subscribeToDetector } from './detector.js';
import { injectDemoOverlay, removeDemoOverlay, isDemoOverlayInjected } from './demoOverlay.js';

export default function DetectorDebugPanel() {
  const [status, setStatus] = useState(getDetectorStatus());
  const [isOverlayInjected, setIsOverlayInjected] = useState(isDemoOverlayInjected());
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToDetector((newStatus) => {
      setStatus(newStatus);
      setIsOverlayInjected(isDemoOverlayInjected());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleToggleOverlay = () => {
    if (isDemoOverlayInjected()) {
      removeDemoOverlay();
      setIsOverlayInjected(false);
    } else {
      injectDemoOverlay();
      setIsOverlayInjected(true);
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
    <div
      id="ps-detector-debug-panel"
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        width: isExpanded ? '380px' : 'auto',
        maxHeight: '480px',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        borderRadius: '10px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6)',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '12px',
        zIndex: 9000,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          backgroundColor: '#0f172a',
          borderBottom: isExpanded ? '1px solid #1e293b' : 'none',
          cursor: 'pointer'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: status.status === 'ACTIVE' ? '#10b981' : '#6b7280'
            }}
          ></span>
          <strong style={{ fontSize: '12px', color: '#60a5fa' }}>
            Detector Telemetry [DEV]
          </strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: status.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(107, 114, 128, 0.2)',
              color: status.status === 'ACTIVE' ? '#34d399' : '#9ca3af',
              fontWeight: '700'
            }}
          >
            {status.status}
          </span>
          <span style={{ color: '#94a3b8', fontSize: '11px' }}>{isExpanded ? '▼' : '▲'}</span>
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
          {/* Status Metrics Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              backgroundColor: '#1e293b',
              padding: '8px',
              borderRadius: '6px'
            }}
          >
            <div>
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>SIGNALS DETECTED</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: status.signalsDetectedCount > 0 ? '#ef4444' : '#10b981' }}>
                {status.signalsDetectedCount}
              </div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>PENDING BATCHES</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#38bdf8' }}>
                {status.pendingBatchCount || 0}
              </div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>LAST SIGNAL CODE</div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#f59e0b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {status.lastSignalCode || 'None'}
              </div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '10px' }}>LAST DETECTION</div>
              <div style={{ fontSize: '11px', color: '#cbd5e1' }}>
                {formatTimestamp(status.lastSignalTime)}
              </div>
            </div>
          </div>

          {/* Test Overlay Trigger Controls */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              id="test-overlay-toggle-btn"
              onClick={handleToggleOverlay}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isOverlayInjected ? '#ef4444' : '#3b82f6',
                color: '#fff',
                fontWeight: '600',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {isOverlayInjected ? '✕ Remove Demo Overlay' : '+ Inject Demo Overlay'}
            </button>
          </div>

          {/* Recent Signals List */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '4px' }}>
              Recent Signals ({status.recentSignals?.length || 0}):
            </div>

            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                backgroundColor: '#0f172a',
                padding: '6px',
                borderRadius: '6px',
                border: '1px solid #1e293b'
              }}
            >
              {(!status.recentSignals || status.recentSignals.length === 0) ? (
                <div style={{ padding: '8px', textAlign: 'center', color: '#64748b', fontSize: '11px' }}>
                  No suspicious DOM signals observed
                </div>
              ) : (
                status.recentSignals.map((sig) => (
                  <div
                    key={sig.id}
                    style={{
                      padding: '4px 6px',
                      backgroundColor: '#1e293b',
                      borderRadius: '4px',
                      fontSize: '11px',
                      borderLeft: `3px solid ${
                        sig.code === 'KNOWN_FINGERPRINT'
                          ? '#ef4444'
                          : sig.code.includes('SPIKE') || sig.code.includes('COVERAGE')
                          ? '#f59e0b'
                          : '#60a5fa'
                      }`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#f1f5f9' }}>{sig.code}</strong>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        {formatTimestamp(sig.timestamp)}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                      Src: <code>{sig.source}</code>
                      {sig.fingerprint && <span> • FP: <strong style={{ color: '#f87171' }}>{sig.fingerprint}</strong></span>}
                      {sig.zIndex && <span> • Z: {sig.zIndex}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
