// In-browser integrity detector (ported + trimmed from Browser_overlay_detection_dashboard).
// Emits small signals only: never keystrokes, typed code, clipboard contents or page text.
//
// startDetector({ onSignal, blockPaste, isSeb, editorCopyRef }) -> stop()
// onSignal({ code, meta }) is called for every signal (the caller batches + sends them).

const KNOWN_FINGERPRINTS = [
  { tool: 'GRAMMARLY', selectors: ['grammarly-desktop-integration', 'grammarly-extension', '[data-grammarly-shadow-root]'] },
  { tool: 'SIDER', selectors: ['[id^="sider"]', '[class*="sider-"]', 'sider-ui'] },
  { tool: 'MONICA', selectors: ['[id*="monica" i]', '[class*="monica" i]', 'monica-assistant'] },
  { tool: 'MAXAI', selectors: ['[id*="maxai" i]', 'use-chat-gpt-ai'] },
  { tool: 'MERLIN', selectors: ['[id*="merlin" i][style*="position"]', 'merlin-component'] },
  { tool: 'HARPA', selectors: ['harpa-app', '[id*="harpa" i]'] },
  { tool: 'COPILOT', selectors: ['[id*="copilot" i][style*="position"]'] },
  { tool: 'CLUELY', selectors: ['[id*="cluely" i]', '[class*="cluely" i]', 'cluely-overlay'] },
];

const isAppNode = (el) => {
  try {
    // Our own UI lives in [data-app]; Monaco appends a few helper nodes to <body>.
    return Boolean(el.closest('[data-app], [class*="monaco"], .context-view')) || el.id === 'root';
  } catch {
    return true;
  }
};

function shortHash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).slice(0, 7);
}

