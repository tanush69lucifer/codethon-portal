import { Link } from 'react-router-dom';
import { api, auth } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import TopBar from '../../components/TopBar';
import { ErrorState, Loading, StatusBadge, useAsync } from '../../components/ui';
import { IconArrowRight, IconCheckCircle, IconInbox } from '../../components/icons';

export default function CandidateHome() {
  const { data, error, loading, reload } = useAsync(() => api('GET', '/c/contests'));
  const first = (auth.user?.name || '').trim().split(/\s+/)[0];

  return (
    <div className="cz">
      <TopBar />
      <main className="page stack" style={{ gap: 22 }}>
        <section className="cz-hero cz-rise">
          <div className="cz-grid-bg" />
          <div className="kicker">
            <span className="cz-live" style={{ color: 'var(--primary)' }} /> Participant dashboard
          </div>
          <h1>{first ? `Hey ${first}, ready to code?` : 'Ready to code?'}</h1>
          <p>Your contests are below. Open one to read the rules, then start when you&apos;re set. The timer only begins when you press Start.</p>
        </section>

        {loading && <Loading label="Fetching your contests" />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && !data.items.length && (
          <div className="cz-empty cz-rise d1">
            <IconInbox size={34} />
            <div>You are not registered for any contest yet. If you have paid, contact the organisers with your payment email.</div>
          </div>
        )}

        <div className="cz-contests">
          {data?.items.map(({ contest, attempt }, idx) => {
            const now = data.serverNow;
            const notOpen = now < new Date(contest.startAt).getTime();
            const closed = now > new Date(contest.endAt).getTime();
            return (
              <article key={contest._id} className={`cz-contest cz-rise d${Math.min(idx + 1, 4)}`} data-status={attempt.status}>
                <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <div style={{ minWidth: 0 }}>
                    {contest.category && <div className="cat">{contest.category}</div>}
                    <h3>{contest.title}</h3>
                  </div>
                  <StatusBadge status={attempt.status} />
                </div>
                <div className="cz-meta">
                  <div>
                    <div className="k">Duration</div>
                    <div className="v">{contest.durationMin} min</div>
                  </div>
                  <div>
                    <div className="k">Opens</div>
                    <div className="v">{fmtDate(contest.startAt)}</div>
                  </div>
                  <div>
                    <div className="k">Closes</div>
                    <div className="v">{fmtDate(contest.endAt)}</div>
                  </div>
                </div>
                <div className="foot">
                  {attempt.status === 'SUBMITTED' ? (
                    <span className="cz-done-note">
                      <IconCheckCircle size={16} /> Submitted. Results will be announced by the organisers.
                    </span>
                  ) : closed && attempt.status === 'NOT_STARTED' ? (
                    <span className="badge">Closed</span>
                  ) : (
                    <>
                      <span className="muted small">{notOpen ? 'Not open yet' : attempt.status === 'IN_PROGRESS' ? 'Timer is running' : 'Open now'}</span>
                      <Link className="btn primary" to={`/contest/${contest._id}`}>
                        {attempt.status === 'IN_PROGRESS' ? 'Resume' : notOpen ? 'View details' : 'Open'} <IconArrowRight size={15} />
                      </Link>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
