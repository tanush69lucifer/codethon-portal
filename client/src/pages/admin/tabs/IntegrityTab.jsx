import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Empty, Modal, useToast } from '../../../components/ui';

function Compare({ pair, onClose }) {
  const [codes, setCodes] = useState(null);
  useEffect(() => {
    Promise.all([api('GET', `/admin/submissions/${pair.a.submissionId}`), api('GET', `/admin/submissions/${pair.b.submissionId}`)])
      .then(setCodes)
      .catch(() => setCodes([{ code: '(failed to load)' }, { code: '(failed to load)' }]));
  }, [pair]);
  return (
    <Modal title={`${pair.problem} · ${pair.similarity}% similar`} onClose={onClose} wide>
      {!codes ? <div className="muted">Loading…</div> : (
        <div className="grid2">
          {[pair.a, pair.b].map((side, i) => (
            <div key={i}>
              <b>{side.user?.name}</b> <span className="muted small">{side.user?.email}</span>
              <pre style={{ maxHeight: '60vh' }}>{codes[i].code}</pre>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function IntegrityTab({ contest }) {
  const toast = useToast();
  const [threshold, setThreshold] = useState(80);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState(null);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await api('POST', `/admin/contests/${contest._id}/plagiarism`, { threshold: threshold / 100 }));
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card stack">
        <h3>Code similarity check</h3>
        <div className="muted small">
          Compares every candidate&apos;s best submission per problem. Renamed variables, changed spacing/comments and reordered literals are still caught.
          Short or very standard solutions can match by accident, so always read both programs before deciding.
        </div>
        <div className="row">
          <label className="row small">Threshold
            <input className="input" style={{ width: 80 }} type="number" min={30} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />%
          </label>
          <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Checking…' : 'Run check'}</button>
          {result && <span className="muted small">{result.checked} submissions checked · {result.pairs.length} pairs found</span>}
        </div>
      </div>
      {result && !result.pairs.length && <Empty>No pairs above {threshold}%.</Empty>}
      {result?.pairs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Similarity</th><th>Problem</th><th>Candidate A</th><th>Candidate B</th><th /></tr></thead>
            <tbody>
              {result.pairs.map((p, i) => (
                <tr key={i}>
                  <td><span className={`badge ${p.similarity >= 90 ? 'bad' : 'warn'}`}>{p.similarity}%</span></td>
                  <td>{p.problem}</td>
                  <td>{p.a.user?.name}<div className="muted small">{p.a.user?.email}</div></td>
                  <td>{p.b.user?.name}<div className="muted small">{p.b.user?.email}</div></td>
                  <td><button className="btn sm" onClick={() => setPair(p)}>Compare</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pair && <Compare pair={pair} onClose={() => setPair(null)} />}
    </div>
  );
}
