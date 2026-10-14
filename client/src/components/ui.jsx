import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------- toasts ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = '') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'bad' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- modal ----------
export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {onClose && (
            <button className="btn ghost sm" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        {children}
        {footer && (
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="card muted">{label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="error-box row between">
      <span>{error?.message || String(error)}</span>
      {onRetry && (
        <button className="btn sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="card muted" style={{ textAlign: 'center', padding: 28 }}>{children}</div>;
}

const STATUS_TONE = { IN_PROGRESS: 'info', SUBMITTED: 'ok', LOCKED: 'bad', NOT_STARTED: '' };
const STATUS_TEXT = { IN_PROGRESS: 'In progress', SUBMITTED: 'Submitted', LOCKED: 'Locked', NOT_STARTED: 'Not started' };
export function StatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_TONE[status] || ''}`}>
      <span className="dot" aria-hidden />
      {STATUS_TEXT[status] || status}
    </span>
  );
}

/** useAsync(fn, deps) -> { data, error, loading, reload, setData } */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async (silent = false) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
      return null;
    }
  }, []);
  useEffect(() => {
    reload();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function Brand({ name }) {
  return (
    <div className="brand">
      <span className="brand-mark">{'{}'}</span>
      <span>{name || 'Codethon Portal'}</span>
    </div>
  );
}
