import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, download } from '../../lib/api';
import TopBar from '../../components/TopBar';
import { ErrorState, Loading, useAsync, useToast } from '../../components/ui';
import ContestForm from './ContestForm';
import McqTab from './tabs/McqTab';
import ProblemsTab from './tabs/ProblemsTab';
import ParticipantsTab from './tabs/ParticipantsTab';
import MonitorTab from './tabs/MonitorTab';
import LeaderboardTab from './tabs/LeaderboardTab';
import IntegrityTab from './tabs/IntegrityTab';

const TABS = [
  ['monitor', 'Live monitor'],
  ['settings', 'Settings'],
  ['mcqs', 'MCQs'],
  ['problems', 'Coding problems'],
  ['participants', 'Participants'],
  ['leaderboard', 'Leaderboard'],
  ['integrity', 'Integrity'],
];

function SettingsTab({ contest, onSaved }) {
  const toast = useToast();
  const navigate = useNavigate();
  const uploadSeb = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api('POST', `/admin/contests/${contest._id}/seb-file`, fd);
      toast('SEB config uploaded', 'ok');
      onSaved();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this contest with all its questions and participants?')) return;
    try {
      await api('DELETE', `/admin/contests/${contest._id}`);
      navigate('/admin');
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
  return (
    <div className="stack">
      <div className="card">
        <ContestForm
          initial={contest}
          onSubmit={async (body) => {
            await api('PATCH', `/admin/contests/${contest._id}`, body);
            toast('Saved', 'ok');
            onSaved();
          }}
        />
      </div>
      <div className="card stack">
        <h3>Safe Exam Browser config file</h3>
        <div className="muted small">
          Upload the <code>.seb</code> file made with the SEB Config Tool. Candidates get a one-click &quot;Open in SEB&quot; link in the lobby. See docs/SEB.md.
        </div>
        <div className="row">
          {contest.sebConfigFileName ? <span className="badge ok">{contest.sebConfigFileName}</span> : <span className="badge">No file</span>}
          <label className="btn sm">
            Upload .seb
            <input type="file" accept=".seb" hidden onChange={(e) => e.target.files[0] && uploadSeb(e.target.files[0])} />
          </label>
          {contest.sebConfigFileName && (
            <button className="btn sm danger" onClick={() => api('DELETE', `/admin/contests/${contest._id}/seb-file`).then(onSaved)}>Remove</button>
          )}
        </div>
      </div>
      <div className="card row between">
        <div>
          <b>Backup / move</b>
          <div className="muted small">Export settings, MCQs (with answers) and problems (with hidden tests) as JSON. Keep it private.</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => download(`/admin/contests/${contest._id}/export`, `${contest.slug}.contest.json`)}>Export JSON</button>
          <button className="btn danger" onClick={remove}>Delete contest</button>
        </div>
      </div>
    </div>
  );
}

export default function ContestAdmin() {
  const { contestId } = useParams();
  const [tab, setTab] = useState('monitor');
  const { data: contest, error, loading, reload } = useAsync(() => api('GET', `/admin/contests/${contestId}`), [contestId]);

  return (
    <>
      <TopBar>
        <Link to="/admin" className="small">← All contests</Link>
      </TopBar>
      <main className="page" style={{ maxWidth: 1360 }}>
        {loading && !contest && <Loading />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {contest && (
          <>
            <div className="row between" style={{ marginBottom: 12 }}>
              <div>
                <h1 style={{ margin: 0 }}>{contest.title}</h1>
                <div className="muted small">
                  {contest.category && `${contest.category} · `}
                  {contest.durationMin} min · {contest.proctoring.browserPolicy.replace('_', ' ').toLowerCase()}
                </div>
              </div>
              {contest.published ? <span className="badge ok">Published</span> : <span className="badge warn">Draft (hidden from candidates)</span>}
            </div>
            <div className="tabs" role="tablist">
              {TABS.map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'settings' && <SettingsTab contest={contest} onSaved={() => reload(true)} />}
            {tab === 'mcqs' && <McqTab contestId={contestId} />}
            {tab === 'problems' && <ProblemsTab contestId={contestId} />}
            {tab === 'participants' && <ParticipantsTab contest={contest} />}
            {tab === 'monitor' && <MonitorTab contest={contest} />}
            {tab === 'leaderboard' && <LeaderboardTab contest={contest} />}
            {tab === 'integrity' && <IntegrityTab contest={contest} />}
          </>
        )}
      </main>
    </>
  );
}
