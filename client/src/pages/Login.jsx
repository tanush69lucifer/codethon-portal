import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api';
import { Brand } from '../components/ui';

export default function Login() {
  const [mode, setMode] = useState('candidate');
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = mode === 'admin' ? { email, password: secret } : { email, code: secret };
      const data = await api('POST', '/auth/login', body);
      auth.set(data.token, data.user);
      navigate(data.user.role === 'ADMIN' ? '/admin' : '/home', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card stack">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Brand />
        </div>
        <form className="card stack" onSubmit={submit}>
          <div className="seg" role="tablist">
            <button type="button" className={mode === 'candidate' ? 'active' : ''} onClick={() => setMode('candidate')}>
              Participant
            </button>
            <button type="button" className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')}>
              Organiser
            </button>
          </div>
          <label className="field">
            Email
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            {mode === 'admin' ? 'Password' : 'Access code'}
            <input
              className="input"
              type={mode === 'admin' ? 'password' : 'text'}
              autoComplete={mode === 'admin' ? 'current-password' : 'off'}
              required
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={mode === 'admin' ? '' : 'e.g. K7PM2QXR'}
              style={mode === 'candidate' ? { fontFamily: 'var(--mono)', letterSpacing: '0.1em', textTransform: 'uppercase' } : undefined}
            />
          </label>
          {mode === 'candidate' && (
            <p className="muted small" style={{ margin: 0 }}>
              Use the email you paid with. Your access code was sent by the organisers. Logging in on another device logs you out here.
            </p>
          )}
          {error && <div className="error-box">{error}</div>}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
