import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { md, VERDICT_LABEL, verdictTone, fmtDate } from '../../lib/format';
import { useToast } from '../../components/ui';
import { IconAlert, IconCheck, IconClock, IconCpu, IconJava, IconPlay, IconReset, IconSend, IconTerminal, IconTrophy, IconX } from '../../components/icons';

const CodeEditor = lazy(() => import('../../components/CodeEditor'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollSubmission(id, onTick) {
  for (let i = 0; i < 180; i += 1) {
    const s = await api('GET', `/c/submissions/${id}`);
    onTick?.(s);
    if (s.status === 'DONE' || s.status === 'ERROR') return s;
    await sleep(i < 5 ? 700 : 1200);
  }
  throw new Error('The judge is taking too long. Check your submissions list in a minute.');
}

function TestPills({ tests }) {
  return (
    <div>
      <div className="cz-io-label" style={{ margin: '2px 0 6px' }}>Hidden tests</div>
      {tests.map((t, i) => (
        <span key={i} className={`testpill ${verdictTone(t.verdict)}`} title={`${VERDICT_LABEL[t.verdict] || t.verdict} · ${t.timeMs} ms`}>
          #{i + 1} {t.verdict}
        </span>
      ))}
    </div>
  );
}

const TONE_ICON = { ok: IconCheck, bad: IconX, warn: IconAlert };

function ResultView({ result }) {
  if (!result) {
    return (
      <div className="cz-console-hint">
        <IconTerminal size={16} />
        <span>
          <kbd>Run</kbd> tests your code on the sample inputs. <kbd>Submit</kbd> evaluates it on hidden test cases and scores it.
        </span>
      </div>
    );
  }
  if (result.pending) {
    return (
      <div className="cz-judging" role="status">
        <span className="cz-spinner" style={{ color: 'var(--primary)' }} />
        <span>{result.queuePosition ? 'Waiting in the judge queue…' : 'Compiling and judging…'}</span>
        {result.queuePosition ? <span className="sub">position #{result.queuePosition}</span> : <span className="sub">javac · java</span>}
      </div>
    );
  }
  if (result.error) return <div className="error-box">{result.error}</div>;
  const tone = verdictTone(result.verdict);
  const ToneIcon = TONE_ICON[tone] || IconAlert;
  const showScore = result.kind === 'SUBMIT' && result.verdict !== 'CE';
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className={`cz-verdict ${tone}`}>
        <span className="ic"><ToneIcon size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="t">{VERDICT_LABEL[result.verdict] || result.verdict}</div>
          <div className="s">
            {showScore ? (
              <>Passed <b>{result.passed}</b>/{result.total} hidden tests</>
            ) : result.kind === 'RUN' ? (
              'Sample run · not scored'
            ) : (
              'Fix the errors below and submit again'
            )}
          </div>
        </div>
        {showScore && (
          <div className="score">
            <div className="n num">
              {result.score}
              <small>/{result.maxScore}</small>
            </div>
            <div className="mini">
              <div style={{ width: `${result.maxScore ? (result.score / result.maxScore) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>
      {result.compileOutput && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="cz-io-label" style={{ color: 'var(--bad)' }}>Compilation error</div>
          <pre className="cz-err-pre">{result.compileOutput}</pre>
        </div>
      )}
      {result.kind === 'SUBMIT' && result.tests?.length > 0 && <TestPills tests={result.tests} />}
      {result.kind === 'RUN' &&
        result.runOutputs?.map((o, i) => (
          <div key={i} className="test-card stack" style={{ gap: 10 }}>
            <div className="row small" style={{ alignItems: 'center', gap: 8 }}>
              <b>{o.expected != null ? `Sample case ${i + 1}` : 'Custom input'}</b>
              <span className={`badge ${verdictTone(o.verdict)}`}>{VERDICT_LABEL[o.verdict] || o.verdict}</span>
              <span className="muted mono" style={{ fontSize: 12 }}>
                <IconClock size={11} style={{ verticalAlign: -1 }} /> {o.timeMs} ms
              </span>
            </div>
            <div className="test-io-grid">
              <div className="stack" style={{ gap: 5 }}>
                <div className="cz-io-label">Input</div>
                <pre className="io-box">{o.input ? o.input.trim() : '(empty)'}</pre>
              </div>
              {o.expected != null && (
                <div className="stack" style={{ gap: 5 }}>
                  <div className="cz-io-label">Expected output</div>
                  <pre className="io-box">{o.expected ? o.expected.trim() : '(empty)'}</pre>
                </div>
              )}
              <div className="stack" style={{ gap: 5 }}>
                <div className="cz-io-label">Your output</div>
                <pre className={`io-box ${o.verdict === 'AC' || o.verdict === 'OK' ? 'io-ok' : 'io-bad'}`}>
                  {o.stdout ? o.stdout.trim() : '(no output)'}
                </pre>
              </div>
            </div>
            {o.stderr && (
              <div className="stack" style={{ gap: 5 }}>
                <div className="cz-io-label" style={{ color: 'var(--bad)' }}>Standard error</div>
                <pre className="cz-err-pre" style={{ maxHeight: 80 }}>{o.stderr}</pre>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}

export default function CodingSection({ contestId, problem, initialCode, best, editorCopyRef, onDraft, onBest, disabled }) {
  const toast = useToast();
  const [code, setCode] = useState(initialCode || problem.starterCode || '');
  const [customOn, setCustomOn] = useState(false);
  const [customInput, setCustomInput] = useState(problem.samples?.[0]?.input || '');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const draftTimer = useRef(null);

  const loadHistory = useCallback(async () => {
    try {
      const d = await api('GET', `/c/contests/${contestId}/problems/${problem._id}/submissions`);
      setHistory(d.items);
    } catch {
      /* non-critical */
    }
  }, [contestId, problem._id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const change = (v) => {
    setCode(v);
    onDraft(problem._id, v, false);
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => onDraft(problem._id, v, true), 2500);
  };
  useEffect(() => () => clearTimeout(draftTimer.current), []);

  const judge = async (kind) => {
    if (!code.trim()) return toast('Write some code first', 'bad');
    setBusy(true);
    setResult({ pending: true });
    try {
      const path = `/c/contests/${contestId}/problems/${problem._id}/${kind === 'RUN' ? 'run' : 'submit'}`;
      const body = kind === 'RUN' ? { code, input: customOn ? customInput : null } : { code };
      const { submissionId } = await api('POST', path, body);
      const s = await pollSubmission(submissionId, (x) => x.status === 'QUEUED' && setResult({ pending: true, queuePosition: x.queuePosition }));
      setResult(s);
      if (kind === 'SUBMIT') {
        loadHistory();
        if (s.status === 'DONE') onBest(problem._id, s.score, s.maxScore);
        toast(s.verdict === 'AC' ? 'Accepted! Full marks on this problem.' : `Submitted: ${s.score}/${s.maxScore}`, s.verdict === 'AC' ? 'ok' : '');
      }
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setBusy(false);
    }
  };

  const resetCode = () => {
    if (window.confirm('Replace your code with the starter template?')) change(problem.starterCode || '');
  };

  return (
    <div className="code-wrap">
      <section className="statement no-select">
        <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <h2 className="cz-prob-title">{problem.title}</h2>
          <span className="badge info" style={{ flex: 'none' }}>{problem.points} pts</span>
        </div>
        <div className="cz-prob-meta">
          <span><IconClock size={13} /> <b>{problem.timeLimitMs / 1000}s</b> limit</span>
          <span><IconCpu size={13} /> <b>{problem.memoryMb} MB</b></span>
          <span><IconJava size={13} /> Java 21 · class <b className="mono">Main</b></span>
          {best && (
            <span className="best"><IconTrophy size={13} /> Best <b>{best.score}</b>/{best.max}</span>
          )}
        </div>
        <div className="md" dangerouslySetInnerHTML={md(problem.statement)} />
        {problem.inputFormat && (<div className="cz-sec"><h3>Input</h3><div className="md" dangerouslySetInnerHTML={md(problem.inputFormat)} /></div>)}
        {problem.outputFormat && (<div className="cz-sec"><h3>Output</h3><div className="md" dangerouslySetInnerHTML={md(problem.outputFormat)} /></div>)}
        {problem.constraints && (<div className="cz-sec"><h3>Constraints</h3><div className="md" dangerouslySetInnerHTML={md(problem.constraints)} /></div>)}
        {problem.samples?.length > 0 && (
          <div className="cz-sec">
            <h3>Examples</h3>
            {problem.samples.map((s, i) => (
              <div key={i} className="cz-sample">
                <div className="cz-sample-head">SAMPLE {i + 1}</div>
                <div className="cz-sample-grid">
                  <div><div className="k">Input</div><pre>{s.input}</pre></div>
                  <div><div className="k">Output</div><pre>{s.output}</pre></div>
                </div>
                {s.explanation && <div className="md" dangerouslySetInnerHTML={md(s.explanation)} />}
              </div>
            ))}
          </div>
        )}
        {history.length > 0 && (
          <div className="cz-sec">
            <h3>Your submissions</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Time</th><th>Verdict</th><th>Score</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h._id}>
                      <td>{fmtDate(h.createdAt)}</td>
                      <td><span className={`badge ${verdictTone(h.verdict)}`}>{h.verdict || h.status}</span></td>
                      <td className="num">{h.score}/{h.maxScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="editor-pane">
        <div className="editor-bar">
          <span className="cz-file-tab"><i /> Main.java</span>
          <span className="cz-lang">Java 21</span>
          <span className="grow" />
          <button className="btn sm ghost" onClick={resetCode} disabled={disabled}>
            <IconReset size={13} /> Reset
          </button>
        </div>
        <div className="editor-canvas">
          <Suspense fallback={<div className="cz-editor-loading"><span className="cz-spinner" style={{ color: 'var(--primary)' }} /> Loading editor…</div>}>
            <CodeEditor path={`problem-${problem._id}.java`} value={code} onChange={change} editorCopyRef={editorCopyRef} />
          </Suspense>
        </div>
        <div className={`console ${result || customOn ? 'has-content' : ''}`}>
          <div className="console-head">
            <span className="cz-console-title">
              <IconTerminal size={14} /> Console
            </span>
            <span className="grow" />
            <label className="cz-switch">
              <input type="checkbox" checked={customOn} onChange={(e) => setCustomOn(e.target.checked)} />
              <span className="track" aria-hidden="true" /> Custom input
            </label>
            <button className="btn sm" disabled={busy || disabled} onClick={() => judge('RUN')}>
              {busy ? <span className="cz-spinner" style={{ width: 12, height: 12 }} /> : <IconPlay size={12} />} {busy ? 'Running…' : 'Run'}
            </button>
            <button className="btn sm primary" disabled={busy || disabled} onClick={() => judge('SUBMIT')}>
              {busy ? <span className="cz-spinner" style={{ width: 12, height: 12 }} /> : <IconSend size={12} />} {busy ? 'Submitting…' : 'Submit'}
            </button>
          </div>
          <div className="console-body stack" style={{ gap: 8 }}>
            {customOn && (
              <textarea className="textarea" rows={4} value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder="Input for your program" />
            )}
            <ResultView result={result} />
          </div>
        </div>
      </section>
    </div>
  );
}
