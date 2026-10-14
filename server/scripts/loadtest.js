// Load test: simulates N candidates taking a contest at the same time.
// Run against a STAGING copy (it creates users lt1..ltN@load.test and enrols them).
//
//   node scripts/loadtest.js --url https://contest.example.com --contest <slug> --users 300 --minutes 3
//
// Each virtual candidate: logs in, starts, answers MCQs (one every ~3-8s), sends heartbeats,
// and submits Java code to a random problem roughly every 45-90s. Prints latency percentiles.
const { connectDB, mongoose } = require('../src/db');
const Contest = require('../src/models/Contest');
const User = require('../src/models/User');
const Attempt = require('../src/models/Attempt');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => (cur.startsWith('--') ? [...acc, [cur.slice(2), arr[i + 1]]] : acc), [])
);
const BASE = (args.url || 'http://localhost:5000').replace(/\/$/, '');
const USERS = Number(args.users || 100);
const MINUTES = Number(args.minutes || 2);
const SLUG = args.contest || 'demo-senior';

const CODE = `import java.util.*;
public class Main { public static void main(String[] a) { Scanner s = new Scanner(System.in);
  int n = s.nextInt(); long t = 0; for (int i = 0; i < n; i++) { long x = s.nextLong(); if (x % 2 == 0) t += x; }
  System.out.println(t); } }`;

const lat = {};
let errors = 0;
const errorCodes = {};
const record = (name, ms) => (lat[name] = lat[name] || []).push(ms);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

async function call(name, method, path, token, body) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    record(name, Date.now() - t0);
    if (!res.ok) {
      errors += 1;
      const k = `${name}:${res.status}:${json?.error?.code}`;
      errorCodes[k] = (errorCodes[k] || 0) + 1;
    }
    return json.data;
  } catch {
    errors += 1;
    errorCodes[`${name}:NETWORK`] = (errorCodes[`${name}:NETWORK`] || 0) + 1;
    return null;
  }
}

async function prepare() {
  await connectDB();
  const contest = await Contest.findOne({ slug: SLUG });
  if (!contest) throw new Error(`Contest ${SLUG} not found`);
  const users = [];
  for (let i = 1; i <= USERS; i += 1) {
    const email = `lt${i}@load.test`;
    await User.updateOne(
      { email },
      { $set: { name: `Load ${i}`, role: 'CANDIDATE', accessCode: `LOAD${String(i).padStart(4, '0')}` } },
      { upsert: true }
    );
    const u = await User.findOne({ email }).select('_id');
    await Attempt.deleteOne({ contestId: contest._id, userId: u._id });
    await Attempt.create({ contestId: contest._id, userId: u._id });
    users.push({ email, code: `LOAD${String(i).padStart(4, '0')}` });
  }
  await mongoose.disconnect();
  return { contestId: String(contest._id), users };
}

async function candidate({ email, code }, contestId, until) {
  await sleep(rnd(0, 15000)); // ramp up over 15s
  const login = await call('login', 'POST', '/api/auth/login', null, { email, code });
  if (!login) return;
  const token = login.token;
  await call('start', 'POST', `/api/c/contests/${contestId}/start`, token, { screen: { w: 1366, h: 768 } });
  const paper = await call('paper', 'GET', `/api/c/contests/${contestId}/paper`, token);
  if (!paper) return;
  let qi = 0;
  let nextSubmit = Date.now() + rnd(20000, 60000);
  let nextBeat = Date.now() + 20000;
  while (Date.now() < until) {
    if (qi < paper.mcqs.length) {
      const q = paper.mcqs[qi];
      await call('mcq', 'PUT', `/api/c/contests/${contestId}/mcq/${q._id}`, token, { choice: q.options[0].id });
      qi += 1;
    }
    if (Date.now() > nextBeat) {
      await call('events', 'POST', `/api/c/contests/${contestId}/events`, token, { focused: true, events: [] });
      nextBeat = Date.now() + 20000;
    }
    if (Date.now() > nextSubmit && paper.problems.length) {
      const p = paper.problems[Math.floor(Math.random() * paper.problems.length)];
      const r = await call('submit', 'POST', `/api/c/contests/${contestId}/problems/${p._id}/submit`, token, { code: CODE });
      if (r?.submissionId) {
        const t0 = Date.now();
        for (let i = 0; i < 120 && Date.now() < until + 90_000; i += 1) {
          await sleep(1500);
          const s = await call('poll', 'GET', `/api/c/submissions/${r.submissionId}`, token);
          if (s && (s.status === 'DONE' || s.status === 'ERROR')) {
            record('judge_end_to_end', Date.now() - t0);
            break;
          }
        }
      }
      nextSubmit = Date.now() + rnd(45000, 90000);
    }
    await sleep(rnd(3000, 8000));
  }
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

(async () => {
  console.log(`Preparing ${USERS} users on contest "${SLUG}"...`);
  const { contestId, users } = await prepare();
  console.log(`Running for ${MINUTES} min against ${BASE}...`);
  const until = Date.now() + MINUTES * 60_000;
  await Promise.all(users.map((u) => candidate(u, contestId, until)));
  console.log('\nendpoint             count    p50     p95     p99   (ms)');
  for (const [name, arr] of Object.entries(lat)) {
    console.log(`${name.padEnd(20)} ${String(arr.length).padStart(5)} ${String(pct(arr, 50)).padStart(6)} ${String(pct(arr, 95)).padStart(7)} ${String(pct(arr, 99)).padStart(7)}`);
  }
  console.log(`\nerrors: ${errors}`, errorCodes);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
