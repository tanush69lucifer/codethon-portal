import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api';
import { Brand, CubeMark, Wordmark } from '../components/ui';
import { IconArrowRight, IconInfo, IconKey, IconLock, IconMail, IconSave, IconShield, IconUser, IconCode } from '../components/icons';

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

  const isAdmin = mode === 'admin';

  return (
    <div className="cz cz-auth">
      {/* ---------- brand panel ---------- */}
      <aside className="cz-auth-art" aria-hidden="true">
        <div className="cz-grid-bg" />
        <div className="cz-glow a" />
        <div className="cz-glow b" />
        <CubeMark size={420} className="cz-cube-deco" gap="#120a1f" />

        <div className="cz-presents">
          <CubeMark size={30} />
          <span>
            <b>
              <Wordmark text="GENZIS" />
            </b>{' '}
            presents
          </span>
        </div>

        <div>
          <span className="cz-eyebrow">
            <span className="cz-live" style={{ color: 'var(--primary)' }} /> Solo Codeathon · Java
          </span>
          <h1 className="cz-wordmark">
            <Wordmark text="CODEZIS" />
          </h1>
          <p className="cz-tagline">
            <b>Think it. Code it. Submit it.</b> One seat, one timer, and your best logic against the judge.
          </p>

          <div className="cz-terminal">
            <div className="cz-terminal-bar">
              <i /><i /><i />
              <span>~/codezis — Main.java</span>
            </div>
            <div className="cz-terminal-body">
              <div><span className="p">$</span> javac Main.java</div>
              <div><span className="p">$</span> java Main &lt; sample1.txt</div>
              <div><span className="c">// running 12 hidden tests…</span></div>
              <div>
                <span className="ok">✓ Accepted</span> <span className="c">· 12/12 · 84 ms</span>
                <span className="cz-caret" />
              </div>
            </div>
          </div>
        </div>

        <div className="cz-chips">
          <span className="cz-chip"><IconShield size={14} /> Proctored session</span>
          <span className="cz-chip"><IconSave size={14} /> Answers auto-save</span>
          <span className="cz-chip"><IconCode size={14} /> Java 21 judge</span>
        </div>
      </aside>

      {/* ---------- credentials ---------- */}
      <main className="cz-auth-panel">
        <form className="cz-auth-card" onSubmit={submit}>
          <div className="cz-auth-mobile-brand">
            <Brand size={36} sub="Solo Codeathon" />
          </div>

          <div className="head">
            <h2>{isAdmin ? 'Organiser sign in' : 'Welcome, coder'}</h2>
            <p>{isAdmin ? 'Access the contest control room.' : 'Sign in with your registered email and access code.'}</p>
          </div>

          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={!isAdmin} className={!isAdmin ? 'active' : ''} onClick={() => setMode('candidate')}>
              <IconUser size={14} /> Participant
            </button>
            <button type="button" role="tab" aria-selected={isAdmin} className={isAdmin ? 'active' : ''} onClick={() => setMode('admin')}>
              <IconShield size={14} /> Organiser
            </button>
          </div>

          <label className="cz-field">
            <span>Email</span>
            <span className="cz-input-wrap">
              <IconMail size={17} />
              <input
                className="input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </span>
          </label>

          <label className="cz-field">
            <span>{isAdmin ? 'Password' : 'Access code'}</span>
            <span className="cz-input-wrap">
              {isAdmin ? <IconLock size={17} /> : <IconKey size={17} />}
              <input
                className={`input ${isAdmin ? '' : 'code'}`}
                type={isAdmin ? 'password' : 'text'}
                autoComplete={isAdmin ? 'current-password' : 'off'}
                spellCheck={false}
                required
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={isAdmin ? '••••••••' : 'K7PM2QXR'}
              />
            </span>
          </label>

          {!isAdmin && (
            <p className="cz-help">
              <IconInfo size={14} />
              <span>Use the email you paid with. Your access code was sent by the organisers. Logging in on another device logs you out here.</span>
            </p>
          )}

          {error && <div className="error-box">{error}</div>}

          <button className="btn primary cz-submit" disabled={busy}>
            {busy ? (
              <>
                <span className="cz-spinner" /> Verifying…
              </>
            ) : (
              <>
                {isAdmin ? 'Enter control room' : 'Enter the arena'} <IconArrowRight size={17} className="arrow" />
              </>
            )}
          </button>

          <div className="cz-powered">
            <span>Powered by</span>
            <b>
              <Wordmark text="GENZIS" />
            </b>
            <span>· Generations Ahead</span>
          </div>
        </form>
      </main>
    </div>
  );
}
