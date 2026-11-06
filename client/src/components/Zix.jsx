import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Zix — the Genzis mascot. Lives inside the React root (never on <body>) so the
 * proctoring overlay scan ignores it. Other components talk to it with:
 *   zixSay('text', 'happy' | 'shy' | 'think' | 'worry' | 'party' | null, ms?)
 *   zixConfetti(count)
 */
const EVT = 'cz:zix';
export function zixSay(text, mood = null, ms) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { text, mood, ms } }));
}
export function zixMood(mood, ms) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { mood, ms } }));
}
export function zixConfetti(count = 24) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { confetti: count } }));
}

const MOUTH = {
  smile: 'M54 68 Q60 73 66 68',
  open: 'M53 67 Q60 77 67 67 Z',
  flat: 'M54 69 L66 69',
  o: 'M58 69 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0',
  worry: 'M54 71 Q60 66 66 71',
};
const mouthFor = (m) => (m === 'happy' || m === 'party' ? MOUTH.open : m === 'think' ? MOUTH.flat : m === 'worry' ? MOUTH.worry : m === 'sleep' ? MOUTH.o : MOUTH.smile);

const CLICK_LINES = [
  'Boop.',
  'I run on Java and good vibes.',
  'Built by Genzis. Generations ahead.',
  'Psst, the timer is still running.',
  'Stuck? Re-read the sample input.',
  'Tab switches get logged. I see everything.',
];

function greetingFor(path) {
  if (path.startsWith('/login')) return ["Hey, I'm Zix. I keep an eye on the arena.", 'wave'];
  if (path.startsWith('/contest/') && !path.endsWith('/exam')) return ['Read each MCQ twice, then commit.', 'happy'];
  if (path.startsWith('/home')) return ['Welcome back. Your contests are right here.', 'wave'];
  return null;
}

const COLORS = ['#FFC83D', '#FF6A1F', '#FF3FA4', '#9D6BFF', '#2EC8FF', '#8CFF3A'];

