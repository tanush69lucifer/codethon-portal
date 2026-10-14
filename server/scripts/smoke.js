// End-to-end smoke test against a running API + worker with seeded data.
// Usage: npm run seed && (start api + worker) && node scripts/smoke.js [baseUrl]
// Uses candidate@demo.test / DEMO2026 and ADMIN_EMAIL / ADMIN_PASSWORD from .env.
const config = require('../src/config');

const BASE = process.argv[2] || `http://localhost:${config.port}`;
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures += 1;
};

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitJudge(token, id) {
  for (let i = 0; i < 90; i += 1) {
    const r = await call('GET', `/api/c/submissions/${id}`, { token });
    if (r.data && ['DONE', 'ERROR'].includes(r.data.status)) return r.data;
    await sleep(1000);
  }
  throw new Error('judge timeout');
}

const SUM_EVEN = `import java.util.*; import java.io.*;
public class Main { public static void main(String[] a) throws IOException {
  BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
  int n = Integer.parseInt(br.readLine().trim()); StringTokenizer st = new StringTokenizer(br.readLine());
  long s = 0; for (int i = 0; i < n; i++) { long x = Long.parseLong(st.nextToken()); if (x % 2 == 0) s += x; }
  System.out.println(s); } }`;

(async () => {
  const bad = await call('POST', '/api/auth/login', { body: { email: 'candidate@demo.test', code: 'WRONG' } });
  ok(bad.status === 401, 'wrong access code rejected');

  const login = await call('POST', '/api/auth/login', { body: { email: 'candidate@demo.test', code: 'demo2026' } });
  ok(login.status === 200 && login.data.token, 'candidate login (code is case-insensitive)');
  const token = login.data.token;

  const list = await call('GET', '/api/c/contests', { token });
  ok(list.data.items.length >= 1, 'candidate sees assigned contest');
  const contestId = list.data.items[0].contest._id;

  const early = await call('GET', `/api/c/contests/${contestId}/paper`, { token });
  ok(early.status === 409, 'paper blocked before start');

  const start = await call('POST', `/api/c/contests/${contestId}/start`, { token, body: { screen: { w: 1920, h: 1080 } } });
  ok(start.status === 200 && start.data.attempt.status === 'IN_PROGRESS', 'start attempt');

  const paper = await call('GET', `/api/c/contests/${contestId}/paper`, { token });
  ok(paper.status === 200 && paper.data.mcqs.length === 5 && paper.data.problems.length === 2, 'paper loads 5 MCQ + 2 problems');
  ok(!JSON.stringify(paper.data).includes('correctIndex') && !paper.data.problems[0].tests, 'paper hides answers and hidden tests');

  const q = paper.data.mcqs[0];
  const save = await call('PUT', `/api/c/contests/${contestId}/mcq/${q._id}`, { token, body: { choice: q.options[0].id } });
  ok(save.status === 200, 'MCQ answer saved');

  const p = paper.data.problems.find((x) => x.title.startsWith('Sum'));
  const run = await call('POST', `/api/c/contests/${contestId}/problems/${p._id}/run`, { token, body: { code: SUM_EVEN, input: null } });
  ok(run.status === 202, 'run queued');
  const runRes = await waitJudge(token, run.data.submissionId);
  ok(runRes.verdict === 'AC' && runRes.runOutputs[0].stdout.trim() === '6', `run on samples -> ${runRes.verdict}`);

  const sub = await call('POST', `/api/c/contests/${contestId}/problems/${p._id}/submit`, { token, body: { code: SUM_EVEN } });
  const subRes = await waitJudge(token, sub.data.submissionId);
  ok(subRes.verdict === 'AC' && subRes.score === 100, `submit -> ${subRes.verdict} ${subRes.score}/${subRes.maxScore}`);
  ok(!subRes.runOutputs?.length, 'submit does not leak hidden test output');

  const cool = await call('POST', `/api/c/contests/${contestId}/problems/${p._id}/submit`, { token, body: { code: SUM_EVEN } });
  ok(cool.status === 429, 'submit cooldown enforced');

  const ev = await call('POST', `/api/c/contests/${contestId}/events`, {
    token,
    body: { focused: false, events: [{ code: 'TAB_HIDDEN', t: Date.now() }, { code: 'WINDOW_BLUR' }, { code: 'BOGUS' }] },
  });
  ok(ev.status === 200 && ev.data.violations === 1, 'proctor events recorded, 1 violation counted');

  // second login kicks the first session
  const login2 = await call('POST', '/api/auth/login', { body: { email: 'candidate@demo.test', code: 'DEMO2026' } });
  await sleep(10_500); // nonce cache TTL
  const old = await call('GET', '/api/c/contests', { token });
  ok(old.status === 401 && old.error.code === 'SESSION_REPLACED', 'old session closed after new login');
  const token2 = login2.data.token;

  // admin
  const admin = await call('POST', '/api/auth/login', { body: { email: config.admin.email, password: config.admin.password } });
  ok(admin.status === 200 && admin.data.user.role === 'ADMIN', 'admin login');
  const at = admin.data.token;
  const denied = await call('GET', '/api/admin/contests', { token: token2 });
  ok(denied.status === 403, 'candidate blocked from admin API');
  const mon = await call('GET', `/api/admin/contests/${contestId}/monitor`, { token: at });
  ok(mon.status === 200 && mon.data.rows.some((r) => r.status === 'IN_PROGRESS'), 'monitor shows live attempt');
  const lb = await call('GET', `/api/admin/contests/${contestId}/leaderboard`, { token: at });
  const me = lb.data.rows.find((r) => r.email === 'candidate@demo.test');
  ok(me && me.coding === 100, `leaderboard coding=${me?.coding} mcq=${me?.mcq} total=${me?.total}`);
  const plag = await call('POST', `/api/admin/contests/${contestId}/plagiarism`, { token: at, body: { threshold: 0.8 } });
  ok(plag.status === 200, `plagiarism check ran (${plag.data?.checked} submissions)`);

  const fin = await call('POST', `/api/c/contests/${contestId}/finish`, { token: token2 });
  ok(fin.data.status === 'SUBMITTED', 'finish test');
  const after = await call('PUT', `/api/c/contests/${contestId}/mcq/${q._id}`, { token: token2, body: { choice: 0 } });
  ok(after.status === 409, 'no edits after submit');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
