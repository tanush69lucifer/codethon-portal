import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import TopBar from '../../components/TopBar';
import { Empty, ErrorState, Loading, Modal, useAsync, useToast } from '../../components/ui';
import ContestForm, { defaultContest } from './ContestForm';

export default function AdminHome() {
  const { data, error, loading, reload } = useAsync(() => api('GET', '/admin/contests'));
  const sys = useAsync(() => api('GET', '/admin/system'));
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const importJson = async (file, replace) => {
    try {
      const json = JSON.parse(await file.text());
      const r = await api('POST', `/admin/contests/import${replace ? '?replace=1' : ''}`, json);
      toast(`Imported: ${r.mcqs} MCQs, ${r.problems} problems`, 'ok');
      navigate(`/admin/contest/${r.contestId}`);
    } catch (err) {
      if (err.code === 'CONFLICT' && !replace && window.confirm(`${err.message}\n\nReplace the existing contest?`)) return importJson(file, true);
      toast(err.message || 'Invalid JSON file', 'bad');
    }
  };

  return (
    <>
      <TopBar />
      <main className="page stack">
        <div className="row between">
          <h1 style={{ margin: 0 }}>Contests</h1>
          <div className="row">
            <label className="btn">
              Import contest JSON
              <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files[0] && importJson(e.target.files[0], false)} />
            </label>
            <button className="btn primary" onClick={() => setCreating(true)}>New contest</button>
          </div>
        </div>

        {sys.data && (
          <div className="grid4">
            <div className="stat"><div className="label">Judge queue</div><div className="value">{sys.data.queue.queued}</div></div>
            <div className="stat"><div className="label">Running now</div><div className="value">{sys.data.queue.running}</div></div>
            <div className="stat"><div className="label">Active judge workers (5 min)</div><div className="value">{sys.data.last5min.workers.length}</div></div>
            <div className="stat"><div className="label">Avg judge time</div><div className="value">{sys.data.last5min.avgRunMs ?? '—'}{sys.data.last5min.avgRunMs ? ' ms' : ''}</div></div>
          </div>
        )}

        {loading && <Loading />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && !data.items.length && <Empty>No contests yet. Create one, or import <code>samples/contest-sample.json</code>.</Empty>}
        {data?.items.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Contest</th><th>Category</th><th>Window</th><th>Paper</th><th>Participants</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.items.map((c) => {
                  const total = (c.counts.NOT_STARTED || 0) + (c.counts.IN_PROGRESS || 0) + (c.counts.SUBMITTED || 0) + (c.counts.LOCKED || 0);
                  return (
                    <tr key={c._id} className="clickable" onClick={() => navigate(`/admin/contest/${c._id}`)}>
                      <td><Link to={`/admin/contest/${c._id}`}><b>{c.title}</b></Link><div className="muted small mono">{c.slug}</div></td>
                      <td>{c.category || '—'}</td>
                      <td className="small">{fmtDate(c.startAt)}<br />{fmtDate(c.endAt)} · {c.durationMin}m</td>
                      <td className="small">{c.counts.mcq} MCQ · {c.counts.problems} coding</td>
                      <td className="small">
                        {total} total{c.counts.IN_PROGRESS ? ` · ${c.counts.IN_PROGRESS} live` : ''}
                        {c.counts.SUBMITTED ? ` · ${c.counts.SUBMITTED} done` : ''}
                        {c.counts.LOCKED ? ` · ${c.counts.LOCKED} locked` : ''}
                      </td>
                      <td>{c.published ? <span className="badge ok">Published</span> : <span className="badge">Draft</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {creating && (
        <Modal title="New contest" onClose={() => setCreating(false)} wide>
          <ContestForm
            initial={defaultContest()}
            submitLabel="Create contest"
            onSubmit={async (body) => {
              const c = await api('POST', '/admin/contests', body);
              toast('Contest created', 'ok');
              navigate(`/admin/contest/${c._id}`);
            }}
          />
        </Modal>
      )}
    </>
  );
}