export default function Zix() {
  const { pathname } = useLocation();
  const left = pathname.endsWith('/exam');
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [mood, setMoodState] = useState(null);
  const [blink, setBlink] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const [bits, setBits] = useState([]);
  const botRef = useRef(null);
  const t = useRef({});

  const setMood = useCallback((m, ms) => {
    setMoodState(null);
    requestAnimationFrame(() => setMoodState(m));
    clearTimeout(t.current.mood);
    if (m && ms) t.current.mood = setTimeout(() => setMoodState(null), ms);
  }, []);

  const poke = useCallback(() => {
    clearTimeout(t.current.idle);
    setMoodState((m) => (m === 'sleep' ? null : m));
    t.current.idle = setTimeout(() => setMoodState('sleep'), 25000);
  }, []);

  const say = useCallback(
    (msg, m, ms) => {
      if (msg) {
        setText(msg);
        setOpen(true);
        clearTimeout(t.current.bub);
        t.current.bub = setTimeout(() => setOpen(false), 4600);
      }
      if (m !== undefined) setMood(m, ms ?? 2600);
      poke();
    },
    [setMood, poke]
  );

  const confetti = useCallback((n) => {
    const r = botRef.current?.getBoundingClientRect();
    if (!r) return;
    const dir = left ? 1 : -1;
    const id = Date.now();
    const next = Array.from({ length: n }, (_, i) => ({
      id: `${id}-${i}`,
      x: r.left + r.width / 2,
      y: r.top + r.height / 3,
      c: COLORS[i % COLORS.length],
      dx: dir * (Math.random() * 320 - 60),
      dy: -(Math.random() * 260 + 40),
      rot: Math.random() * 720 - 360,
    }));
    setBits((b) => [...b, ...next]);
    setTimeout(() => setBits((b) => b.filter((x) => !x.id.startsWith(`${id}-`))), 1300);
  }, [left]);

  // event bus
  useEffect(() => {
    const on = (e) => {
      const d = e.detail || {};
      if (d.confetti) confetti(d.confetti);
      if (d.text || d.mood !== undefined) say(d.text, d.mood, d.ms);
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, [say, confetti]);

  // greeting per page
  useEffect(() => {
    const g = greetingFor(pathname);
    if (!g) return undefined;
    const id = setTimeout(() => say(g[0], g[1], 2400), 700);
    return () => clearTimeout(id);
  }, [pathname, say]);

  // eyes follow the pointer, blink, doze off when idle
  useEffect(() => {
    const move = (e) => {
      const r = botRef.current?.getBoundingClientRect();
      if (!r) return;
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height * 0.45);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 220) * 2.6;
      setPupil({ x: (dx / d) * k, y: (dy / d) * k * 1.3 });
    };
    const key = () => poke();
    let alive = true;
    const loop = () => {
      t.current.blink = setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => setBlink(false), 130);
        loop();
      }, 2600 + Math.random() * 2600);
    };
    loop();
    poke();
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', key);
    const timers = t.current;
    return () => {
      alive = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', key);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [poke]);

  const click = () => {
    if (tucked) {
      setTucked(false);
      say("I'm back.", 'happy');
      return;
    }
    say(CLICK_LINES[Math.floor(Math.random() * CLICK_LINES.length)], 'happy', 1200);
  };

  const cls = ['zix', left && 'left', tucked && 'tucked', mood, blink && mood !== 'sleep' && 'blink'].filter(Boolean).join(' ');
  const m = mouthFor(mood);
  const mouthFill = mood === 'happy' || mood === 'party' ? '#FF48B0' : 'none';

  return (
    <>
      <div className={cls}>
        <div className={`zbub ${open ? '' : 'off'}`} role="status" aria-live="polite">
          <b>Zix</b>
          <span>{text}</span>
        </div>
        <button type="button" className="zbot" ref={botRef} onClick={click} aria-label="Zix, the Genzis guide. Click for a tip.">
          <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="zg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#FFC83D" />
                <stop offset=".3" stopColor="#FF6A1F" />
                <stop offset=".55" stopColor="#FF3FA4" />
                <stop offset=".8" stopColor="#9D6BFF" />
                <stop offset="1" stopColor="#2EC8FF" />
              </linearGradient>
              <linearGradient id="zr" x1="0" x2="1">
                <stop offset="0" stopColor="#FF6A1F" />
                <stop offset=".33" stopColor="#FF3FA4" />
                <stop offset=".66" stopColor="#9D6BFF" />
                <stop offset="1" stopColor="#8CFF3A" />
              </linearGradient>
            </defs>
            <ellipse cx="60" cy="113" rx="30" ry="5" fill="#000" opacity=".35" />
            <g className="zb">
              <g className="zant">
                <line x1="60" y1="28" x2="60" y2="13" stroke="#3A2F58" strokeWidth="3" strokeLinecap="round" />
                <rect className="zpix" x="54" y="3" width="12" height="12" rx="2" fill="#FFC83D" />
                <rect x="44" y="9" width="5" height="5" fill="#FFC83D" opacity=".7" />
                <rect x="38" y="4" width="4" height="4" fill="#FFC83D" opacity=".45" />
              </g>
              <rect x="34" y="96" width="14" height="10" rx="4" fill="#2A1F42" />
              <rect x="72" y="96" width="14" height="10" rx="4" fill="#2A1F42" />
              <rect x="26" y="27" width="68" height="72" rx="22" fill="#1A1230" stroke="url(#zg)" strokeWidth="4" />
              <rect x="34" y="38" width="52" height="38" rx="12" fill="#0B0614" />
              <g className="zeye">
                <rect x="40" y="48" width="13" height="17" rx="6.5" fill="#EFEAFB" />
                <circle cx={46.5 + pupil.x} cy={57 + pupil.y} r="4" fill="#0E0818" />
              </g>
              <g className="zeye">
                <rect x="67" y="48" width="13" height="17" rx="6.5" fill="#EFEAFB" />
                <circle cx={73.5 + pupil.x} cy={57 + pupil.y} r="4" fill="#0E0818" />
              </g>
              <circle className="zcheek" cx="39" cy="70" r="3.5" fill="#FF48B0" />
              <circle className="zcheek" cx="81" cy="70" r="3.5" fill="#FF48B0" />
              <path d={m} stroke="#EFEAFB" strokeWidth="2.4" fill={mouthFill} strokeLinecap="round" />
              <path d="M30 84 C 50 92, 70 78, 92 86" stroke="url(#zr)" strokeWidth="6" fill="none" strokeLinecap="round" />
              <path className="zsweat" d="M88 40 q4 6 0 9 q-4 -3 0 -9z" fill="#7CC4F2" />
              <rect className="zarm zarmL" x="20" y="68" width="8" height="24" rx="4" fill="url(#zg)" />
              <rect className="zarm zarmR" x="92" y="68" width="8" height="24" rx="4" fill="url(#zg)" />
            </g>
          </svg>
        </button>
        <button type="button" className="ztuck" onClick={() => { setTucked(true); setOpen(false); }} aria-label="Tuck Zix away">
          ×
        </button>
      </div>
      {bits.map((b) => (
        <span
          key={b.id}
          className="zconf"
          aria-hidden="true"
          style={{ left: b.x, top: b.y, background: b.c, '--dx': `${b.dx}px`, '--dy': `${b.dy}px`, '--r': `${b.rot}deg` }}
        />
      ))}
    </>
  );
}
