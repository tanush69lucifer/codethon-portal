// Codezis UI preview: serves client/dist with a fake API so you can click
// through every candidate screen without MongoDB, Docker or the judge.
//
//   cd client && npm install && npm run preview:demo
//   open http://localhost:4400 and sign in with any email + any code
//
// Preview only. Never deploy this; it accepts any login.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 4400;
const DIST = path.resolve(__dirname, '..', 'client', 'dist');
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('No client/dist found. Run "npm run build" in client first (or use "npm run preview:demo").');
  process.exit(1);
}

const now = () => Date.now();
const iso = (ms) => new Date(ms).toISOString();
const START = now();
const contest = {
  _id: 'c1', title: 'Java Sprint · Round 1', category: 'Codezis', durationMin: 90,
  startAt: iso(START - 3600e3), endAt: iso(START + 7200e3),
  instructions: 'Answer all MCQs, then solve the problems in **Java 21**.',
  mcq: { marks: 4, negative: 1 },
  proctoring: { requireFullscreen: false, blockPaste: true, browserPolicy: 'ANY' },
};
let attempt = { status: 'NOT_STARTED' };
const QS = [
  ['What does this program print?\n\n```java\nint x = 5;\nSystem.out.println(x++ + ++x);\n```', ['10', '11', '12', '13']],
  ['Which statement about Java Strings is true?', ['Strings are mutable', 'Strings are immutable', 'concat edits in place', '`==` compares contents']],
  ['Time complexity of this loop?\n\n```java\nfor (int i = 1; i < n; i *= 2) count++;\n```', ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)']],
];
const mcqs = Array.from({ length: 30 }, (_, i) => {
  const [text, opts] = QS[i % 3];
  return { _id: `q${i}`, text, marks: 4, options: opts.map((t, j) => ({ id: 'abcd'[j], text: t })) };
});
const problem = (id, title, points) => ({
  _id: id, title, points, timeLimitMs: 1000, memoryMb: 256,
  statement: 'A street has **N** lanterns in a row; lantern **i** draws **a[i]** units of power. The grid can supply at most **K** units at once. Print the length of the longest contiguous run you can light.',
  inputFormat: 'Line 1: N and K. Line 2: N integers a[1..N].', outputFormat: 'One integer.',
  constraints: '1 ≤ N ≤ 2·10⁵, 1 ≤ a[i] ≤ 10⁴, 1 ≤ K ≤ 10⁹',
  samples: [{ input: '5 7\n2 1 3 4 1', output: '3' }],
  starterCode: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // your code here\n    }\n}\n',
});
const problems = [problem('p1', 'Lantern Street', 100), problem('p2', 'Mirror Ledger', 150), problem('p3', 'Signal Towers', 200)];
const answers = {};
let submissions = [];
const subs = {};

function api(method, url, body) {
  if (url.startsWith('/auth/login')) return { token: 'preview', user: { name: 'Tanush Bhardwaj', role: 'CANDIDATE', email: body?.email || 'you@example.com' } };
  if (url.startsWith('/auth/')) return {};
  if (url === '/c/contests') return { items: [{ contest, attempt }], serverNow: now() };
  if (url === '/c/contests/c1') return { contest, attempt, browser: { seb: false }, counts: { mcq: 30, problems: 3 }, serverNow: now() };
  if (url === '/c/contests/c1/start') {
    if (attempt.status === 'NOT_STARTED') attempt = { status: 'IN_PROGRESS', startedAt: iso(now()), deadlineAt: iso(now() + 90 * 60e3) };
    return { ok: true };
  }
  if (url === '/c/contests/c1/paper') {
    if (attempt.status !== 'IN_PROGRESS') attempt = { status: 'IN_PROGRESS', startedAt: iso(now()), deadlineAt: iso(now() + 90 * 60e3) };
    return { contest, mcqs, problems, attempt: { ...attempt, mcqAnswers: answers, codeDrafts: {}, coding: {}, violations: 0 }, serverNow: now() };
  }
  const mcq = url.match(/^\/c\/contests\/c1\/mcq\/(\w+)/);
  if (mcq) { if (body?.choice == null) delete answers[mcq[1]]; else answers[mcq[1]] = body.choice; return {}; }
  const judge = url.match(/^\/c\/contests\/c1\/problems\/(\w+)\/(run|submit)$/);
  if (judge) {
    const id = `s${Date.now()}`;
    const kind = judge[2] === 'run' ? 'RUN' : 'SUBMIT';
    subs[id] = { created: now(), kind, problem: judge[1] };
    return { submissionId: id };
  }
  const poll = url.match(/^\/c\/submissions\/(\w+)/);
  if (poll) {
    const s = subs[poll[1]];
    if (!s || now() - s.created < 1800) return { status: 'QUEUED', queuePosition: 2 };
    if (s.kind === 'RUN') return { status: 'DONE', kind: 'RUN', verdict: 'OK', runOutputs: [{ input: '5 7\n2 1 3 4 1', expected: '3', stdout: '3', verdict: 'OK', timeMs: 84 }] };
    const r = { _id: poll[1], status: 'DONE', kind: 'SUBMIT', verdict: 'AC', score: 100, maxScore: 100, passed: 12, total: 12, createdAt: iso(s.created), tests: Array.from({ length: 12 }, () => ({ verdict: 'AC', timeMs: 70 + Math.round(Math.random() * 30) })) };
    if (!submissions.some((x) => x._id === r._id)) submissions = [r, ...submissions];
    return r;
  }
  if (/\/submissions$/.test(url)) return { items: submissions };
  if (url === '/c/contests/c1/finish') { attempt = { status: 'SUBMITTED' }; return { status: 'SUBMITTED' }; }
  return {};
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith('/api/')) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = undefined; }
      const data = api(req.method, url.slice(4), body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data }));
    });
    return;
  }
  let file = path.join(DIST, url);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Codezis preview → http://localhost:${PORT}  (any email + code logs in)`));
