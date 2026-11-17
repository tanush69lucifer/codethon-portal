// Load test v2: finds the breaking point of the portal, not just "does 300 work".
// Run against a STAGING copy only. It creates users lt1..ltN@load.test and enrols them.
//
//   # one run, like before
//   node scripts/loadtest.js --url http://localhost:5000 --contest <slug> --users 500 --minutes 3
//
//   # step test: 500 -> 1000 -> 2000, stops at the first stage that fails the SLO
//   node scripts/loadtest.js --contest <slug> --stages 500,1000,2000 --minutes 3
//
// Options
//   --url        API base (default http://localhost:5000)
//   --contest    contest slug (default demo-senior)
//   --users N    single stage of N candidates (ignored if --stages is given)
//   --stages     comma list of candidate counts, run one after another
//   --minutes    length of each stage (default 2)
//   --ramp S     seconds over which candidates log in (default 15). 0 = everyone at once,
//                which is what really happens when a contest opens at a fixed time.
//   --ips N      spread candidates over N fake client IPs via X-Forwarded-For (default 0 = off,
//                all traffic from one IP like a single school NAT). Needs trust proxy (already on).
//   --endrush    last 25% of each stage, everyone submits every 10-20s (the final-minutes storm)
//   --p95 MS     SLO: p95 latency limit for API calls, judge excluded (default 1500)
//   --maxerr P   SLO: max error rate in percent (default 1)
//   --out FILE   write all results as JSON (default loadtest-<timestamp>.json)
//   --nosubmit   skip code submissions (API-only test, e.g. on Windows where the judge can't run)
//
// Exit code 0 = every stage passed the SLO, 1 = a stage failed (useful in CI).
//
// Before a big run on the VM, raise the per-IP limit or a single-IP test trips it:
//   API_RATE_PER_IP_PER_MIN=200000 (in .env, then restart api)  OR use --ips 50
const fs = require('fs');
const { connectDB, mongoose } = require('../src/db');
const Contest = require('../src/models/Contest');
const User = require('../src/models/User');
const Attempt = require('../src/models/Attempt');

const args = {};
process.argv.slice(2).forEach((cur, i, arr) => {
  if (!cur.startsWith('--')) return;
  const next = arr[i + 1];
  args[cur.slice(2)] = next && !next.startsWith('--') ? next : true;
});
const BASE = String(args.url || 'http://localhost:5000').replace(/\/$/, '');
const SLUG = args.contest || 'demo-senior';
const MINUTES = Number(args.minutes || 2);
const RAMP_MS = Number(args.ramp ?? 15) * 1000;
const IPS = Number(args.ips || 0);
const ENDRUSH = Boolean(args.endrush);
const NOSUBMIT = Boolean(args.nosubmit);
const SLO_P95 = Number(args.p95 || 1500);
const SLO_ERR = Number(args.maxerr || 1);
const STAGES = args.stages ? String(args.stages).split(',').map(Number).filter(Boolean) : [Number(args.users || 100)];
const OUT = args.out || `loadtest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

const CODE = `import java.util.*;
public class Main { public static void main(String[] a) { Scanner s = new Scanner(System.in);
  int n = s.nextInt(); long t = 0; for (int i = 0; i < n; i++) { long x = s.nextLong(); if (x % 2 == 0) t += x; }
  System.out.println(t); } }`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

function newStats() {
  return { lat: {}, calls: 0, errors: 0, errorCodes: {}, inflight: 0, peakInflight: 0 };
}

async function call(st, ip, name, method, path, token, body) {
  const t0 = Date.now();
  st.calls += 1;
  st.inflight += 1;
  st.peakInflight = Math.max(st.peakInflight, st.inflight);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(ip ? { 'X-Forwarded-For': ip } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => ({}));
    (st.lat[name] = st.lat[name] || []).push(Date.now() - t0);
    if (!res.ok) {
      st.errors += 1;
      const k = `${name}:${res.status}:${json?.error?.code || '-'}`;
      st.errorCodes[k] = (st.errorCodes[k] || 0) + 1;
    }
    return json.data;
  } catch (e) {
    st.errors += 1;
    const k = `${name}:${e.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK'}`;
    st.errorCodes[k] = (st.errorCodes[k] || 0) + 1;
    return null;
  } finally {
    st.inflight -= 1;
  }
}

