import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { md, VERDICT_LABEL, verdictTone, fmtDate } from '../../lib/format';
import { useToast } from '../../components/ui';

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
      {tests.map((t, i) => (
        <span key={i} className={`testpill ${verdictTone(t.verdict)}`} title={`${VERDICT_LABEL[t.verdict] || t.verdict} · ${t.timeMs} ms`}>
          #{i + 1} {t.verdict}
        </span>
      ))}
    </div>
  );
}

function ResultView({ result }) {
  if (!result) return <div className="muted small" style={{ padding: '6px 0' }}>Click <b>Run</b> to test on sample inputs or <b>Submit</b> to evaluate on hidden test cases.</div>;
  if (result.pending) {
    return (
      <div className="row small" style={{ alignItems: 'center', gap: 8, padding: '8px 0' }}>
        <span className="dot" style={{ background: 'var(--primary)' }} />
        <span className="muted font-bold">{result.queuePosition ? `In judge queue (position ${result.queuePosition})…` : 'Compiling and judging…'}</span>
      </div>
    );
  }
  if (result.error) return <div className="error-box">{result.error}</div>;
  const tone = verdictTone(result.verdict);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <span className={`badge ${tone}`} style={{ fontSize: 13, padding: '4px 10px' }}>
          {VERDICT_LABEL[result.verdict] || result.verdict}
        </span>
        {result.kind === 'SUBMIT' && result.verdict !== 'CE' && (
          <span className="small">
            Passed <b>{result.passed}</b>/{result.total} hidden tests · Score <b className="num">{result.score}</b>/{result.maxScore}
          </span>
        )}
      </div>
      {result.compileOutput && (
        <div className="stack" style={{ gap: 4 }}>
          <div className="small muted font-bold" style={{ color: 'var(--bad)' }}>Compilation Error:</div>
          <pre style={{ color: 'var(--bad)', background: 'var(--bad-soft)', margin: 0, padding: 10, borderRadius: 6, maxHeight: 160, overflowY: 'auto' }}>
            {result.compileOutput}
          </pre>
        </div>
      )}
      {result.kind === 'SUBMIT' && result.tests?.length > 0 && <TestPills tests={result.tests} />}
      {result.kind === 'RUN' &&
        result.runOutputs?.map((o, i) => (
          <div key={i} className="test-card stack" style={{ gap: 8 }}>
            <div className="row small" style={{ alignItems: 'center', gap: 8 }}>
              <b>{o.expected != null ? `Sample Case ${i + 1}` : 'Custom Input Test'}</b>
              <span className={`badge ${verdictTone(o.verdict)}`}>{VERDICT_LABEL[o.verdict] || o.verdict}</span>
              <span className="muted">{o.timeMs} ms</span>
            </div>
            <div className="test-io-grid">
              <div className="stack" style={{ gap: 4 }}>
                <div className="small muted font-bold">Input</div>
                <pre className="io-box">{o.input ? o.input.trim() : '(empty)'}</pre>
              </div>
              {o.expected != null && (
                <div className="stack" style={{ gap: 4 }}>
                  <div className="small muted font-bold">Expected Output</div>
                  <pre className="io-box">{o.expected ? o.expected.trim() : '(empty)'}</pre>
                </div>
              )}
              <div className="stack" style={{ gap: 4 }}>
                <div className="small muted font-bold">Your Output</div>
                <pre className={`io-box ${o.verdict === 'AC' || o.verdict === 'OK' ? 'io-ok' : 'io-bad'}`}>
                  {o.stdout ? o.stdout.trim() : '(no output)'}
                </pre>
              </div>
            </div>
            {o.stderr && (
              <div className="stack" style={{ gap: 4 }}>
                <div className="small muted font-bold" style={{ color: 'var(--bad)' }}>Standard Error</div>
                <pre style={{ color: 'var(--bad)', background: 'var(--bad-soft)', margin: 0, padding: 8, borderRadius: 6, maxHeight: 80, overflowY: 'auto' }}>
                  {o.stderr}
                </pre>
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
        <div className="row between">
          <h2 style={{ margin: 0 }}>{problem.title}</h2>
          <span className="badge info">{problem.points} pts</span>
        </div>
        <div className="small muted" style={{ margin: '6px 0 14px' }}>
          Time limit {problem.timeLimitMs / 1000}s · Memory {problem.memoryMb} MB · Java 21 · class <code>Main</code>
          {best && <> · Your best: <b>{best.score}</b>/{best.max}</>}
        </div>
        <div className="md" dangerouslySetInnerHTML={md(problem.statement)} />
        {problem.inputFormat && (<><h3>Input</h3><div className="md" dangerouslySetInnerHTML={md(problem.inputFormat)} /></>)}
        {problem.outputFormat && (<><h3>Output</h3><div className="md" dangerouslySetInnerHTML={md(problem.outputFormat)} /></>)}
        {problem.constraints && (<><h3>Constraints</h3><div className="md" dangerouslySetInnerHTML={md(problem.constraints)} /></>)}
        {problem.samples?.map((s, i) => (
          <div key={i} style={{ marginTop: 12 }}>
            <h3>Sample {i + 1}</h3>
            <div className="grid2">
              <div><div className="small muted">Input</div><pre>{s.input}</pre></div>
              <div><div className="small muted">Output</div><pre>{s.output}</pre></div>
            </div>
            {s.explanation && <div className="md small" dangerouslySetInnerHTML={md(s.explanation)} />}
          </div>
        ))}
        {history.length > 0 && (
          <div style={{ marginTop: 18 }}>
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
          <span>Main.java</span>
          <span className="grow" />
          <button className="btn sm ghost" style={{ color: '#ccc' }} onClick={resetCode} disabled={disabled}>
            Reset
          </button>
        </div>
        <div className="editor-canvas">
          <Suspense fallback={<div style={{ color: '#aaa', padding: 16 }}>Loading editor…</div>}>
            <CodeEditor path={`problem-${problem._id}.java`} value={code} onChange={change} editorCopyRef={editorCopyRef} />
          </Suspense>
        </div>
        <div className={`console ${result || customOn ? 'has-content' : ''}`}>
          <div className="console-head">
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Test Cases & Output
            </span>
            <span className="grow" />
            <label className="check small" style={{ marginRight: 8 }}>
              <input type="checkbox" checked={customOn} onChange={(e) => setCustomOn(e.target.checked)} /> Custom input
            </label>
            <button className="btn sm" disabled={busy || disabled} onClick={() => judge('RUN')}>
              {busy ? 'Running…' : '▶ Run'}
            </button>
            <button className="btn sm primary" disabled={busy || disabled} onClick={() => judge('SUBMIT')}>
              {busy ? 'Submitting…' : 'Submit'}
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
