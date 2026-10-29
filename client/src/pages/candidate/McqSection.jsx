import { md } from '../../lib/format';
import { IconArrowLeft, IconArrowRight, IconCheck, IconFlag, IconSave, IconX } from '../../components/icons';

const KEYS = 'ABCDEF';
const pad2 = (n) => String(n).padStart(2, '0');

export default function McqSection({ mcqs, answers, review, index, setIndex, onAnswer, onToggleReview, negative }) {
  const q = mcqs[index];
  if (!q) return <div className="page muted">No MCQs in this contest.</div>;
  const selected = answers[q._id];
  const answered = Object.keys(answers).length;
  const marked = Object.values(review).filter(Boolean).length;

  return (
    <div className="mcq-wrap no-select">
      <div className="card cz-q" key={q._id}>
        <div className="cz-q-head">
          <div className="cz-q-num">
            <span className="lbl">Question</span>
            <span className="n">{pad2(index + 1)}</span>
            <span className="of">/ {pad2(mcqs.length)}</span>
          </div>
          <span className="cz-marks">
            <span className="pos">+{q.marks}</span>
            {negative ? <span className="neg">−{negative}</span> : null}
          </span>
        </div>
        <div className="md cz-q-text" dangerouslySetInnerHTML={md(q.text)} />
        <div className="stack" style={{ gap: 10 }} role="radiogroup">
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
              <IconCheck size={18} className="tick" />
            </div>
          ))}
        </div>
        <div className="cz-q-foot">
          <div className="row">
            <button className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              <IconArrowLeft size={15} /> Previous
            </button>
            <button className="btn primary" disabled={index >= mcqs.length - 1} onClick={() => setIndex(index + 1)}>
              Next <IconArrowRight size={15} />
            </button>
          </div>
          <div className="row">
            {selected !== undefined && (
              <button className="btn ghost sm" onClick={() => onAnswer(q._id, null)}>
                <IconX size={13} /> Clear answer
              </button>
            )}
            <button className={`btn sm cz-review-btn ${review[q._id] ? 'on' : ''}`} onClick={() => onToggleReview(q._id)}>
              <IconFlag size={13} /> {review[q._id] ? 'Marked for review' : 'Mark for review'}
            </button>
          </div>
        </div>
      </div>

      <div className="card cz-palette">
        <div className="cz-palette-head">
          <b>Question palette</b>
          <span className="num">
            {answered}/{mcqs.length}
          </span>
        </div>
        <div className="cz-bar" aria-hidden="true">
          <div style={{ width: `${(answered / mcqs.length) * 100}%` }} />
        </div>
        <div className="qgrid">
          {mcqs.map((m, i) => (
            <button
              key={m._id}
              className={`qcell ${answers[m._id] !== undefined ? 'answered' : ''} ${review[m._id] ? 'review' : ''} ${i === index ? 'current' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Question ${i + 1}${answers[m._id] !== undefined ? ', answered' : ''}${review[m._id] ? ', marked for review' : ''}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <div className="cz-legend">
          <span><i className="a" /> Answered</span>
          <span><i /> Not answered</span>
          <span><i className="r" /> Review ({marked})</span>
          <span><i className="c" /> Current</span>
        </div>
        <div className="cz-autosave">
          <IconSave size={13} /> Answers save automatically
        </div>
      </div>
    </div>
  );
}
