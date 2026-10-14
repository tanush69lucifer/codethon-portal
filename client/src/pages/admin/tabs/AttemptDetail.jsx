import { useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, verdictTone } from '../../../lib/format';
import { ErrorState, Loading, Modal, StatusBadge, useAsync } from '../../../components/ui';

const SEV = { HIGH: 'bad', MED: 'warn', LOW: '' };

export default function AttemptDetail({ attemptId, problems = [], onClose }) {
  const { data, error, loading, reload } = useAsync(() => api('GET', `/admin/attempts/${attemptId}`), [attemptId]);
  const [code, setCode] = useState(null);
  const title = (pid) => problems.find((p) => String(p._id) === String(pid))?.title || 'Problem';

  const openCode = async (sid) => setCode(await api('GET', `/admin/submissions/${sid}`));

  return (
    <Modal title={data?.user ? `${data.user.name} · ${data.user.email}` : 'Candidate'} onClose={onClose} wide>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="stack">
          <div className="row">
            <StatusBadge status={data.attempt.status} />
            <span className="badge">Violations: {data.attempt.violations}</span>
            <span className="badge">{data.attempt.browser?.seb ? 'SEB' : 'Normal browser'}</span>
            <span className="small muted">Started {fmtDate(data.attempt.startedAt)} · deadline {fmtDate(data.attempt.deadlineAt)} · IP {data.attempt.browser?.ip || '—'}</span>
          </div>
          {data.attempt.lockedReason && <div className="error-box">{data.attempt.lockedReason}</div>}
          <div className="small muted mono" style={{ wordBreak: 'break-all' }}>{data.attempt.browser?.userAgent}</div>

          <h3>Submissions</h3>
          {!data.submissions.length ? <div className="muted">None</div> : (
            <div className="table-wrap" style={{ maxHeight: 240 }}>
              <table>
                <thead><tr><th>Time</th><th>Problem</th><th>Verdict</th><th>Score</th><th /></tr></thead>
                <tbody>
                  {data.submissions.map((s) => (
                    <tr key={s._id}>
                      <td>{fmtDate(s.createdAt)}</td>
                      <td>{title(s.problemId)}</td>
                      <td><span className={`badge ${verdictTone(s.verdict)}`}>{s.verdict || s.status}</span></td>
                      <td className="num">{s.score}/{s.maxScore}</td>
                      <td><button className="btn sm" onClick={() => openCode(s._id)}>View code</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {code && (
            <div className="stack">
              <div className="row between"><b>{title(code.problemId)} · {code.verdict}</b><button className="btn sm" onClick={() => setCode(null)}>Hide</button></div>
              <pre style={{ maxHeight: 360 }}>{code.code}</pre>
            </div>
          )}

          <h3>Integrity timeline ({data.events.length})</h3>
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table>
              <thead><tr><th>Time</th><th>Signal</th><th>Severity</th><th>Details</th></tr></thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e._id}>
                    <td>{new Date(e.at).toLocaleTimeString()}</td>
                    <td>{e.code}{e.counted && <span className="badge bad" style={{ marginLeft: 6 }}>counted</span>}</td>
                    <td><span className={`badge ${SEV[e.severity]}`}>{e.severity}</span></td>
                    <td className="small mono wrap">{Object.entries(e.meta || {}).map(([k, v]) => `${k}=${v}`).join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted small">Signals are clues for review, not proof. Decide after looking at the timeline and the code.</div>
        </div>
      )}
    </Modal>
  );
}
