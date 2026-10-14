import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtAgo, fmtDuration } from '../../../lib/format';
import { ErrorState, Loading, StatusBadge, useAsync, useToast } from '../../../components/ui';
import AttemptDetail from './AttemptDetail';

const FILTERS = [
  ['all', 'All'],
  ['live', 'Online'],
  ['flagged', 'With violations'],
  ['LOCKED', 'Locked'],
  ['SUBMITTED', 'Submitted'],
  ['NOT_STARTED', 'Not started'],
];

export default function MonitorTab({ contest }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api('GET', `/admin/contests/${contest._id}/monitor`), [contest._id]);
  const feed = useAsync(() => api('GET', `/admin/contests/${contest._id}/events`), [contest._id]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(() => {
      reload(true);
      feed.reload(true);
    }, 5000);
    return () => clearInterval(t);
  }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, msg) => {
    try {
      await fn();
      toast(msg, 'ok');
      reload(true);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const s = data.summary;
  const q = search.toLowerCase();
  const rows = data.rows
    .filter((r) =>
      filter === 'all' ? true : filter === 'live' ? r.online : filter === 'flagged' ? r.violations > 0 : r.status === filter
    )
    .filter((r) => !q || r.user.name.toLowerCase().includes(q) || r.user.email.includes(q))
    .sort((a, b) => b.violations - a.violations || a.user.name.localeCompare(b.user.name));

  return (
    <div className="stack">
      <div className="grid4">
        <div className="stat"><div className="label">Online now</div><div className="value">{s.online}</div></div>
        <div className="stat"><div className="label">In progress</div><div className="value">{s.IN_PROGRESS || 0}</div></div>
        <div className="stat"><div className="label">Submitted</div><div className="value">{s.SUBMITTED || 0}</div></div>
        <div className="stat"><div className="label">Locked</div><div className="value" style={{ color: s.LOCKED ? 'var(--bad)' : undefined }}>{s.LOCKED || 0}</div></div>
        <div className="stat"><div className="label">With violations</div><div className="value">{s.withViolations}</div></div>
        <div className="stat"><div className="label">Judge queue</div><div className="value">{data.queue.queued} <span className="small muted">+{data.queue.running} running</span></div></div>
      </div>

      <div className="row between">
        <div className="row">
          {FILTERS.map(([k, label]) => (
            <button key={k} className={`btn sm ${filter === k ? 'primary' : ''}`} onClick={() => setFilter(k)}>{label}</button>
          ))}
          <input className="input" style={{ width: 220, height: 28 }} placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="check small"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Auto-refresh 5s</label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 12, alignItems: 'start' }}>
        <div className="table-wrap" style={{ maxHeight: '68vh' }}>
          <table>
            <thead>
              <tr>
                <th>Candidate</th><th>Status</th><th>Seen</th><th>Time left</th><th>⚠</th><th>MCQ</th>
                {data.problems.map((p, i) => <th key={p._id} title={p.title}>{String.fromCharCode(65 + i)}</th>)}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.attemptId} className="clickable" onClick={() => setDetail(r.attemptId)}>
                  <td><b>{r.user.name}</b><div className="muted small">{r.user.email}</div></td>
                  <td>
                    <StatusBadge status={r.status} />
                    {r.status === 'IN_PROGRESS' && (
                      <div className="small" style={{ marginTop: 2 }}>
                        {r.online ? <span style={{ color: 'var(--ok)' }}>● online{r.focused === false ? ' · unfocused' : ''}</span> : <span className="muted">○ offline</span>}
                        {!r.seb && <span className="muted"> · no SEB</span>}
                      </div>
                    )}
                  </td>
                  <td className="small">{fmtAgo(r.lastSeenAt, data.serverNow)}</td>
                  <td className="num small">{r.status === 'IN_PROGRESS' && r.deadlineAt ? fmtDuration(new Date(r.deadlineAt).getTime() - data.serverNow) : '—'}</td>
                  <td>{r.violations ? <span className={`badge ${r.violations >= 3 ? 'bad' : 'warn'}`}>{r.violations}</span> : <span className="muted">0</span>}</td>
                  <td className="num small">{r.mcqAnswered}/{data.totalMcq}<div className="muted">{r.mcqScore}</div></td>
                  {r.coding.map((v, i) => <td key={i} className="num">{v ?? <span className="muted">—</span>}</td>)}
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row">
                      {r.status === 'LOCKED' && (
                        <button className="btn sm ok" onClick={() => act(() => api('POST', `/admin/attempts/${r.attemptId}/unlock`, { resetViolations: window.confirm('Also reset the violation counter to 0?') }), 'Unlocked')}>Unlock</button>
                      )}
                      {['IN_PROGRESS', 'SUBMITTED', 'LOCKED'].includes(r.status) && (
                        <button className="btn sm" onClick={() => {
                          const m = Number(window.prompt('Extra minutes for this candidate?', '10'));
                          if (m > 0) act(() => api('POST', `/admin/attempts/${r.attemptId}/extra-time`, { minutes: m }), `+${m} min`);
                        }}>+Time</button>
                      )}
                      {['IN_PROGRESS', 'LOCKED'].includes(r.status) && (
                        <button className="btn sm danger" onClick={() => window.confirm(`Force-submit ${r.user.name}?`) && act(() => api('POST', `/admin/attempts/${r.attemptId}/force-submit`), 'Submitted')}>End</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8 + data.problems.length} className="muted">No candidates match.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card tight stack" style={{ maxHeight: '68vh', overflow: 'auto', gap: 6 }}>
          <b>Latest alerts</b>
          {!feed.data?.items.length && <div className="muted small">No medium/high signals yet.</div>}
          {feed.data?.items.map((e) => (
            <button key={e._id} className="nav-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }} onClick={() => setDetail(e.attemptId)}>
              <span className="row small"><span className={`badge ${e.severity === 'HIGH' ? 'bad' : 'warn'}`}>{e.code}</span></span>
              <span className="small">{e.name}</span>
              <span className="muted small">{new Date(e.at).toLocaleTimeString()}</span>
            </button>
          ))}
        </div>
      </div>
      {detail && <AttemptDetail attemptId={detail} problems={data.problems} onClose={() => setDetail(null)} />}
    </div>
  );
}
