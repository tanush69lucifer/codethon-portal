import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { fmtDate, fmtDuration, md } from '../../lib/format';
import { isSebUserAgent } from '../../lib/seb';
import TopBar from '../../components/TopBar';
import { ErrorState, Loading, PageLoader, StatusBadge, useAsync } from '../../components/ui';

export default function Lobby() {
  const { contestId } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api('GET', `/c/contests/${contestId}`), [contestId]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (data?.serverNow) setOffset(data.serverNow - Date.now());
  }, [data]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <PageLoader label="Loading contest lobby…" />;
  if (error) return <><TopBar /><main className="page"><ErrorState error={error} onRetry={reload} /></main></>;

  const { contest, attempt, browser, counts, sebConfigUrl } = data;
  const serverNow = now + offset;
  const opensIn = new Date(contest.startAt).getTime() - serverNow;
  const policy = contest.proctoring?.browserPolicy;
  const needsSeb = policy === 'SEB_REQUIRED' && !browser.seb;
  const sebLink = sebConfigUrl ? `${window.location.protocol === 'https:' ? 'sebs' : 'seb'}://${window.location.host}${sebConfigUrl}` : null;

  const start = async () => {
    setBusy(true);
    setStartError(null);
    try {
      if (contest.proctoring?.requireFullscreen && !isSebUserAgent() && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
      await api('POST', `/c/contests/${contestId}/start`, {
        screen: { w: window.screen.width, h: window.screen.height, extended: window.screen.isExtended === true },
      });
      navigate(`/contest/${contestId}/exam`, { replace: true });
    } catch (err) {
      setStartError(err);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar />
      <main className="page stack" style={{ maxWidth: 820 }}>
        <div className="row between">
          <h1 style={{ margin: 0 }}>{contest.title}</h1>
          <StatusBadge status={attempt.status} />
        </div>
        <div className="grid4">
          <div className="stat"><div className="label">Duration</div><div className="value">{contest.durationMin} min</div></div>
          <div className="stat"><div className="label">MCQs</div><div className="value">{counts.mcq}</div></div>
          <div className="stat"><div className="label">Coding (Java)</div><div className="value">{counts.problems}</div></div>
          <div className="stat"><div className="label">Window</div><div className="small">{fmtDate(contest.startAt)} → {fmtDate(contest.endAt)}</div></div>
        </div>

        {contest.instructions && <div className="card md" dangerouslySetInnerHTML={md(contest.instructions)} />}

        <div className="card stack">
          <h3>Marking</h3>
          <div className="muted">
            MCQ: +{contest.mcq?.marks} per correct answer{contest.mcq?.negative ? `, −${contest.mcq.negative} per wrong answer` : ', no negative marking'}.
            Coding: points per hidden test passed; your best submission per problem counts.
          </div>
        </div>

        {needsSeb && (
          <div className="warn-box stack">
            <b>This contest only opens in Safe Exam Browser (SEB).</b>
            <span>
              1. Install SEB from safeexambrowser.org (Windows or macOS).{' '}
              {sebLink ? (
                <>2. Click <a href={sebLink}>Open in Safe Exam Browser</a> (or <a href={sebConfigUrl}>download the config file</a> and double-click it).</>
              ) : (
                <>2. Open the config file the organisers sent you.</>
              )}{' '}
              3. Log in again inside SEB and press Start.
            </span>
          </div>
        )}
        {policy === 'SEB_REQUIRED' && browser.seb && !browser.verified && browser.reason === 'SEB_KEY_MISMATCH' && (
          <div className="error-box">Safe Exam Browser is running with the wrong configuration. Close it and open the official config file.</div>
        )}

        {attempt.status === 'LOCKED' && <div className="error-box">{attempt.lockedReason || 'Your attempt is locked. Contact the organisers.'}</div>}
        {attempt.status === 'SUBMITTED' && <div className="info-box">You have submitted this test. Results will be announced by the organisers.</div>}

        {attempt.status === 'IN_PROGRESS' && (
          <button className="btn primary" onClick={start} disabled={busy}>
            {busy ? 'Opening…' : `Resume test (${fmtDuration(new Date(attempt.deadlineAt).getTime() - serverNow)} left)`}
          </button>
        )}

        {attempt.status === 'NOT_STARTED' && (
          <div className="card stack">
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I will work alone and only on this page. I will not use other tabs, apps, AI tools, browser extensions, phones or anyone&apos;s help.
                I understand that integrity signals (tab switches, leaving fullscreen, extensions, paste attempts) are recorded and reviewed by the organisers.
              </span>
            </label>
            {opensIn > 0 ? (
              <button className="btn" disabled>Opens in {fmtDuration(opensIn)}</button>
            ) : (
              <button className="btn primary" disabled={!agree || busy || needsSeb} onClick={start}>
                {busy ? 'Starting…' : 'I understand — Start test'}
              </button>
            )}
            <span className="muted small">The timer starts when you press Start and keeps running even if you close the page.</span>
          </div>
        )}
        {startError && <ErrorState error={startError} />}
      </main>
    </>
  );
}
