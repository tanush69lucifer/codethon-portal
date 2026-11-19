import { useEffect, useMemo, useState } from 'react';

// Anti-leak layers drawn over the question paper:
//  1. A faint watermark tiled across the screen with the candidate's name, email,
//     attempt id and the current time. A photo or screenshot of the paper shows who
//     leaked it and when.
//  2. A fine moving line pattern. It is barely visible to the eye, but a phone camera
//     pointed at the screen picks up moiré/rolling bands, which makes photos and
//     Google Lens scans noticeably worse. It does not make scanning impossible.
// Both layers ignore the pointer, so they never get in the way of answering.

const pad = (n) => String(n).padStart(2, '0');
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mid grey reads on both the light MCQ paper and the dark coding terminal.
function tileSvg(lines) {
  const fill = '#808080';
  const text = lines
    .map((l, i) => `<text x="0" y="${i * 18}" font-family="monospace" font-size="13" fill="${fill}">${esc(l)}</text>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="190"><g transform="translate(24 96) rotate(-22)">${text}</g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export default function ExamShield({ user, attemptId, noise = true }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tag = attemptId ? `#${String(attemptId).slice(-6).toUpperCase()}` : '';
  const bg = useMemo(
    () =>
      tileSvg(
        [user?.name || 'Candidate', user?.email || '', `${clock(now)} ${tag}`.trim()].filter(Boolean)
      ),
    [user?.name, user?.email, now, tag]
  );

  return (
    <>
      {noise && <div className="cz-antiscan" aria-hidden="true" />}
      <div className="cz-watermark" aria-hidden="true" style={{ backgroundImage: bg }} />
    </>
  );
}