async function prepare(n) {
  await connectDB();
  const contest = await Contest.findOne({ slug: SLUG });
  if (!contest) throw new Error(`Contest ${SLUG} not found`);
  const users = Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return { email: `lt${i}@load.test`, code: `LOAD${String(i).padStart(5, '0')}`, name: `Load ${i}` };
  });
  // bulk upserts: 2000 users in seconds instead of minutes
  await User.bulkWrite(
    users.map((u) => ({
      updateOne: {
        filter: { email: u.email },
        update: { $set: { name: u.name, role: 'CANDIDATE', accessCode: u.code } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  const ids = await User.find({ email: { $in: users.map((u) => u.email) } }).select('_id').lean();
  await Attempt.deleteMany({ contestId: contest._id, userId: { $in: ids.map((d) => d._id) } });
  await Attempt.insertMany(ids.map((d) => ({ contestId: contest._id, userId: d._id })), { ordered: false });
  await mongoose.disconnect();
  return { contestId: String(contest._id), users };
}

async function candidate(st, u, idx, contestId, startAt, until) {
  const ip = IPS ? `10.${(idx % IPS) >> 8 & 255}.${(idx % IPS) & 255}.${1 + (idx % 250)}` : null;
  await sleep(RAMP_MS ? rnd(0, RAMP_MS) : 0);
  const login = await call(st, ip, 'login', 'POST', '/api/auth/login', null, { email: u.email, code: u.code });
  if (!login) return;
  const token = login.token;
  await call(st, ip, 'start', 'POST', `/api/c/contests/${contestId}/start`, token, { screen: { w: 1366, h: 768 } });
  const paper = await call(st, ip, 'paper', 'GET', `/api/c/contests/${contestId}/paper`, token);
  if (!paper) return;
  const rushAt = startAt + (until - startAt) * 0.75;
  let qi = 0;
  let nextSubmit = Date.now() + rnd(20000, 60000);
  let nextBeat = Date.now() + 20000;
  while (Date.now() < until) {
    const rush = ENDRUSH && Date.now() > rushAt;
    if (qi < (paper.mcqs || []).length) {
      const q = paper.mcqs[qi];
      await call(st, ip, 'mcq', 'PUT', `/api/c/contests/${contestId}/mcq/${q._id}`, token, { choice: q.options[0].id });
      qi += 1;
    }
    if (Date.now() > nextBeat) {
      await call(st, ip, 'events', 'POST', `/api/c/contests/${contestId}/events`, token, { focused: true, events: [] });
      nextBeat = Date.now() + 20000;
    }
    if (!NOSUBMIT && Date.now() > nextSubmit && (paper.problems || []).length) {
      const p = paper.problems[Math.floor(Math.random() * paper.problems.length)];
      const r = await call(st, ip, 'submit', 'POST', `/api/c/contests/${contestId}/problems/${p._id}/submit`, token, { code: CODE });
      if (r?.submissionId) {
        const t0 = Date.now();
        for (let i = 0; i < 120 && Date.now() < until + 90_000; i += 1) {
          await sleep(1500);
          const s = await call(st, ip, 'poll', 'GET', `/api/c/submissions/${r.submissionId}`, token);
          if (s && (s.status === 'DONE' || s.status === 'ERROR')) {
            (st.lat.judge_end_to_end = st.lat.judge_end_to_end || []).push(Date.now() - t0);
            break;
          }
        }
      }
      nextSubmit = Date.now() + (rush ? rnd(10000, 20000) : rnd(45000, 90000));
    }
    await sleep(rnd(3000, 8000));
  }
}

function report(n, st, secs) {
  const apiLat = Object.entries(st.lat)
    .filter(([k]) => k !== 'judge_end_to_end')
    .flatMap(([, v]) => v);
  const p95 = pct(apiLat, 95);
  const errRate = st.calls ? (100 * st.errors) / st.calls : 0;
  const pass = p95 <= SLO_P95 && errRate <= SLO_ERR;

  console.log(`\n=== ${n} candidates, ${MINUTES} min${ENDRUSH ? ' + end rush' : ''}${IPS ? `, ${IPS} IPs` : ', 1 IP'} ===`);
  console.log('endpoint             count     p50     p95     p99   max (ms)');
  for (const [name, arr] of Object.entries(st.lat)) {
    console.log(
      `${name.padEnd(20)} ${String(arr.length).padStart(6)} ${String(pct(arr, 50)).padStart(7)} ${String(pct(arr, 95)).padStart(7)} ${String(pct(arr, 99)).padStart(7)} ${String(Math.max(...arr)).padStart(6)}`
    );
  }
  console.log(`throughput: ${(st.calls / secs).toFixed(1)} req/s, peak in-flight: ${st.peakInflight}`);
  console.log(`errors: ${st.errors}/${st.calls} (${errRate.toFixed(2)}%)`, st.errorCodes);
  console.log(`SLO (p95<=${SLO_P95}ms, err<=${SLO_ERR}%): API p95=${p95}ms -> ${pass ? 'PASS' : 'FAIL'}`);
  if (Object.keys(st.errorCodes).some((k) => k.includes('RATE_LIMITED')) && !IPS)
    console.log('hint: RATE_LIMITED from one IP. Raise API_RATE_PER_IP_PER_MIN or rerun with --ips 50.');
  return {
    users: n,
    minutes: MINUTES,
    endrush: ENDRUSH,
    ips: IPS || 1,
    p95,
    errRate,
    pass,
    throughput: st.calls / secs,
    peakInflight: st.peakInflight,
    errorCodes: st.errorCodes,
    endpoints: Object.fromEntries(
      Object.entries(st.lat).map(([k, v]) => [k, { count: v.length, p50: pct(v, 50), p95: pct(v, 95), p99: pct(v, 99), max: Math.max(...v) }])
    ),
  };
}

(async () => {
  const results = [];
  let ok = true;
  for (const n of STAGES) {
    console.log(`\nPreparing ${n} users on contest "${SLUG}"...`);
    const { contestId, users } = await prepare(n);
    console.log(`Running ${n} candidates for ${MINUTES} min against ${BASE} (ramp ${RAMP_MS / 1000}s)...`);
    const st = newStats();
    const startAt = Date.now();
    const until = startAt + MINUTES * 60_000;
    await Promise.all(users.map((u, i) => candidate(st, u, i, contestId, startAt, until)));
    const r = report(n, st, (Date.now() - startAt) / 1000);
    results.push(r);
    if (!r.pass) {
      ok = false;
      console.log(`\nStopping: ${n} candidates broke the SLO. Last passing stage is your safe capacity on this box.`);
      break;
    }
    if (STAGES.length > 1) await sleep(20_000); // let the judge queue drain between stages
  }
  fs.writeFileSync(OUT, JSON.stringify({ base: BASE, contest: SLUG, at: new Date().toISOString(), results }, null, 2));
  console.log(`\nSaved ${OUT}`);
  const safe = results.filter((r) => r.pass).pop();
  console.log(safe ? `Safe capacity: ${safe.users} candidates.` : 'No stage passed. Check errors above.');
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
