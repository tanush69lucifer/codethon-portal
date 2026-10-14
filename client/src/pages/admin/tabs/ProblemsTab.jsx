import { useState } from 'react';
import { api } from '../../../lib/api';
import { VERDICT_LABEL, verdictTone } from '../../../lib/format';
import { Empty, ErrorState, Loading, Modal, useAsync, useToast } from '../../../components/ui';

const STARTER = `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // write your code here
    }
}
`;

const blank = () => ({
  title: '',
  statement: '',
  inputFormat: '',
  outputFormat: '',
  constraints: '',
  points: 100,
  timeLimitMs: 2000,
  memoryMb: 256,
  checker: 'tokens',
  starterCode: STARTER,
  samples: [{ input: '', output: '', explanation: '' }],
  tests: [{ input: '', output: '', weight: 1 }],
});

function IoList({ label, items, onChange, withWeight, withExplanation }) {
  const update = (i, k, v) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const loadFile = async (i, k, file) => update(i, k, await file.text());
  return (
    <div className="stack">
      <div className="row between">
        <h3 style={{ margin: 0 }}>{label} ({items.length})</h3>
        <button type="button" className="btn sm" onClick={() => onChange([...items, withWeight ? { input: '', output: '', weight: 1 } : { input: '', output: '', explanation: '' }])}>
          + Add
        </button>
      </div>
      {items.map((t, i) => (
        <div key={i} className="card tight stack" style={{ gap: 6 }}>
          <div className="row between">
            <b className="small">#{i + 1}</b>
            <div className="row">
              {withWeight && (
                <label className="row small">weight <input className="input" style={{ width: 70 }} type="number" min={0} value={t.weight ?? 1} onChange={(e) => update(i, 'weight', Number(e.target.value))} /></label>
              )}
              <button type="button" className="btn sm ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
            </div>
          </div>
          <div className="grid2">
            <label className="field">Input <input type="file" style={{ fontSize: 11 }} onChange={(e) => e.target.files[0] && loadFile(i, 'input', e.target.files[0])} />
              <textarea className="textarea" rows={3} value={t.input.length > 20000 ? `(${t.input.length} chars loaded from file)` : t.input} readOnly={t.input.length > 20000} onChange={(e) => update(i, 'input', e.target.value)} />
            </label>
            <label className="field">Expected output <input type="file" style={{ fontSize: 11 }} onChange={(e) => e.target.files[0] && loadFile(i, 'output', e.target.files[0])} />
              <textarea className="textarea" rows={3} value={t.output.length > 20000 ? `(${t.output.length} chars loaded from file)` : t.output} readOnly={t.output.length > 20000} onChange={(e) => update(i, 'output', e.target.value)} />
            </label>
          </div>
          {withExplanation && (
            <input className="input" placeholder="Explanation (optional)" value={t.explanation || ''} onChange={(e) => update(i, 'explanation', e.target.value)} />
          )}
        </div>
      ))}
    </div>
  );
}

