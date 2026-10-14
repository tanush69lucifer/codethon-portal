import { useState } from 'react';
import { toLocalInput } from '../../lib/format';

export function defaultContest() {
  const start = new Date(Date.now() + 24 * 3600_000);
  start.setMinutes(0, 0, 0);
  return {
    title: '',
    slug: '',
    category: '',
    instructions: '',
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 3 * 3600_000).toISOString(),
    durationMin: 120,
    published: false,
    mcq: { marks: 1, negative: 0, shuffleQuestions: true, shuffleOptions: true },
    coding: { maxRunsPerMinute: 6, submitCooldownSec: 20, maxSubmissionsPerProblem: 30, wrongSubmissionPenaltyMin: 0 },
    proctoring: { browserPolicy: 'SEB_REQUIRED', sebConfigKeys: [], requireFullscreen: true, blockPaste: true, lockAfterViolations: 6 },
  };
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export default function ContestForm({ initial, onSubmit, submitLabel = 'Save' }) {
  const [f, setF] = useState(() => ({
    ...initial,
    startLocal: toLocalInput(initial.startAt),
    endLocal: toLocalInput(initial.endAt),
    keysText: (initial.proctoring?.sebConfigKeys || []).join('\n'),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setIn = (group, k, v) => setF((x) => ({ ...x, [group]: { ...x[group], [k]: v } }));
  const num = (v) => (v === '' ? '' : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: f.title,
        slug: f.slug,
        category: f.category,
        instructions: f.instructions,
        startAt: new Date(f.startLocal).toISOString(),
        endAt: new Date(f.endLocal).toISOString(),
        durationMin: Number(f.durationMin),
        published: f.published,
        mcq: { ...f.mcq, marks: Number(f.mcq.marks), negative: Number(f.mcq.negative) },
        coding: {
          maxRunsPerMinute: Number(f.coding.maxRunsPerMinute),
          submitCooldownSec: Number(f.coding.submitCooldownSec),
          maxSubmissionsPerProblem: Number(f.coding.maxSubmissionsPerProblem),
          wrongSubmissionPenaltyMin: Number(f.coding.wrongSubmissionPenaltyMin),
        },
        proctoring: {
          ...f.proctoring,
          lockAfterViolations: Number(f.proctoring.lockAfterViolations),
          sebConfigKeys: f.keysText.split(/\s+/).map((s) => s.trim()).filter(Boolean),
        },
      };
      await onSubmit(body);
    } catch (err) {
      const details = err.details?.fieldErrors ? Object.entries(err.details.fieldErrors).map(([k, v]) => `${k}: ${v}`).join('; ') : '';
      setError(`${err.message}${details ? ` — ${details}` : ''}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div className="grid2">
        <label className="field">Title
          <input className="input" required value={f.title} onChange={(e) => { set('title', e.target.value); if (!initial._id) set('slug', slugify(e.target.value)); }} />
        </label>
        <label className="field">Slug (URL id)
          <input className="input mono" required pattern="[a-z0-9-]{2,60}" value={f.slug} onChange={(e) => set('slug', e.target.value)} />
        </label>
        <label className="field">Category
          <input className="input" placeholder="Junior / Senior" value={f.category} onChange={(e) => set('category', e.target.value)} />
        </label>
        <label className="field">Duration (minutes per candidate)
          <input className="input" type="number" min={5} max={600} required value={f.durationMin} onChange={(e) => set('durationMin', num(e.target.value))} />
        </label>
        <label className="field">Window opens
          <input className="input" type="datetime-local" required value={f.startLocal} onChange={(e) => set('startLocal', e.target.value)} />
        </label>
        <label className="field">Window closes (late starters get less time)
          <input className="input" type="datetime-local" required value={f.endLocal} onChange={(e) => set('endLocal', e.target.value)} />
        </label>
      </div>
      <label className="field">Instructions shown before start (Markdown)
        <textarea className="textarea" rows={5} style={{ fontFamily: 'var(--sans)' }} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} />
      </label>

      <h3>MCQ marking</h3>
      <div className="grid4">
        <label className="field">Marks per correct<input className="input" type="number" step="0.25" min={0} value={f.mcq.marks} onChange={(e) => setIn('mcq', 'marks', num(e.target.value))} /></label>
        <label className="field">Negative per wrong<input className="input" type="number" step="0.25" min={0} value={f.mcq.negative} onChange={(e) => setIn('mcq', 'negative', num(e.target.value))} /></label>
        <label className="check"><input type="checkbox" checked={f.mcq.shuffleQuestions} onChange={(e) => setIn('mcq', 'shuffleQuestions', e.target.checked)} />Shuffle questions</label>
        <label className="check"><input type="checkbox" checked={f.mcq.shuffleOptions} onChange={(e) => setIn('mcq', 'shuffleOptions', e.target.checked)} />Shuffle options</label>
      </div>

      <h3>Coding limits</h3>
      <div className="grid4">
        <label className="field">Runs per minute<input className="input" type="number" min={1} value={f.coding.maxRunsPerMinute} onChange={(e) => setIn('coding', 'maxRunsPerMinute', num(e.target.value))} /></label>
        <label className="field">Submit cooldown (s)<input className="input" type="number" min={0} value={f.coding.submitCooldownSec} onChange={(e) => setIn('coding', 'submitCooldownSec', num(e.target.value))} /></label>
        <label className="field">Max submits / problem<input className="input" type="number" min={1} value={f.coding.maxSubmissionsPerProblem} onChange={(e) => setIn('coding', 'maxSubmissionsPerProblem', num(e.target.value))} /></label>
        <label className="field">Tie-break penalty per wrong submit (min)<input className="input" type="number" min={0} step="1" value={f.coding.wrongSubmissionPenaltyMin} onChange={(e) => setIn('coding', 'wrongSubmissionPenaltyMin', num(e.target.value))} /></label>
      </div>

      <h3>Proctoring</h3>
      <div className="grid2">
        <label className="field">Browser policy
          <select className="select" value={f.proctoring.browserPolicy} onChange={(e) => setIn('proctoring', 'browserPolicy', e.target.value)}>
            <option value="SEB_REQUIRED">Safe Exam Browser required (recommended)</option>
            <option value="SEB_PREFERRED">Any browser, flag non-SEB</option>
            <option value="ANY">Any browser (practice / mock)</option>
          </select>
        </label>
        <label className="field">Auto-lock after N serious violations (0 = never)
          <input className="input" type="number" min={0} value={f.proctoring.lockAfterViolations} onChange={(e) => setIn('proctoring', 'lockAfterViolations', num(e.target.value))} />
        </label>
        <label className="check"><input type="checkbox" checked={f.proctoring.requireFullscreen} onChange={(e) => setIn('proctoring', 'requireFullscreen', e.target.checked)} />Force fullscreen (non-SEB browsers)</label>
        <label className="check"><input type="checkbox" checked={f.proctoring.blockPaste} onChange={(e) => setIn('proctoring', 'blockPaste', e.target.checked)} />Block paste from outside the editor</label>
      </div>
      <label className="field">SEB Config Key(s), one per line (64 hex chars, from the SEB Config Tool)
        <textarea className="textarea" rows={2} value={f.keysText} onChange={(e) => set('keysText', e.target.value)} placeholder="Leave empty during setup; without it only the SEB user agent is checked" />
      </label>
      <label className="check"><input type="checkbox" checked={f.published} onChange={(e) => set('published', e.target.checked)} /><b>Published</b> (visible to registered candidates)</label>

      {error && <div className="error-box">{error}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
