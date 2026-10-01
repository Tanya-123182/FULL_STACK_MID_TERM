/**
 * ProctorShield Controlled Demo Test Overlay
 * Used for development testing and hackathon demonstrations.
 * Simulates the browser-visible evidence of an injected assistant/overlay
 * without relying on external third-party software.
 */

const OVERLAY_ID = 'proctorshield-demo-panel';

export function isDemoOverlayInjected() {
  return !!document.getElementById(OVERLAY_ID);
}

/**
 * Injects a controlled test overlay directly into document.body.
 * Satisfies multiple detection criteria:
 * - Fixed high-Z geometry
 * - Large viewport coverage (>15% width and >= 250px)
 * - Open Shadow DOM root
 * - Embedded test iframe
 * - Rapid node insertion (simulating a complex injected UI)
 * - Controlled test fingerprint: "PROCTORSHIELD_DEMO_OVERLAY"
 */
export function injectDemoOverlay() {
  if (isDemoOverlayInjected()) {
    return document.getElementById(OVERLAY_ID);
  }

  // 1. Create main host element
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'ps-demo-overlay proctorshield-test-assistant';
  overlay.setAttribute('data-ps-overlay', 'true');
  overlay.setAttribute('data-injected', 'true');
  overlay.setAttribute('data-ps-test', 'assistant');

  // Apply fixed high-z geometry docked to right edge
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '80px',
    right: '20px',
    width: '320px',
    height: '420px',
    zIndex: '99999',
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
    border: '2px solid #ef4444',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  });

  // 2. Attach an open Shadow DOM root
  let root = overlay;
  try {
    const shadow = overlay.attachShadow({ mode: 'open' });
    const shadowContainer = document.createElement('div');
    shadowContainer.style.height = '100%';
    shadowContainer.style.display = 'flex';
    shadowContainer.style.flexDirection = 'column';
    shadow.appendChild(shadowContainer);
    root = shadowContainer;
  } catch (err) {
    console.warn('Could not attach shadow root to demo overlay:', err);
  }

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '12px 16px',
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #334155',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  });
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;"></span>
      <strong style="font-size:13px;color:#f87171;">TEST INJECTED OVERLAY</strong>
    </div>
    <span style="font-size:10px;padding:2px 6px;background:#334155;border-radius:4px;color:#cbd5e1;">Z-99999</span>
  `;
  root.appendChild(header);

  // Body content with simulated assistant UI
  const content = document.createElement('div');
  Object.assign(content.style, {
    padding: '16px',
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto'
  });

  // Multiple child nodes to trigger rapid node addition
  for (let i = 1; i <= 6; i++) {
    const item = document.createElement('div');
    item.style.padding = '8px 12px';
    item.style.backgroundColor = '#334155';
    item.style.borderRadius = '6px';
    item.style.fontSize = '12px';
    item.style.color = '#e2e8f0';
    item.textContent = `Synthetic Assistant Card #${i} (Test Data)`;
    content.appendChild(item);
  }

  // Embed a small synthetic test iframe
  const iframeWrapper = document.createElement('div');
  iframeWrapper.style.marginTop = 'auto';
  iframeWrapper.style.borderTop = '1px solid #334155';
  iframeWrapper.style.paddingTop = '8px';

  const testIframe = document.createElement('iframe');
  testIframe.src = 'about:blank';
  testIframe.title = 'Injected Assistant Frame';
  testIframe.style.width = '100%';
  testIframe.style.height = '60px';
  testIframe.style.border = 'none';
  testIframe.style.borderRadius = '4px';
  testIframe.style.backgroundColor = '#0f172a';
  iframeWrapper.appendChild(testIframe);
  content.appendChild(iframeWrapper);

  root.appendChild(content);

  // Append overlay to document.body
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Removes the demo test overlay from document.body.
 */
export function removeDemoOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
    return true;
  }
  return false;
}
