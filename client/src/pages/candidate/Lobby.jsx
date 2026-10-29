import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { fmtDate, fmtDuration, md } from '../../lib/format';
import { isSebUserAgent } from '../../lib/seb';
import TopBar from '../../components/TopBar';
import { ErrorState, PageLoader, StatusBadge, useAsync } from '../../components/ui';
import {
  IconAlert,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconClock,
  IconCode,
  IconEye,
  IconInfo,
  IconList,
  IconLock,
  IconMaximize,
  IconSave,
  IconTrophy,
} from '../../components/icons';

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
  if (error) return <div className="cz"><TopBar /><main className="page"><ErrorState error={error} onRetry={reload} /></main></div>;

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
    <div className="cz">
      <TopBar />
      <main className="page stack" style={{ gap: 20 }}>
        {/* ---------- hero ---------- */}
        <section className="cz-hero cz-rise">
          <div className="cz-grid-bg" />
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="kicker">
                <IconTrophy size={13} /> Contest lobby{contest.category ? ` · ${contest.category}` : ''}
              </div>
              <h1>{contest.title}</h1>
            </div>
            <StatusBadge status={attempt.status} />
          </div>
          <div className="cz-stats">
            <div className="cz-stat">
              <span className="ic o"><IconClock size={18} /></span>
              <div><div className="k">Duration</div><div className="v">{contest.durationMin} min</div></div>
            </div>
            <div className="cz-stat">
              <span className="ic v"><IconList size={18} /></span>
              <div><div className="k">MCQs</div><div className="v">{counts.mcq}</div></div>
            </div>
            <div className="cz-stat">
              <span className="ic p"><IconCode size={18} /></span>
              <div><div className="k">Coding · Java</div><div className="v">{counts.problems}</div></div>
            </div>
            <div className="cz-stat">
              <span className="ic g"><IconCalendar size={18} /></span>
              <div style={{ minWidth: 0 }}><div className="k">Window</div><div className="v sm">{fmtDate(contest.startAt)} → {fmtDate(contest.endAt)}</div></div>
            </div>
          </div>
        </section>

        <div className="cz-lobby">
          {/* ---------- left: instructions ---------- */}
          <div className="stack" style={{ gap: 16 }}>
            {contest.instructions && (
              <div className="card cz-rise d1">
                <h3 className="cz-section-title"><IconInfo size={16} /> Instructions</h3>
                <div className="md" dangerouslySetInnerHTML={md(contest.instructions)} />
              </div>
            )}

            <div className="card cz-rise d2">
              <h3 className="cz-section-title"><IconTrophy size={16} /> Marking</h3>
              <div className="cz-marking">
                <div>
                  <div className="k">MCQ</div>
                  <div className="big">
                    <span className="pos">+{contest.mcq?.marks}</span>
                    {contest.mcq?.negative ? <> / <span className="neg">−{contest.mcq.negative}</span></> : null}
                  </div>
                  <div className="muted small">
                    per correct answer{contest.mcq?.negative ? `, −${contest.mcq.negative} per wrong answer` : ', no negative marking'}
                  </div>
                </div>
                <div>
                  <div className="k">Coding</div>
                  <div className="big">Best of all</div>
                  <div className="muted small">Points per hidden test passed; your best submission per problem counts.</div>
                </div>
              </div>
            </div>

            <div className="card cz-rise d3">
              <h3 className="cz-section-title"><IconEye size={16} /> During the test</h3>
              <ul className="cz-rules">
                <li>
                  <IconMaximize size={15} /> {contest.proctoring?.requireFullscreen ? 'Stay in fullscreen and on this tab.' : 'Stay on this tab.'} Leaving is recorded.
                </li>
                {contest.proctoring?.blockPaste !== false && (
                  <li><IconLock size={15} /> Pasting from outside the editor and copying the paper are blocked.</li>
                )}
                <li><IconSave size={15} /> MCQ answers and code drafts save automatically as you go.</li>
                <li><IconClock size={15} /> The timer keeps running even if you close the page. It auto-submits at zero.</li>
              </ul>
            </div>
          </div>

          {/* ---------- right: ready panel ---------- */}
          <aside className="cz-lobby-side cz-rise d2">
            {needsSeb && (
              <div className="warn-box stack" style={{ gap: 6 }}>
                <b className="row" style={{ gap: 8 }}><IconAlert size={16} /> This contest only opens in Safe Exam Browser (SEB).</b>
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
              <div className="card stack" style={{ gap: 14 }}>
                <div className="cz-countdown">
                  <div className="k">Time left on your attempt</div>
                  <div className="v">{fmtDuration(new Date(attempt.deadlineAt).getTime() - serverNow)}</div>
                </div>
                <button className="btn primary lg cz-start" onClick={start} disabled={busy}>
                  {busy ? <><span className="cz-spinner" /> Opening…</> : <>Resume test <IconArrowRight size={16} /></>}
                </button>
              </div>
            )}

            {attempt.status === 'NOT_STARTED' && (
              <div className="card stack" style={{ gap: 14 }}>
                <h3 className="cz-section-title" style={{ margin: 0 }}><IconCheck size={16} /> Ready check</h3>
                {opensIn > 0 && (
                  <div className="cz-countdown">
                    <div className="k">Opens in</div>
                    <div className="v">{fmtDuration(opensIn)}</div>
                  </div>
                )}
                <label className={`cz-agree ${agree ? 'on' : ''}`}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>
                    I will work alone and only on this page. I will not use other tabs, apps, AI tools, browser extensions, phones or anyone&apos;s help.
                    I understand that integrity signals (tab switches, leaving fullscreen, extensions, paste attempts) are recorded and reviewed by the organisers.
                  </span>
                </label>
                {opensIn > 0 ? (
                  <button className="btn lg cz-start" disabled>
                    <IconClock size={16} /> Opens in {fmtDuration(opensIn)}
                  </button>
                ) : (
                  <button className="btn primary lg cz-start" disabled={!agree || busy || needsSeb} onClick={start}>
                    {busy ? <><span className="cz-spinner" /> Starting…</> : <>I understand — Start test <IconArrowRight size={16} /></>}
                  </button>
                )}
                <span className="muted small" style={{ textAlign: 'center' }}>
                  The timer starts when you press Start and keeps running even if you close the page.
                </span>
              </div>
            )}
            {startError && <ErrorState error={startError} />}
          </aside>
        </div>
      </main>
    </div>
  );
}
