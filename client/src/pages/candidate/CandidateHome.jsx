import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import TopBar from '../../components/TopBar';
import { Empty, ErrorState, Loading, StatusBadge, useAsync } from '../../components/ui';

export default function CandidateHome() {
  const { data, error, loading, reload } = useAsync(() => api('GET', '/c/contests'));

  return (
    <>
      <TopBar />
      <main className="page stack">
        <h1>Your contests</h1>
        {loading && <Loading />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && !data.items.length && (
          <Empty>You are not registered for any contest yet. If you have paid, contact the organisers with your payment email.</Empty>
        )}
        <div className="grid2">
          {data?.items.map(({ contest, attempt }) => {
            const now = data.serverNow;
            const notOpen = now < new Date(contest.startAt).getTime();
            const closed = now > new Date(contest.endAt).getTime();
            return (
              <div key={contest._id} className="card stack">
                <div className="row between">
                  <h3 style={{ margin: 0 }}>{contest.title}</h3>
                  <StatusBadge status={attempt.status} />
                </div>
                <div className="muted small">
                  {contest.category && <>Category: <b>{contest.category}</b> · </>}
                  {contest.durationMin} min · opens {fmtDate(contest.startAt)} · closes {fmtDate(contest.endAt)}
                </div>
                <div className="row">
                  {attempt.status === 'SUBMITTED' ? (
                    <span className="badge ok">Submitted. Results will be announced by the organisers.</span>
                  ) : closed && attempt.status === 'NOT_STARTED' ? (
                    <span className="badge">Closed</span>
                  ) : (
                    <Link className="btn primary" to={`/contest/${contest._id}`}>
                      {attempt.status === 'IN_PROGRESS' ? 'Resume' : notOpen ? 'View details' : 'Open'}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
