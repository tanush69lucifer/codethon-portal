import { useState } from 'react';
import { api, download } from '../../../lib/api';
import { Empty, ErrorState, Loading, Modal, StatusBadge, useAsync, useToast } from '../../../components/ui';

function ImportModal({ contestId, onClose, onDone }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [opts, setOpts] = useState({ emailColumn: '', nameColumn: '', phoneColumn: '', statusColumn: '', onlyPaid: true, filterColumn: '', filterValue: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setOpts((o) => ({ ...o, [k]: v }));

  const send = async (isPreview) => {
    if (!file) return;
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(opts).forEach(([k, v]) => v !== '' && fd.append(k, String(v)));
    if (isPreview) fd.append('preview', '1');
    try {
      const r = await api('POST', `/admin/contests/${contestId}/participants/import`, fd);
      if (isPreview) setPreview(r);
      else {
        toast(`Imported: ${r.enrolled} new, ${r.alreadyEnrolled} already registered`, 'ok');
        onDone();
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import paid participants (CSV)" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn" disabled={!file || busy} onClick={() => send(true)}>Preview</button><button className="btn primary" disabled={!preview || busy} onClick={() => send(false)}>Import {preview?.count ?? ''}</button></>}>
      <div className="stack">
        <div className="info-box small">
          Razorpay Dashboard → Transactions → Payments (or your Payment Page) → Export CSV. Only rows with status
          <b> captured/paid</b> are imported, duplicates by email are merged. Each new participant gets an access code; download them from
          &quot;Credentials CSV&quot; afterwards and mail-merge them out.
        </div>
        <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files[0]); setPreview(null); }} />
        <details>
          <summary className="small">Column mapping and category filter (optional, auto-detected)</summary>
          <div className="grid4" style={{ marginTop: 8 }}>
            {['emailColumn', 'nameColumn', 'phoneColumn', 'statusColumn'].map((k) => (
              <label key={k} className="field">{k.replace('Column', ' column')}<input className="input" value={opts[k]} onChange={(e) => { set(k, e.target.value); setPreview(null); }} placeholder="auto" /></label>
            ))}
            <label className="field">Only import if column…<input className="input" value={opts.filterColumn} onChange={(e) => { set('filterColumn', e.target.value); setPreview(null); }} placeholder="e.g. category" /></label>
            <label className="field">…equals<input className="input" value={opts.filterValue} onChange={(e) => { set('filterValue', e.target.value); setPreview(null); }} placeholder="e.g. Senior" /></label>
            <label className="check"><input type="checkbox" checked={opts.onlyPaid} onChange={(e) => { set('onlyPaid', e.target.checked); setPreview(null); }} />Only paid rows</label>
          </div>
          <div className="muted small">The filter column can also be a key inside Razorpay&apos;s <code>notes</code> JSON (e.g. <code>category</code>).</div>
        </details>
        {preview && (
          <div className="stack">
            <div className="row small">
              <span className="badge ok">{preview.count} will be imported</span>
              {preview.skipped.notPaid > 0 && <span className="badge">{preview.skipped.notPaid} not paid</span>}
              {preview.skipped.duplicate > 0 && <span className="badge">{preview.skipped.duplicate} duplicates</span>}
              {preview.skipped.badEmail > 0 && <span className="badge warn">{preview.skipped.badEmail} bad email</span>}
              {preview.skipped.filtered > 0 && <span className="badge">{preview.skipped.filtered} other category</span>}
            </div>
            <div className="small muted">Detected columns: email=<b>{preview.columns.email}</b>, name=<b>{preview.columns.name || '(from notes / email)'}</b>, phone=<b>{preview.columns.phone || '—'}</b>, status=<b>{preview.columns.status || '—'}</b></div>
            <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead>
              <tbody>{preview.sample.map((r) => <tr key={r.email}><td>{r.name}</td><td>{r.email}</td><td>{r.phone}</td></tr>)}</tbody></table></div>
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
      </div>
    </Modal>
  );
}

function AddOne({ contestId, onClose, onDone }) {
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await api('POST', `/admin/contests/${contestId}/participants`, f);
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title="Add participant" onClose={onClose} footer={<button className="btn primary" onClick={save}>Add</button>}>
      <div className="stack">
        {['name', 'email', 'phone'].map((k) => (
          <label key={k} className="field">{k}<input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
        ))}
        {error && <div className="error-box">{error}</div>}
      </div>
    </Modal>
  );
}

export default function ParticipantsTab({ contest }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const { data, error, loading, reload } = useAsync(() => api('GET', `/admin/contests/${contest._id}/participants`), [contest._id]);

  const act = async (fn, okMsg) => {
    try {
      const r = await fn();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok');
      reload(true);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const q = search.toLowerCase();
  const rows = (data?.items || []).filter((r) => !q || r.user.name.toLowerCase().includes(q) || r.user.email.includes(q) || (r.user.phone || '').includes(q));

  return (
    <div className="stack">
      <div className="row between">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search name, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="row">
          <button className="btn" onClick={() => download(`/admin/contests/${contest._id}/participants/credentials.csv`, `${contest.slug}-credentials.csv`)}>Credentials CSV</button>
          <button className="btn" onClick={() => setModal('add')}>Add one</button>
          <button className="btn primary" onClick={() => setModal('import')}>Import Razorpay CSV</button>
        </div>
      </div>
      {loading && <Loading />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !data.items.length && <Empty>No participants yet. Import the paid list from Razorpay.</Empty>}
      {rows.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: '65vh' }}>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Violations</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.attemptId}>
                  <td>{r.user.name}</td>
                  <td>{r.user.email}</td>
                  <td>{r.user.phone}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="num">{r.violations}</td>
                  <td>
                    <div className="row">
                      <button className="btn sm" onClick={() => window.confirm('Generate a new access code? The old one stops working.') && act(() => api('POST', `/admin/attempts/${r.attemptId}/reset-code`), (x) => `New code for ${r.user.email}: ${x.accessCode}`)}>New code</button>
                      <button className="btn sm" title="Sign out all devices" onClick={() => act(() => api('POST', `/admin/attempts/${r.attemptId}/logout`), 'Signed out')}>Sign out</button>
                      {r.status === 'NOT_STARTED' && (
                        <button className="btn sm danger" onClick={() => window.confirm('Remove from this contest?') && act(() => api('DELETE', `/admin/attempts/${r.attemptId}`), 'Removed')}>Remove</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="muted small">{data?.total ?? 0} registered</div>
      {modal === 'import' && <ImportModal contestId={contest._id} onClose={() => setModal(null)} onDone={() => reload(true)} />}
      {modal === 'add' && <AddOne contestId={contest._id} onClose={() => setModal(null)} onDone={() => reload(true)} />}
    </div>
  );
}
