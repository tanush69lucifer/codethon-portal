// Judge worker process: `npm run worker`.
// Pulls QUEUED submissions from MongoDB (atomic claim, so you can run several
// worker processes on several machines), judges them, writes results back.
const os = require('os');
const config = require('./config');
const { connectDB, mongoose } = require('./db');
const Submission = require('./models/Submission');
const Problem = require('./models/Problem');
const { judgeSubmission } = require('./judge/judge');
const { recordBestScore } = require('./services/scoring');

const workerId = `${os.hostname()}:${process.pid}`;
const slots = Math.max(1, config.judge.concurrency);
let active = 0;
let stopping = false;

const problemCache = new Map(); // id -> { doc, exp }
async function getProblem(id) {
  const key = String(id);
  const hit = problemCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.doc;
  const doc = await Problem.findById(id).lean();
  problemCache.set(key, { doc, exp: Date.now() + 30_000 });
  return doc;
}

// Two lanes: SUBMIT jobs are claimed ahead of RUN jobs, so sample runs cannot delay scored
// submissions. Every `runEvery`-th claim is plain FIFO, which guarantees RUN jobs still move
// when SUBMIT traffic is continuous. JUDGE_RUN_EVERY=1 restores the old pure-FIFO behaviour.
let claims = 0;
async function claimWhere(filter) {
  const now = new Date();
  const sub = await Submission.findOneAndUpdate(
    { status: 'QUEUED', ...filter },
    { $set: { status: 'RUNNING', startedAt: now, workerId } },
    { sort: { createdAt: 1 }, new: true }
  ).lean();
  if (sub) {
    const queueWaitMs = Math.max(0, now.getTime() - new Date(sub.createdAt).getTime());
    Submission.updateOne({ _id: sub._id }, { $set: { queueWaitMs } }).catch(() => {});
  }
  return sub;
}

async function claim() {
  claims += 1;
  const runEvery = Math.max(1, config.judge.runEvery);
  if (claims % runEvery === 0) return claimWhere({});
  return (await claimWhere({ kind: 'SUBMIT' })) || claimWhere({});
}

async function processOne(sub) {
  const t0 = Date.now();
  try {
    const problem = await getProblem(sub.problemId);
    if (!problem) throw new Error('Problem not found');
    const result = await judgeSubmission(sub, problem);
    await Submission.updateOne({ _id: sub._id }, { $set: { ...result, status: 'DONE', finishedAt: new Date() } });
    if (sub.kind === 'SUBMIT') await recordBestScore(sub, result.score, result.maxScore);
    console.log(`[worker] ${sub.kind} ${sub._id} -> ${result.verdict} ${result.score}/${result.maxScore} in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error(`[worker] ${sub._id} failed:`, err.message);
    await Submission.updateOne(
      { _id: sub._id },
      { $set: { status: 'ERROR', verdict: 'IE', compileOutput: 'Internal judge error. Please submit again.', finishedAt: new Date() } }
    );
  }
}

async function loop() {
  let idleDelay = 200;
  while (!stopping) {
    if (active >= slots) {
      await new Promise((r) => setTimeout(r, 50));
      continue;
    }
    let sub = null;
    try {
      sub = await claim();
    } catch (err) {
      console.error('[worker] claim failed:', err.message);
    }
    if (!sub) {
      await new Promise((r) => setTimeout(r, idleDelay));
      idleDelay = Math.min(idleDelay * 1.5, 1000);
      continue;
    }
    idleDelay = 200;
    active += 1;
    processOne(sub).finally(() => {
      active -= 1;
    });
  }
}

// Re-queue jobs whose worker died mid-run.
async function requeueStale() {
  const cutoff = new Date(Date.now() - config.judge.staleRunningMs);
  const res = await Submission.updateMany({ status: 'RUNNING', startedAt: { $lt: cutoff } }, { $set: { status: 'QUEUED' } });
  if (res.modifiedCount) console.warn(`[worker] re-queued ${res.modifiedCount} stale job(s)`);
}

async function main() {
  if (config.judge.mode === 'local') {
    console.warn('[worker] JUDGE_MODE=local: candidate code runs WITHOUT a sandbox. Never use this in a real contest.');
  }
  await connectDB();
  console.log(`[worker] ${workerId} started, mode=${config.judge.mode}, slots=${slots}`);
  await requeueStale();
  setInterval(() => requeueStale().catch(() => {}), 60_000).unref();
  loop();

  const shutdown = async () => {
    stopping = true;
    const until = Date.now() + 30_000;
    while (active > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
