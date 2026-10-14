import { md } from '../../lib/format';

const KEYS = 'ABCDEF';

export default function McqSection({ mcqs, answers, review, index, setIndex, onAnswer, onToggleReview, negative }) {
  const q = mcqs[index];
  if (!q) return <div className="page muted">No MCQs in this contest.</div>;
  const selected = answers[q._id];

  return (
    <div className="mcq-wrap no-select">
      <div className="card stack">
        <div className="row between">
          <b>
            Question {index + 1} of {mcqs.length}
          </b>
          <span className="muted small">
            +{q.marks}
            {negative ? ` / −${negative}` : ''}
          </span>
        </div>
        <div className="md" dangerouslySetInnerHTML={md(q.text)} />
        <div className="stack" style={{ gap: 8 }} role="radiogroup">
          {q.options.map((opt, i) => (
            <div
              key={opt.id}
              role="radio"
              tabIndex={0}
              aria-checked={selected === opt.id}
              className={`option ${selected === opt.id ? 'selected' : ''}`}
              onClick={() => onAnswer(q._id, opt.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAnswer(q._id, opt.id)}
            >
              <span className="key">{KEYS[i]}</span>
              <span className="md grow" dangerouslySetInnerHTML={md(opt.text)} />
            </div>
          ))}
        </div>
        <div className="row between">
          <div className="row">
            <button className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              ← Previous
            </button>
            <button className="btn" disabled={index >= mcqs.length - 1} onClick={() => setIndex(index + 1)}>
              Next →
            </button>
          </div>
          <div className="row">
            {selected !== undefined && (
              <button className="btn ghost sm" onClick={() => onAnswer(q._id, null)}>
                Clear answer
              </button>
            )}
            <button className="btn sm" onClick={() => onToggleReview(q._id)}>
              {review[q._id] ? '★ Marked for review' : '☆ Mark for review'}
            </button>
          </div>
        </div>
      </div>

      <div className="card stack">
        <b>Questions</b>
        <div className="qgrid">
          {mcqs.map((m, i) => (
            <button
              key={m._id}
              className={`qcell ${answers[m._id] !== undefined ? 'answered' : ''} ${review[m._id] ? 'review' : ''} ${i === index ? 'current' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Question ${i + 1}${answers[m._id] !== undefined ? ', answered' : ''}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="small muted">
          <span className="badge ok">answered</span> <span className="badge" style={{ boxShadow: 'inset 0 -3px 0 var(--warn)' }}>review</span>
        </div>
        <div className="small">
          Answered <b className="num">{Object.keys(answers).length}</b> / {mcqs.length}
        </div>
      </div>
    </div>
  );
}
