import { useState } from 'react';
import { api, download } from '../../../lib/api';
import { ErrorState, Loading, StatusBadge, useAsync, Empty } from '../../../components/ui';
import AttemptDetail from './AttemptDetail';

export default function LeaderboardTab({ contest }) {
  const { data, error, loading, reload } = useAsync(() => api('GET', `/admin/contests/${contest._id}/leaderboard`), [contest._id]);
  const [detail, setDetail] = useState(null);
  const [onlySubmitted, setOnlySubmitted] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const rows = data.rows.filter((r) => !onlySubmitted || r.status === 'SUBMITTED');
  const maxCoding = data.problems.reduce((s, p) => s + p.points, 0);

  return (
    <div className="stack">
      <div className="row between">
        <div className="muted small">
          Ranked by total, then coding score, then time to last improvement (+ penalty). Max: MCQ {data.maxMcq} + coding {maxCoding}.
          Only organisers see this page.
        </div>
        <div className="row">
          <label className="check small"><input type="checkbox" checked={onlySubmitted} onChange={(e) => setOnlySubmitted(e.target.checked)} />Submitted only</label>
          <button className="btn" onClick={() => reload()}>Refresh</button>
          <button className="btn primary" onClick={() => download(`/admin/contests/${contest._id}/leaderboard.csv`, `${contest.slug}-results.csv`)}>Download CSV</button>
        </div>
      </div>
      {!rows.length ? <Empty>No attempts yet.</Empty> : (
        <div className="table-wrap" style={{ maxHeight: '70vh' }}>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Candidate</th><th>MCQ</th>
                {data.problems.map((p, i) => <th key={p._id} title={p.title}>{String.fromCharCode(65 + i)} <span className="muted">/{p.points}</span></th>)}
                <th>Coding</th><th>Total</th><th>Time</th><th>⚠</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.attemptId} className="clickable" onClick={() => setDetail(r.attemptId)}>
                  <td className="num"><b>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</b></td>
                  <td><b>{r.name}</b><div className="muted small">{r.email}</div></td>
                  <td className="num">{r.mcq}<div className="muted small">{r.mcqCorrect}✓ {r.mcqWrong}✗</div></td>
                  {r.perProblem.map((v, i) => <td key={i} className="num">{v ?? <span className="muted">—</span>}</td>)}
                  <td className="num">{r.coding}</td>
                  <td className="num"><b>{r.total}</b></td>
                  <td className="num small">{(r.timeMs / 60000).toFixed(1)}m{r.wrongSubmissions ? <div className="muted">{r.wrongSubmissions} wrong</div> : null}</td>
                  <td>{r.violations ? <span className={`badge ${r.violations >= 3 ? 'bad' : 'warn'}`}>{r.violations}</span> : '0'}</td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail && <AttemptDetail attemptId={detail} problems={data.problems} onClose={() => setDetail(null)} />}
    </div>
  );
}
