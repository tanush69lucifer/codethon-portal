import { useState } from 'react';
import { api } from '../../../lib/api';
import { md } from '../../../lib/format';
import { Empty, ErrorState, Loading, Modal, useAsync, useToast } from '../../../components/ui';

const KEYS = 'ABCDEF';

function McqEditor({ initial, onSave, onClose }) {
  const [text, setText] = useState(initial?.text || '');
  const [options, setOptions] = useState(initial?.options?.length ? initial.options : ['', '', '', '']);
  const [correct, setCorrect] = useState(initial?.correctIndex ?? 0);
  const [marks, setMarks] = useState(initial?.marks ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const opts = options.map((o) => o.trim());
      if (opts.some((o) => !o)) throw new Error('Fill every option or remove empty ones');
      await onSave({ text, options: opts, correctIndex: correct, marks: marks === '' ? null : Number(marks) });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial ? 'Edit MCQ' : 'Add MCQ'}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}
    >
      <div className="stack">
        <label className="field">Question (Markdown, use ``` for code)
          <textarea className="textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {options.map((o, i) => (
          <div key={i} className="row">
            <label className="check" title="Correct answer">
              <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} /> {KEYS[i]}
            </label>
            <input className="input grow" value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
            {options.length > 2 && (
              <button className="btn sm ghost" onClick={() => { setOptions(options.filter((_, j) => j !== i)); if (correct >= i && correct > 0) setCorrect(correct - 1); }}>✕</button>
            )}
          </div>
        ))}
        <div className="row">
          {options.length < 6 && <button className="btn sm" onClick={() => setOptions([...options, ''])}>+ Option</button>}
          <label className="field" style={{ width: 160 }}>Marks (blank = contest default)
            <input className="input" type="number" step="0.25" min={0} value={marks} onChange={(e) => setMarks(e.target.value)} />
          </label>
        </div>
        <div className="muted small">Select the radio button next to the correct option.</div>
        {error && <div className="error-box">{error}</div>}
      </div>
    </Modal>
  );
}

export default function McqTab({ contestId }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api('GET', `/admin/contests/${contestId}/mcqs`), [contestId]);
  const [editing, setEditing] = useState(null); // null | 'new' | mcq

  const uploadCsv = async (file, replace) => {
    const fd = new FormData();
    fd.append('file', file);
    if (replace) fd.append('replace', '1');
    try {
      const r = await api('POST', `/admin/contests/${contestId}/mcqs/bulk-csv`, fd);
      toast(`Added ${r.added} MCQs`, 'ok');
      reload(true);
    } catch (err) {
      toast(`${err.message}${err.details?.errors ? `: ${err.details.errors.slice(0, 3).join(' | ')}` : ''}`, 'bad');
    }
  };

  const del = async (q) => {
    if (!window.confirm('Delete this MCQ?')) return;
    await api('DELETE', `/admin/mcqs/${q._id}`).catch((e) => toast(e.message, 'bad'));
    reload(true);
  };

  return (
    <div className="stack">
      <div className="row between">
        <div className="muted small">
          CSV columns: <code>question,a,b,c,d,answer,marks</code> (answer = A–F; up to 6 options with e,f). See samples/mcq-bulk-sample.csv.
        </div>
        <div className="row">
          <label className="btn">Upload CSV (append)<input type="file" accept=".csv" hidden onChange={(e) => e.target.files[0] && uploadCsv(e.target.files[0], false)} /></label>
          <label className="btn">Replace all from CSV<input type="file" accept=".csv" hidden onChange={(e) => e.target.files[0] && window.confirm('Delete all current MCQs and replace them?') && uploadCsv(e.target.files[0], true)} /></label>
          <button className="btn primary" onClick={() => setEditing('new')}>Add MCQ</button>
        </div>
      </div>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !data.items.length && <Empty>No MCQs yet.</Empty>}
      {data?.items.map((q, i) => (
        <div key={q._id} className="card tight stack" style={{ gap: 6 }}>
          <div className="row between">
            <b>Q{i + 1}{q.marks != null ? ` · ${q.marks} marks` : ''}</b>
            <div className="row">
              <button className="btn sm" onClick={() => setEditing(q)}>Edit</button>
              <button className="btn sm danger" onClick={() => del(q)}>Delete</button>
            </div>
          </div>
          <div className="md" dangerouslySetInnerHTML={md(q.text)} />
          <div className="row small">
            {q.options.map((o, j) => (
              <span key={j} className={`badge ${j === q.correctIndex ? 'ok' : ''}`}>{KEYS[j]}. {o.length > 60 ? `${o.slice(0, 60)}…` : o}</span>
            ))}
          </div>
        </div>
      ))}
      {editing && (
        <McqEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            if (editing === 'new') await api('POST', `/admin/contests/${contestId}/mcqs`, body);
            else await api('PATCH', `/admin/mcqs/${editing._id}`, body);
            toast('Saved', 'ok');
            reload(true);
          }}
        />
      )}
    </div>
  );
}
