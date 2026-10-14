import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { startDetector } from './detector';
import { isSebUserAgent } from '../lib/seb';

const FLUSH_MS = 4000;
const HEARTBEAT_MS = 20000;
const URGENT = new Set(['FULLSCREEN_EXIT', 'TAB_HIDDEN', 'EXTENSION_IFRAME', 'KNOWN_FINGERPRINT', 'MULTI_SCREEN', 'OVERLAY_NODE']);

/**
 * Runs the detector during an active attempt and sends events + heartbeats.
 * onServer(response) receives { status, violations, deadlineAt, serverNow, lockedReason }.
 */
export function useProctor({ contestId, enabled, blockPaste, editorCopyRef, onServer, onLocalSignal }) {
  const queue = useRef([]);
  const lastSent = useRef(0);
  const sending = useRef(false);
  const cb = useRef({ onServer, onLocalSignal });
  cb.current = { onServer, onLocalSignal };

  useEffect(() => {
    if (!enabled) return undefined;

    const flush = async (force = false) => {
      if (sending.current) return;
      if (!force && !queue.current.length && Date.now() - lastSent.current < HEARTBEAT_MS) return;
      sending.current = true;
      const events = queue.current.splice(0, 50);
      try {
        const res = await api('POST', `/c/contests/${contestId}/events`, {
          focused: document.hasFocus() && !document.hidden,
          events,
        });
        lastSent.current = Date.now();
        cb.current.onServer?.(res);
      } catch (err) {
        if (err.code === 'NETWORK' || err.status >= 500) queue.current.unshift(...events.slice(0, 100)); // retry later
      } finally {
        sending.current = false;
      }
    };

    const stop = startDetector({
      isSeb: isSebUserAgent(),
      blockPaste,
      editorCopyRef,
      onSignal: (sig) => {
        queue.current.push(sig);
        if (queue.current.length > 300) queue.current.splice(0, queue.current.length - 300);
        cb.current.onLocalSignal?.(sig);
        if (URGENT.has(sig.code)) setTimeout(() => flush(true), 50);
      },
    });
    if (!isSebUserAgent()) queue.current.push({ code: 'NOT_SEB', t: Date.now(), meta: { ua: navigator.userAgent.slice(0, 110) } });
    if (performance.getEntriesByType?.('navigation')?.[0]?.type === 'reload') {
      queue.current.push({ code: 'PAGE_RELOAD', t: Date.now(), meta: {} });
    }

    flush(true);
    const timer = setInterval(() => flush(false), FLUSH_MS);
    const onUnload = () => {
      // Best-effort final flush on close.
      if (queue.current.length) flush(true);
    };
    window.addEventListener('pagehide', onUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', onUnload);
      stop();
      flush(true);
    };
  }, [contestId, enabled, blockPaste, editorCopyRef]);
}
