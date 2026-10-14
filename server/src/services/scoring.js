// MCQ scoring, coding best-score updates and the admin leaderboard.
const Attempt = require('../models/Attempt');
const Mcq = require('../models/Mcq');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const User = require('../models/User');

const round2 = (n) => Math.round(n * 100) / 100;

function mcqScore(attempt, mcqs, contest) {
  let score = 0;
  let correct = 0;
  let wrong = 0;
  const answers = attempt.mcqAnswers || {};
  for (const q of mcqs) {
    const ans = answers[String(q._id)];
    if (ans === undefined || ans === null) continue;
    const marks = q.marks ?? contest.mcq.marks;
    if (Number(ans) === q.correctIndex) {
      score += marks;
      correct += 1;
    } else {
      score -= contest.mcq.negative || 0;
      wrong += 1;
    }
  }
  return { score: round2(score), correct, wrong, attempted: correct + wrong };
}

/** Score = problem.points * (passed weight / total weight). */
function codingScoreFromTests(problem, results) {
  const totalWeight = problem.tests.reduce((s, t) => s + (t.weight ?? 1), 0) || 1;
  let passedWeight = 0;
  results.forEach((r, i) => {
    if (r.verdict === 'AC') passedWeight += problem.tests[i]?.weight ?? 1;
  });
  return round2((problem.points * passedWeight) / totalWeight);
}

/** Keep only the best score per problem. Atomic: safe with several workers. */
async function recordBestScore(submission, score, maxScore) {
  const key = `coding.${submission.problemId}`;
  const update = {
    $set: { [key]: { score, max: maxScore, submissionId: submission._id, at: submission.createdAt } },
  };
  if (score > 0) update.$set.lastImprovementAt = submission.createdAt;
  await Attempt.updateOne(
    { _id: submission.attemptId, $or: [{ [key]: { $exists: false } }, { [`${key}.score`]: { $lt: score } }] },
    update
  );
}

async function leaderboard(contest) {
  const [mcqs, problems, attempts] = await Promise.all([
    Mcq.find({ contestId: contest._id }).select('correctIndex marks').lean(),
    Problem.find({ contestId: contest._id }).select('title points order').sort({ order: 1, _id: 1 }).lean(),
    Attempt.find({ contestId: contest._id, status: { $ne: 'NOT_STARTED' } }).lean(),
  ]);
  const users = await User.find({ _id: { $in: attempts.map((a) => a.userId) } })
    .select('name email phone meta')
    .lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));

  // Wrong submissions before the best one (for the optional time penalty).
  const penaltyMin = contest.coding?.wrongSubmissionPenaltyMin || 0;
  const wrongBefore = new Map(); // attemptId -> count
  if (penaltyMin > 0) {
    const subs = await Submission.find({ contestId: contest._id, kind: 'SUBMIT', status: 'DONE', verdict: { $ne: 'AC' } })
      .select('attemptId problemId createdAt')
      .lean();
    const bestAt = new Map();
    for (const a of attempts) {
      for (const [pid, best] of Object.entries(a.coding || {})) {
        if (best?.score > 0) bestAt.set(`${a._id}:${pid}`, new Date(best.at).getTime());
      }
    }
    for (const s of subs) {
      const at = bestAt.get(`${s.attemptId}:${s.problemId}`);
      if (at && new Date(s.createdAt).getTime() < at) {
        const k = String(s.attemptId);
        wrongBefore.set(k, (wrongBefore.get(k) || 0) + 1);
      }
    }
  }

  const rows = attempts.map((a) => {
    const m = mcqScore(a, mcqs, contest);
    const perProblem = problems.map((p) => a.coding?.[String(p._id)]?.score ?? null);
    const codingTotal = round2(perProblem.reduce((s, v) => s + (v || 0), 0));
    const started = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const endRef = a.lastImprovementAt || a.submittedAt || a.deadlineAt || a.startedAt;
    const wrong = wrongBefore.get(String(a._id)) || 0;
    const timeMs = Math.max(0, new Date(endRef).getTime() - started) + wrong * penaltyMin * 60_000;
    const u = userById.get(String(a.userId)) || {};
    return {
      attemptId: a._id,
      userId: a.userId,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: a.status,
      mcq: m.score,
      mcqCorrect: m.correct,
      mcqWrong: m.wrong,
      coding: codingTotal,
      perProblem,
      total: round2(m.score + codingTotal),
      timeMs,
      wrongSubmissions: wrong,
      violations: a.violations,
      seb: a.browser?.seb || false,
    };
  });

  rows.sort((x, y) => y.total - x.total || y.coding - x.coding || x.timeMs - y.timeMs);
  let rank = 0;
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.total !== r.total || prev.coding !== r.coding || prev.timeMs !== r.timeMs) rank = i + 1;
    r.rank = rank;
  });

  return {
    problems: problems.map((p) => ({ _id: p._id, title: p.title, points: p.points })),
    maxMcq: round2(mcqs.reduce((s, q) => s + (q.marks ?? contest.mcq.marks), 0)),
    rows,
  };
}

module.exports = { mcqScore, codingScoreFromTests, recordBestScore, leaderboard, round2 };
