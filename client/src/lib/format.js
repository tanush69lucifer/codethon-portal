import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

export function md(text) {
  return { __html: DOMPurify.sanitize(marked.parse(String(text || ''))) };
}

export function fmtDuration(ms) {
  if (ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtAgo(d, now = Date.now()) {
  if (!d) return 'never';
  const s = Math.round((now - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

// datetime-local <-> ISO helpers (local time)
export function toLocalInput(d) {
  if (!d) return '';
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export const VERDICT_LABEL = {
  AC: 'Accepted',
  OK: 'Ran successfully',
  WA: 'Wrong answer',
  TLE: 'Time limit exceeded',
  MLE: 'Memory limit exceeded',
  RE: 'Runtime error',
  CE: 'Compilation error',
  OLE: 'Output too large',
  IE: 'Judge error',
};

export const verdictTone = (v) => (v === 'AC' || v === 'OK' ? 'ok' : v === 'CE' || v === 'IE' ? 'warn' : 'bad');
