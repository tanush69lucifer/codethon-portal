import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { fmtDuration } from '../../lib/format';
import { isSebUserAgent } from '../../lib/seb';
import { useProctor } from '../../proctor/useProctor';
import { Brand, ErrorState, Loading, PageLoader, Modal, useToast } from '../../components/ui';
import { IconAlert, IconArrowRight, IconClock, IconLock, IconMaximize, IconSave, IconShield, IconX } from '../../components/icons';
import McqSection from './McqSection';
import CodingSection from './CodingSection';

const lsGet = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

export default function Exam() {
  const { contestId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [paper, setPaper] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [section, setSection] = useState('mcq');
  const [mcqIndex, setMcqIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [review, setReview] = useState({});
  const [drafts, setDrafts] = useState({});
  const [best, setBest] = useState({});
  const [deadline, setDeadline] = useState(0);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [ended, setEnded] = useState(null); // { status, reason }
  const [violations, setViolations] = useState(0);
  const [warning, setWarning] = useState(null);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const pendingAnswers = useRef({}); // mcqId -> choice not yet saved
  const editorCopyRef = useRef('');
  const finishedRef = useRef(false);
  const reviewKey = `cp_review_${contestId}`;

  // ---------- load ----------
  const load = useCallback(async () => {
    try {
      const d = await api('GET', `/c/contests/${contestId}/paper`);
      setPaper(d);
      setAnswers(d.attempt.mcqAnswers || {});
      setDrafts({ ...(lsGet(`cp_drafts_${contestId}`) || {}), ...(d.attempt.codeDrafts || {}) });
      setBest(d.attempt.coding || {});
      setDeadline(new Date(d.attempt.deadlineAt).getTime());
      setOffset(d.serverNow - Date.now());
      setViolations(d.attempt.violations || 0);
      setReview(lsGet(reviewKey) || {});
    } catch (err) {
      if (['ALREADY_SUBMITTED', 'LOCKED', 'NOT_STARTED'].includes(err.code)) navigate(`/contest/${contestId}`, { replace: true });
      else setLoadError(err);
    }
  }, [contestId, navigate, reviewKey]);
  useEffect(() => {
    load();
  }, [load]);

  // ---------- timer ----------
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const remaining = deadline ? deadline - (now + offset) : 0;

  const finish = useCallback(
    async (reason) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setFinishing(true);
      // Flush unsaved MCQ answers first.
      for (const [qid, choice] of Object.entries(pendingAnswers.current)) {
        await api('PUT', `/c/contests/${contestId}/mcq/${qid}`, { choice }).catch(() => {});
      }
      let status = 'SUBMITTED';
      try {
        const r = await api('POST', `/c/contests/${contestId}/finish`);
        status = r.status;
      } catch {
        /* server auto-submits at the deadline anyway */
      }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setEnded({ status, reason });
      setFinishing(false);
    },
    [contestId]
  );

  useEffect(() => {
    if (paper && deadline && remaining <= 0 && !ended) finish('Time is up. Your answers were submitted automatically.');
  }, [remaining, paper, deadline, ended, finish]);

  // ---------- MCQ autosave ----------
  const saveAnswer = useCallback(
    async (qid, choice) => {
      setAnswers((a) => {
        const next = { ...a };
        if (choice === null) delete next[qid];
        else next[qid] = choice;
        return next;
      });
      pendingAnswers.current[qid] = choice;
      try {
        await api('PUT', `/c/contests/${contestId}/mcq/${qid}`, { choice });
        if (pendingAnswers.current[qid] === choice) delete pendingAnswers.current[qid];
      } catch (err) {
        if (err.code === 'ALREADY_SUBMITTED' || err.code === 'LOCKED') setEnded({ status: err.code === 'LOCKED' ? 'LOCKED' : 'SUBMITTED', reason: err.message });
        else toast('Answer not saved yet. Retrying automatically…', 'bad');
      }
    },
    [contestId, toast]
  );
  useEffect(() => {
    const t = setInterval(() => {
      for (const [qid, choice] of Object.entries(pendingAnswers.current)) {
        api('PUT', `/c/contests/${contestId}/mcq/${qid}`, { choice })
          .then(() => {
            if (pendingAnswers.current[qid] === choice) delete pendingAnswers.current[qid];
          })
          .catch(() => {});
      }
    }, 5000);
    return () => clearInterval(t);
  }, [contestId]);

  const toggleReview = (qid) =>
    setReview((r) => {
      const next = { ...r, [qid]: !r[qid] };
      lsSet(reviewKey, next);
      return next;
    });

  // ---------- code drafts ----------
  const onDraft = useCallback(
    (pid, code, persist) => {
      setDrafts((d) => {
        const next = { ...d, [pid]: code };
        lsSet(`cp_drafts_${contestId}`, next);
        return next;
      });
      if (persist) api('PUT', `/c/contests/${contestId}/drafts/${pid}`, { code }).catch(() => {});
    },
    [contestId]
  );
  const onBest = (pid, score, max) =>
    setBest((b) => (b[pid] && b[pid].score >= score ? b : { ...b, [pid]: { score, max } }));

  // ---------- proctoring ----------
  const proctoring = paper?.contest.proctoring;
  const isSeb = isSebUserAgent();
  const needFullscreen = Boolean(proctoring?.requireFullscreen && !isSeb && document.fullscreenEnabled);
  const [windowFocused, setWindowFocused] = useState(true);
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    const onVis = () => setWindowFocused(!document.hidden && document.hasFocus());
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const onServer = useCallback(
    (res) => {
      if (typeof res.violations === 'number') setViolations(res.violations);
      if (res.deadlineAt) setDeadline(new Date(res.deadlineAt).getTime());
      if (res.serverNow) setOffset(res.serverNow - Date.now());
      if (res.status === 'LOCKED') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        setEnded({ status: 'LOCKED', reason: res.lockedReason });
      } else if (res.status === 'SUBMITTED' && !finishedRef.current) {
        setEnded({ status: 'SUBMITTED', reason: 'Your test was submitted.' });
      }
    },
    []
  );
  const onLocalSignal = useCallback((sig) => {
    const msg = {
      TAB_HIDDEN: 'You left the test tab. This has been recorded.',
      FULLSCREEN_EXIT: 'You left fullscreen. This has been recorded.',
      PASTE_BLOCKED: 'Pasting from outside the editor is not allowed.',
      COPY_BLOCKED: 'Copying the question paper is not allowed.',
      MULTI_SCREEN: 'A second screen was detected. Disconnect it.',
      EXTENSION_IFRAME: 'A browser extension was detected on this page. Disable all extensions.',
      KNOWN_FINGERPRINT: 'An assistant extension was detected on this page. Disable it.',
      OVERLAY_NODE: 'Something is drawing over the test page. Close other tools and extensions.',
    }[sig.code];
    if (msg) setWarning(msg);
  }, []);

  const active = Boolean(paper) && !ended;
  useProctor({
    contestId,
    enabled: active,
    blockPaste: proctoring?.blockPaste !== false,
    editorCopyRef,
    onServer,
    onLocalSignal,
  });

  useEffect(() => {
    if (!active) return undefined;
    const beforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [active]);

  const problems = paper?.problems || [];
  const mcqs = paper?.mcqs || [];
  const answeredCount = Object.keys(answers).length;
  const currentProblem = useMemo(() => problems.find((p) => p._id === section), [problems, section]);

  // ---------- render ----------
  if (ended) {
    const locked = ended.status === 'LOCKED';
    return (
      <div className="cz cz-end">
        <div className="cz-grid-bg" />
        <div className="cz-glow a" style={locked ? { background: '#ff5c6c' } : undefined} />
        <div className="cz-end-card">
          {locked ? (
            <span className="cz-icon-ring bad" style={{ width: 84, height: 84 }}>
              <IconLock size={34} />
            </span>
          ) : (
            <svg className="cz-check" viewBox="0 0 84 84" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="42" cy="42" r="38" />
              <path d="M27 43l10 10 20-22" />
            </svg>
          )}
          <h1>{locked ? 'Attempt locked' : 'Test submitted'}</h1>
          <p>{ended.reason || (locked ? 'Contact the organisers.' : 'Thank you! Results will be announced by the organisers.')}</p>
          {locked && (
            <button className="btn lg" onClick={() => navigate(`/contest/${contestId}`, { replace: true })}>
              Check status
            </button>
          )}
          {!locked && (
            <button className="btn primary lg" onClick={() => navigate('/home', { replace: true })}>
              Back to dashboard <IconArrowRight size={16} />
            </button>
          )}
          <div className="cz-end-foot">
            <Brand sub="powered by Genzis" size={26} />
          </div>
        </div>
      </div>
    );
  }
  if (loadError) return <div className="cz"><div className="page"><ErrorState error={loadError} onRetry={load} /></div></div>;
  if (!paper) return <PageLoader label="Loading your paper…" />;

  const lockAt = proctoring?.lockAfterViolations || 0;
  const notInFullscreen = needFullscreen && !fullscreen;
  const focusLost = !isSeb && !windowFocused;
  const blocked = notInFullscreen || focusLost;
  // Purely visual: share of the attempt window still left (for the timer bar).
  const startedAt = paper.attempt?.startedAt ? new Date(paper.attempt.startedAt).getTime() : 0;
  const totalMs = startedAt && deadline > startedAt ? deadline - startedAt : 0;
  const timePct = totalMs ? Math.max(0, Math.min(100, (remaining / totalMs) * 100)) : 0;
  const low = remaining < 5 * 60_000;
  const crit = remaining < 60_000;

  return (
    <div className="cz exam">
      <header className="exam-top">
        <Brand size={28} />
        <span className="exam-divider" />
        <span className="exam-title grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {paper.contest.title}
        </span>
        <span className={`cz-monitor ${violations ? 'warn' : ''}`} title="Integrity monitoring is active">
          <span className={`cz-live ${violations ? 'warn' : ''}`} /> Monitoring{violations ? ` · ${violations}${lockAt ? `/${lockAt}` : ''} warnings` : ''}
        </span>
        <span className={`cz-timer ${low ? 'low' : ''} ${crit ? 'crit' : ''}`} aria-label="Time left" role="timer">
          <IconClock size={16} />
          {fmtDuration(remaining)}
          {totalMs > 0 && <span className="track" style={{ width: `${timePct}%` }} />}
        </span>
        <button className="btn primary" onClick={() => setConfirmFinish(true)} disabled={finishing}>
          Finish test
        </button>
      </header>

      <div className={`exam-body ${blocked ? 'blur-content' : ''}`}>
        <nav className="exam-nav">
          <div className="nav-sep">Section A</div>
          <button className={`nav-item ${section === 'mcq' ? 'active' : ''}`} onClick={() => setSection('mcq')}>
            <span className="nav-main">
              <span className="nav-letter mcq">Q</span>
              <span className="nav-label">MCQs</span>
            </span>
            <span className="badge">{answeredCount}/{mcqs.length}</span>
          </button>
          {mcqs.length > 0 && (
            <div className="nav-progress" aria-hidden="true">
              <div style={{ width: `${(answeredCount / mcqs.length) * 100}%` }} />
            </div>
          )}
          <div className="nav-sep">Section B · Java</div>
          {problems.map((p, i) => (
            <button key={p._id} className={`nav-item ${section === p._id ? 'active' : ''}`} onClick={() => setSection(p._id)} title={p.title}>
              <span className="nav-main">
                <span className="nav-letter">{String.fromCharCode(65 + i)}</span>
                <span className="nav-label">{p.title}</span>
              </span>
              {best[p._id] ? (
                <span className={`badge ${best[p._id].score >= best[p._id].max ? 'ok' : 'warn'}`}>{best[p._id].score}</span>
              ) : (
                <span className="badge">{p.points}</span>
              )}
            </button>
          ))}
          <div className="nav-foot">
            <div><IconSave size={13} /> Progress auto-saves</div>
            <div><IconShield size={13} /> Secure session active</div>
          </div>
        </nav>
        <main className="exam-main">
          {warning && (
            <div className="cz-warn-banner" role="alert">
              <IconAlert size={18} />
              <span className="grow">{warning}</span>
              <button className="btn sm ghost" onClick={() => setWarning(null)} aria-label="Dismiss warning">
                <IconX size={14} /> OK
              </button>
            </div>
          )}
          {section === 'mcq' ? (
            <McqSection
              mcqs={mcqs}
              answers={answers}
              review={review}
              index={mcqIndex}
              setIndex={setMcqIndex}
              onAnswer={saveAnswer}
              onToggleReview={toggleReview}
              negative={paper.contest.mcq?.negative}
            />
          ) : currentProblem ? (
            <CodingSection
              key={currentProblem._id}
              contestId={contestId}
              problem={currentProblem}
              initialCode={drafts[currentProblem._id]}
              best={best[currentProblem._id]}
              editorCopyRef={editorCopyRef}
              onDraft={onDraft}
              onBest={onBest}
              disabled={finishing}
            />
          ) : null}
        </main>
      </div>

      {blocked && (
        <div className="gate">
          <div className="cz-gate-card">
            <span className="cz-icon-ring"><IconMaximize size={26} /></span>
            <h2>{notInFullscreen ? 'Return to fullscreen' : '⚠️ Exam Suspended: Focus Lost'}</h2>
            <p>
              {notInFullscreen
                ? 'The test must stay in fullscreen. Leaving fullscreen is recorded as a violation.'
                : 'You switched windows, opened a screenshot/overlay tool, or clicked outside the exam. Click below to resume.'}
            </p>
            <button
              className="btn primary lg"
              onClick={() => {
                window.focus();
                setWindowFocused(true);
                if (notInFullscreen) {
                  document.documentElement.requestFullscreen().catch(() => {});
                }
              }}
            >
              <IconMaximize size={16} /> {notInFullscreen ? 'Go fullscreen' : 'Resume exam'}            </button>
          </div>
        </div>
      )}

      {confirmFinish && (
        <Modal
          title="Finish the test?"
          onClose={() => setConfirmFinish(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmFinish(false)}>Keep working</button>
              <button className="btn primary" disabled={finishing} onClick={() => finish('Thank you! Your answers have been submitted.')}>
                {finishing ? 'Submitting…' : 'Yes, submit everything'}
              </button>
            </>
          }
        >
          <div className="stack" style={{ gap: 14 }}>
            <div className="cz-summary">
              <div>
                <div className="k">MCQs answered</div>
                <div className="v">{answeredCount} <small>/ {mcqs.length}</small></div>
              </div>
              <div>
                <div className="k">Problems submitted</div>
                <div className="v">
                  {Object.keys(best).filter((k) => problems.some((p) => p._id === k)).length} <small>/ {problems.length}</small>
                </div>
              </div>
            </div>
            <div className="warn-box row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <IconAlert size={16} style={{ flex: 'none', marginTop: 2 }} />
              <span>You cannot come back after submitting. Code that you only ran (not submitted) is not scored.</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
