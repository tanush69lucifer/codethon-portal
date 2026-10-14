import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { fmtDuration } from '../../lib/format';
import { isSebUserAgent } from '../../lib/seb';
import { useProctor } from '../../proctor/useProctor';
import { Brand, ErrorState, Loading, Modal, useToast } from '../../components/ui';
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
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
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
    return (
      <div className="auth-shell">
        <div className="card stack" style={{ maxWidth: 520, textAlign: 'center' }}>
          <h1>{ended.status === 'LOCKED' ? 'Attempt locked' : 'Test submitted'}</h1>
          <p className="muted">{ended.reason || (ended.status === 'LOCKED' ? 'Contact the organisers.' : 'Thank you! Results will be announced by the organisers.')}</p>
          {ended.status === 'LOCKED' && (
            <button className="btn" onClick={() => navigate(`/contest/${contestId}`, { replace: true })}>
              Check status
            </button>
          )}
          {ended.status !== 'LOCKED' && (
            <button className="btn primary" onClick={() => navigate('/home', { replace: true })}>
              Back to dashboard
            </button>
          )}
        </div>
      </div>
    );
  }
  if (loadError) return <div className="page"><ErrorState error={loadError} onRetry={load} /></div>;
  if (!paper) return <div className="page"><Loading label="Loading your paper…" /></div>;

  const lockAt = proctoring?.lockAfterViolations || 0;
  const blocked = needFullscreen && !fullscreen;

  return (
    <div className="exam">
      <header className="exam-top">
        <Brand />
        <span className="muted small grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {paper.contest.title}
        </span>
        <span className={`badge ${violations ? 'warn' : 'ok'}`} title="Integrity monitoring is active">
          <span className="dot" /> Monitoring{violations ? ` · ${violations}${lockAt ? `/${lockAt}` : ''} warnings` : ''}
        </span>
        <span className={`timer num ${remaining < 5 * 60_000 ? 'low' : ''}`} aria-label="Time left">
          {fmtDuration(remaining)}
        </span>
        <button className="btn primary" onClick={() => setConfirmFinish(true)} disabled={finishing}>
          Finish test
        </button>
      </header>

      <div className={`exam-body ${blocked ? 'blur-content' : ''}`}>
        <nav className="exam-nav">
          <div className="nav-sep">Section A</div>
          <button className={`nav-item ${section === 'mcq' ? 'active' : ''}`} onClick={() => setSection('mcq')}>
            <span>MCQs</span>
            <span className="badge">{answeredCount}/{mcqs.length}</span>
          </button>
          <div className="nav-sep">Section B · Java</div>
          {problems.map((p, i) => (
            <button key={p._id} className={`nav-item ${section === p._id ? 'active' : ''}`} onClick={() => setSection(p._id)}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {String.fromCharCode(65 + i)}. {p.title}
              </span>
              {best[p._id] ? (
                <span className={`badge ${best[p._id].score >= best[p._id].max ? 'ok' : 'warn'}`}>{best[p._id].score}</span>
              ) : (
                <span className="badge">{p.points}</span>
              )}
            </button>
          ))}
        </nav>
        <main className="exam-main">
          {warning && (
            <div className="warn-box row between" style={{ margin: 12 }}>
              <span>{warning}</span>
              <button className="btn sm" onClick={() => setWarning(null)}>OK</button>
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
          <div className="card stack">
            <h2>Return to fullscreen</h2>
            <p className="muted">The test must stay in fullscreen. Leaving fullscreen is recorded as a violation.</p>
            <button className="btn primary" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
              Go fullscreen
            </button>
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
          <div className="stack">
            <div>MCQs answered: <b>{answeredCount}</b> / {mcqs.length}</div>
            <div>
              Coding problems with a submission: <b>{Object.keys(best).filter((k) => problems.some((p) => p._id === k)).length}</b> / {problems.length}
            </div>
            <div className="warn-box">You cannot come back after submitting. Code that you only ran (not submitted) is not scored.</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