function ProblemEditor({ contestId, initial, onClose, onSaved }) {
  const toast = useToast();
  const [p, setP] = useState(() => (initial ? { ...blank(), ...initial } : blank()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refCode, setRefCode] = useState('');
  const [validation, setValidation] = useState(null);
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        title: p.title,
        statement: p.statement,
        inputFormat: p.inputFormat,
        outputFormat: p.outputFormat,
        constraints: p.constraints,
        points: Number(p.points),
        timeLimitMs: Number(p.timeLimitMs),
        memoryMb: Number(p.memoryMb),
        checker: p.checker,
        starterCode: p.starterCode,
        samples: p.samples.map(({ input, output, explanation }) => ({ input, output, explanation: explanation || '' })),
        tests: p.tests.map(({ input, output, weight }) => ({ input, output, weight: Number(weight ?? 1) })),
      };
      const saved = initial?._id
        ? await api('PATCH', `/admin/problems/${initial._id}`, body)
        : await api('POST', `/admin/contests/${contestId}/problems`, body);
      toast('Problem saved', 'ok');
      setP((x) => ({ ...x, _id: saved._id }));
      onSaved();
      return saved;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const validate = async () => {
    const saved = p._id ? { _id: p._id } : await save();
    if (!saved) return;
    setValidation({ pending: true });
    try {
      const { submissionId } = await api('POST', `/admin/problems/${saved._id}/validate`, { code: refCode });
      for (let i = 0; i < 120; i += 1) {
        const s = await api('GET', `/admin/submissions/${submissionId}`);
        if (s.status === 'DONE' || s.status === 'ERROR') return setValidation(s);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setValidation({ error: 'Timed out waiting for the judge' });
    } catch (err) {
      setValidation({ error: err.message });
    }
  };

  return (
    <Modal title={initial ? `Edit: ${initial.title}` : 'New coding problem'} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save problem'}</button></>}>
      <div className="stack">
        <div className="grid4">
          <label className="field" style={{ gridColumn: 'span 2' }}>Title<input className="input" value={p.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="field">Points<input className="input" type="number" value={p.points} onChange={(e) => set('points', e.target.value)} /></label>
          <label className="field">Checker
            <select className="select" value={p.checker} onChange={(e) => set('checker', e.target.value)}>
              <option value="tokens">Tokens (ignore spacing)</option>
              <option value="exact">Exact lines</option>
              <option value="float">Float ±1e-6</option>
            </select>
          </label>
          <label className="field">Time limit per test (ms)<input className="input" type="number" min={200} max={15000} value={p.timeLimitMs} onChange={(e) => set('timeLimitMs', e.target.value)} /></label>
          <label className="field">Memory (MB)<input className="input" type="number" min={32} max={1024} value={p.memoryMb} onChange={(e) => set('memoryMb', e.target.value)} /></label>
        </div>
        <label className="field">Statement (Markdown)<textarea className="textarea" rows={6} style={{ fontFamily: 'var(--sans)' }} value={p.statement} onChange={(e) => set('statement', e.target.value)} /></label>
        <div className="grid2">
          <label className="field">Input format<textarea className="textarea" rows={3} style={{ fontFamily: 'var(--sans)' }} value={p.inputFormat} onChange={(e) => set('inputFormat', e.target.value)} /></label>
          <label className="field">Output format<textarea className="textarea" rows={3} style={{ fontFamily: 'var(--sans)' }} value={p.outputFormat} onChange={(e) => set('outputFormat', e.target.value)} /></label>
        </div>
        <label className="field">Constraints<textarea className="textarea" rows={2} value={p.constraints} onChange={(e) => set('constraints', e.target.value)} /></label>
        <label className="field">Starter code<textarea className="textarea" rows={8} value={p.starterCode} onChange={(e) => set('starterCode', e.target.value)} /></label>
        <IoList label="Samples (visible, used by Run)" items={p.samples} onChange={(v) => set('samples', v)} withExplanation />
        <IoList label="Hidden tests (used by Submit, scored by weight)" items={p.tests} onChange={(v) => set('tests', v)} withWeight />

        <div className="card stack" style={{ background: 'var(--surface-2)' }}>
          <h3 style={{ margin: 0 }}>Check with a reference solution</h3>
          <div className="muted small">Paste your correct Java solution. It is judged against the hidden tests (save first). It should score full points.</div>
          <textarea className="textarea" rows={8} value={refCode} onChange={(e) => setRefCode(e.target.value)} placeholder="public class Main { ... }" />
          <div className="row">
            <button className="btn" disabled={!refCode.trim() || validation?.pending} onClick={validate}>Run reference solution</button>
            {validation?.pending && <span className="muted">Judging…</span>}
            {validation?.error && <span className="error-box">{validation.error}</span>}
            {validation?.verdict && (
              <>
                <span className={`badge ${verdictTone(validation.verdict)}`}>{VERDICT_LABEL[validation.verdict] || validation.verdict}</span>
                <span className="small">{validation.passed}/{validation.total} tests · {validation.score}/{validation.maxScore} pts · slowest {Math.max(0, ...(validation.tests || []).map((t) => t.timeMs))} ms</span>
              </>
            )}
          </div>
          {validation?.compileOutput && <pre>{validation.compileOutput}</pre>}
        </div>
        {error && <div className="error-box">{error}</div>}
      </div>
    </Modal>
  );
}

export default function ProblemsTab({ contestId }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api('GET', `/admin/contests/${contestId}/problems`), [contestId]);
  const [editing, setEditing] = useState(null);

  const del = async (p) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    await api('DELETE', `/admin/problems/${p._id}`).catch((e) => toast(e.message, 'bad'));
    reload(true);
  };

  return (
    <div className="stack">
      <div className="row between">
        <div className="muted small">Java only. Candidates read stdin and print to stdout. Each problem&apos;s score = points × (passed test weight / total weight).</div>
        <button className="btn primary" onClick={() => setEditing('new')}>Add problem</button>
      </div>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !data.items.length && <Empty>No coding problems yet.</Empty>}
      {data?.items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Title</th><th>Points</th><th>Limits</th><th>Samples</th><th>Hidden tests</th><th /></tr></thead>
            <tbody>
              {data.items.map((p, i) => (
                <tr key={p._id}>
                  <td>{String.fromCharCode(65 + i)}</td>
                  <td><b>{p.title}</b></td>
                  <td className="num">{p.points}</td>
                  <td className="small">{p.timeLimitMs} ms · {p.memoryMb} MB · {p.checker}</td>
                  <td className="num">{p.samples.length}</td>
                  <td className="num">{p.tests.length}{!p.tests.length && <span className="badge warn" style={{ marginLeft: 6 }}>add tests</span>}</td>
                  <td>
                    <div className="row">
                      <button className="btn sm" onClick={() => setEditing(p)}>Edit</button>
                      <button className="btn sm danger" onClick={() => del(p)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ProblemEditor contestId={contestId} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => reload(true)} />
      )}
    </div>
  );
}