export function startDetector({ onSignal, blockPaste = true, isSeb = false, editorCopyRef = { current: '' } }) {
  const emit = (code, meta = {}) => {
    try {
      onSignal({ code, t: Date.now(), meta });
    } catch {
      /* never break the exam because of the detector */
    }
  };
  const reported = new Set();
  const once = (key, code, meta) => {
    if (reported.has(key)) return;
    reported.add(key);
    emit(code, meta);
  };
  const cleanups = [];
  const on = (target, ev, fn, opts) => {
    target.addEventListener(ev, fn, opts);
    cleanups.push(() => target.removeEventListener(ev, fn, opts));
  };

  // ---- focus / visibility ----
  let blurAt = 0;
  on(window, 'blur', () => {
    blurAt = Date.now();
    emit('WINDOW_BLUR');
  });
  on(window, 'focus', () => {
    if (blurAt) emit('WINDOW_BLUR', { returnedAfterMs: Date.now() - blurAt });
    blurAt = 0;
  });
  on(document, 'visibilitychange', () => {
    if (document.hidden) emit('TAB_HIDDEN');
  });

  // ---- fullscreen (non-SEB browsers) ----
  on(document, 'fullscreenchange', () => {
    if (!document.fullscreenElement && !isSeb) emit('FULLSCREEN_EXIT');
  });

  // ---- clipboard: block paste from outside the editor, copy of the paper ----
  on(
    document,
    'paste',
    (e) => {
      if (!blockPaste) return;
      const text = (e.clipboardData?.getData('text') ?? '').replace(/\r\n/g, '\n');
      // Allow pasting something the candidate copied from their own editor.
      if (text && editorCopyRef.current && text === editorCopyRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      emit('PASTE_BLOCKED', { length: text.length });
    },
    true
  );
  const copyGuard = (e) => {
    const inEditor = e.target?.closest?.('.monaco-editor');
    if (inEditor) return; // editor copy handled by the editor component
    e.preventDefault();
    emit('COPY_BLOCKED');
  };
  on(document, 'copy', copyGuard, true);
  on(document, 'cut', copyGuard, true);
  on(document, 'drop', (e) => {
    e.preventDefault();
    emit('PASTE_BLOCKED', { drop: true });
  }, true);
  on(document, 'contextmenu', (e) => {
    e.preventDefault();
    emit('CONTEXT_MENU');
  });
  on(
    window,
    'keydown',
    (e) => {
      const k = (e.key || '').toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const blocked =
        k === 'f12' ||
        k === 'printscreen' ||
        (mod && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) ||
        (mod && ['u', 'p', 's'].includes(k));
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        emit('SHORTCUT_BLOCKED', { key: k.slice(0, 12) });
      }
    },
    true
  );

  // ---- devtools heuristic (docked devtools shrink the viewport) ----
  const devtoolsCheck = () => {
    const gapW = window.outerWidth - window.innerWidth;
    const gapH = window.outerHeight - window.innerHeight;
    if (gapW > 200 || gapH > 250) once(`dev:${Math.round(gapW / 100)}:${Math.round(gapH / 100)}`, 'DEVTOOLS_SUSPECTED', { gapW, gapH });
  };

  // ---- extra monitor (Chrome exposes screen.isExtended) ----
  const screenCheck = () => {
    if (window.screen && window.screen.isExtended === true) once('multiscreen', 'MULTI_SCREEN', {});
  };

  // ---- DOM scan: overlays, extension iframes, injected shadow roots, known tools ----
  const baselineTop = [...document.body.children].filter((c) => !isAppNode(c) && !['SCRIPT', 'STYLE', 'LINK'].includes(c.tagName)).length;
  const scanDom = () => {
    const vw = Math.max(1, window.innerWidth * window.innerHeight);
    // Only look outside our own app root (extensions inject into <body>/<html>).
    const roots = [...document.body.children, ...document.documentElement.children].filter(
      (c) => c !== document.body && c !== document.head && !isAppNode(c)
    );
    const candidates = roots.flatMap((r) => [r, ...r.querySelectorAll('*')]);
    let checked = 0;
    for (const el of candidates) {
      if (checked++ > 3000) break;
      if (isAppNode(el)) continue;
      if (el.tagName === 'IFRAME') {
        const src = el.getAttribute('src') || '';
        if (/^(chrome|moz|safari-web)-extension:\/\//.test(src)) {
          once(`iframe:${shortHash(src)}`, 'EXTENSION_IFRAME', { scheme: src.split(':')[0] });
        }
      }
      if (el.shadowRoot) once(`shadow:${el.tagName}:${shortHash(el.id + el.className)}`, 'FOREIGN_SHADOW_ROOT', { tag: el.tagName.slice(0, 20) });
      try {
        const st = getComputedStyle(el);
        if ((st.position === 'fixed' || st.position === 'absolute') && st.display !== 'none' && st.visibility !== 'hidden') {
          const z = parseInt(st.zIndex, 10);
          const r = el.getBoundingClientRect();
          const area = (Math.max(0, r.width) * Math.max(0, r.height)) / vw;
          if (Number.isFinite(z) && z > 999 && area >= 0.04) {
            once(`overlay:${el.tagName}:${z}:${shortHash(el.id + el.className)}`, 'OVERLAY_NODE', {
              tag: el.tagName.slice(0, 20),
              z,
              areaPct: Math.round(area * 100),
            });
          }
        }
      } catch {
        /* detached */
      }
    }
    // Elements injected directly under <html> are almost always extensions.
    for (const el of document.documentElement.children) {
      if (el !== document.head && el !== document.body) once(`html-child:${el.tagName}`, 'DOM_INJECTION', { tag: el.tagName.slice(0, 20) });
    }
    const top = [...document.body.children].filter((c) => !isAppNode(c) && !['SCRIPT', 'STYLE', 'LINK'].includes(c.tagName)).length;
    if (top - baselineTop >= 2) once(`delta:${top}`, 'DOM_INJECTION', { added: top - baselineTop });
    for (const fp of KNOWN_FINGERPRINTS) {
      for (const sel of fp.selectors) {
        try {
          const hit = document.querySelector(sel);
          if (hit && !isAppNode(hit)) {
            once(`fp:${fp.tool}`, 'KNOWN_FINGERPRINT', { tool: fp.tool });
            break;
          }
        } catch {
          /* invalid selector in this browser */
        }
      }
    }
  };

  // ---- network ----
  on(window, 'offline', () => emit('NETWORK_OFFLINE'));

  let mutTimer = null;
  const observer = new MutationObserver(() => {
    if (mutTimer) return;
    mutTimer = setTimeout(() => {
      mutTimer = null;
      scanDom();
    }, 400);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'src'] });

  const interval = setInterval(() => {
    scanDom();
    devtoolsCheck();
    screenCheck();
  }, 3000);
  scanDom();
  screenCheck();

  return function stop() {
    clearInterval(interval);
    if (mutTimer) clearTimeout(mutTimer);
    observer.disconnect();
    cleanups.forEach((fn) => fn());
  };
}
