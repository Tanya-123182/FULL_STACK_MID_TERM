/**
 * ProctorShield Fingerprint Registry & Matcher
 * Provides multi-characteristic detection of known test overlays and generic behavioral patterns.
 * Requires at least 2 independent matched characteristics before emitting a KNOWN_FINGERPRINT signal.
 */

export const FINGERPRINT_REGISTRY = [
  {
    name: 'PROCTORSHIELD_DEMO_OVERLAY',
    confidence: 'high',
    description: 'Controlled test overlay simulating an injected assistance widget',
    selectors: [
      '.ps-demo-overlay',
      '#proctorshield-demo-panel',
      '[data-ps-overlay]',
      '[data-ps-test]'
    ],
    attributes: [
      { name: 'data-ps-overlay', value: 'true' },
      { name: 'data-injected', value: 'true' },
      { name: 'data-ps-test', value: 'assistant' }
    ],
    structuralHints: ['has-shadow-root', 'has-iframe', 'fixed-dock-right', 'high-z-index'],
    keywords: ['proctorshield-demo', 'assistant-demo']
  },
  {
    name: 'GENERIC_FIXED_SIDEBAR',
    confidence: 'medium',
    description: 'Injected full-height or large fixed sidebar docked along viewport boundary',
    selectors: [
      '[class*="sidebar"][style*="fixed"]',
      '[class*="drawer"][style*="fixed"]',
      '[id*="sidebar"][style*="fixed"]'
    ],
    structuralHints: ['fixed-position', 'large-height', 'edge-docked', 'high-z-index'],
    attributes: [{ name: 'role', value: 'complementary' }]
  },
  {
    name: 'UNEXPECTED_FLOATING_PANEL',
    confidence: 'medium',
    description: 'Unregistered floating card or modal container with high z-index',
    selectors: [
      '[class*="floating-panel"]',
      '[class*="copilot"]',
      '[class*="assistant-card"]'
    ],
    structuralHints: ['fixed-position', 'high-z-index', 'large-coverage']
  },
  {
    name: 'INJECTED_TOOLBAR',
    confidence: 'medium',
    description: 'Fixed top/bottom ribbon or banner injected outside core application tree',
    selectors: [
      '[class*="injected-toolbar"]',
      '[id*="injected-toolbar"]'
    ],
    structuralHints: ['fixed-position', 'edge-docked', 'full-width']
  },
  {
    name: 'SUSPICIOUS_SHADOW_HOST',
    confidence: 'low',
    description: 'Custom element or container hosting an open or synthetic shadow tree',
    structuralHints: ['has-shadow-root', 'non-standard-tag']
  }
];

/**
 * Evaluates an element against all registered fingerprints.
 * Only returns fingerprints with >= 2 independent matched characteristics.
 */
export function matchFingerprints(element, context = {}) {
  if (!element || !(element instanceof HTMLElement)) {
    return [];
  }

  const matches = [];

  for (const fp of FINGERPRINT_REGISTRY) {
    const matchedCharacteristics = [];

    // 1. Selector match
    if (fp.selectors && fp.selectors.length > 0) {
      for (const selector of fp.selectors) {
        try {
          if (element.matches && element.matches(selector)) {
            matchedCharacteristics.push(`selector:${selector}`);
            break; // One selector hit counts as selector characteristic
          }
        } catch {
          // Ignore invalid selector syntax
        }
      }
    }

    // 2. Attribute match
    if (fp.attributes && fp.attributes.length > 0) {
      for (const attr of fp.attributes) {
        if (typeof attr === 'string') {
          if (element.hasAttribute(attr)) {
            matchedCharacteristics.push(`attribute:${attr}`);
            break;
          }
        } else if (attr.name) {
          const val = element.getAttribute(attr.name);
          if (val !== null && (attr.value === undefined || val === attr.value)) {
            matchedCharacteristics.push(`attribute:${attr.name}=${attr.value || '*'}`);
            break;
          }
        }
      }
    }

    // 3. Structural Hints check
    if (fp.structuralHints && fp.structuralHints.length > 0) {
      for (const hint of fp.structuralHints) {
        if (hint === 'has-shadow-root' && element.shadowRoot) {
          matchedCharacteristics.push('structural:has-shadow-root');
        } else if (hint === 'has-iframe' && (element.tagName === 'IFRAME' || element.querySelector('iframe'))) {
          matchedCharacteristics.push('structural:has-iframe');
        } else if (hint === 'fixed-position' && context.position === 'fixed') {
          matchedCharacteristics.push('structural:fixed-position');
        } else if (hint === 'high-z-index' && context.zIndex >= 10000) {
          matchedCharacteristics.push('structural:high-z-index');
        } else if (hint === 'fixed-dock-right' && context.position === 'fixed' && context.isRightDocked) {
          matchedCharacteristics.push('structural:fixed-dock-right');
        } else if (hint === 'large-coverage' && context.coverage >= 0.15) {
          matchedCharacteristics.push('structural:large-coverage');
        } else if (hint === 'non-standard-tag' && element.tagName.includes('-')) {
          matchedCharacteristics.push('structural:custom-element');
        }
      }
    }

    // 4. Keyword / Class tokens check (normalized without capturing full text)
    if (fp.keywords && fp.keywords.length > 0) {
      const classStr = (element.className || '').toLowerCase();
      const idStr = (element.id || '').toLowerCase();
      for (const kw of fp.keywords) {
        if (classStr.includes(kw) || idStr.includes(kw)) {
          matchedCharacteristics.push(`token:${kw}`);
          break;
        }
      }
    }

    // REQUIREMENT: Must have 2 or more independent matched characteristics
    if (matchedCharacteristics.length >= 2) {
      matches.push({
        fingerprint: fp.name,
        confidence: fp.confidence,
        matchedCharacteristics,
        matchCount: matchedCharacteristics.length
      });
    }
  }

  return matches;
}
