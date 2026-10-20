// Candidate API. Mounted at /api/c. Every route needs a CANDIDATE token.
const router = require('express').Router();
const { z } = require('zod');
const config = require('../config');
const Contest = require('../models/Contest');
const Attempt = require('../models/Attempt');
const Mcq = require('../models/Mcq');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const ProctorEvent = require('../models/ProctorEvent');
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkSeb } = require('../middleware/seb');
const { ApiError, asyncHandler, send, validate, requireObjectId, isObjectId } = require('../utils/http');
const { shuffled, range } = require('../services/shuffle');

router.use(requireAuth, requireRole('CANDIDATE'));

const PUBLIC_CONTEST_FIELDS = 'title slug category instructions startAt endAt durationMin mcq coding proctoring.browserPolicy proctoring.requireFullscreen proctoring.blockPaste proctoring.lockAfterViolations sebConfigFileName published';

// ---------- helpers ----------

const contestCache = new Map(); // id -> { doc, exp }
async function loadContest(contestId) {
  const key = String(contestId);
  const hit = contestCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.doc;
  const contest = await Contest.findById(contestId).lean();
  if (!contest || !contest.published) throw new ApiError(404, 'NOT_FOUND', 'Contest not found');
  contestCache.set(key, { doc: contest, exp: Date.now() + 5000 });
  if (contestCache.size > 200) contestCache.clear();
  return contest;
}

async function loadAttempt(contestId, userId) {
  const attempt = await Attempt.findOne({ contestId, userId }).lean();
  if (!attempt) throw new ApiError(403, 'NOT_REGISTERED', 'You are not registered for this contest');
  return attempt;
}

/** Ends an attempt whose time is over (lazy auto-submit). Returns the fresh attempt. */
async function closeIfExpired(attempt) {
  if (attempt.status !== 'IN_PROGRESS') return attempt;
  const graceMs = config.limits.submitGraceSec * 1000;
  if (Date.now() > new Date(attempt.deadlineAt).getTime() + graceMs) {
    await Attempt.updateOne(
      { _id: attempt._id, status: 'IN_PROGRESS' },
      { $set: { status: 'SUBMITTED', submittedAt: attempt.deadlineAt } }
    );
    return { ...attempt, status: 'SUBMITTED', submittedAt: attempt.deadlineAt };
  }
  return attempt;
}

function enforceBrowser(req, contest) {
  const policy = contest.proctoring?.browserPolicy || 'ANY';
  const seb = checkSeb(req, contest);
  if (policy === 'SEB_REQUIRED' && !seb.verified) {
    // Without configured keys we fall back to the SEB user agent so a forgotten key doesn't kill the event.
    const keysConfigured = (contest.proctoring.sebConfigKeys || []).length > 0;
    if (keysConfigured || !seb.seb) {
      throw new ApiError(403, 'SEB_REQUIRED', 'This contest must be opened in Safe Exam Browser using the official config file.', {
        reason: seb.reason,
      });
    }
  }
  return seb;
}

/** Contest + attempt that must be IN_PROGRESS and within time. Used by every exam action. */
async function activeContext(req) {
  const { contestId } = req.params;
  const contest = await loadContest(contestId);
  let attempt = await loadAttempt(contestId, req.user.id);
  attempt = await closeIfExpired(attempt);
  if (attempt.status === 'LOCKED') {
    throw new ApiError(423, 'LOCKED', attempt.lockedReason || 'Your attempt is locked. Contact the organiser.');
  }
  if (attempt.status === 'SUBMITTED') throw new ApiError(409, 'ALREADY_SUBMITTED', 'Your test is already submitted');
  if (attempt.status !== 'IN_PROGRESS') throw new ApiError(409, 'NOT_STARTED', 'Start the test first');
  enforceBrowser(req, contest);
  return { contest, attempt };
}

// Per-user run rate limit (in memory; one API process is plenty for 500 candidates).
const runHits = new Map(); // userId -> [timestamps]
function allowRun(userId, perMinute) {
  const now = Date.now();
  const hits = (runHits.get(userId) || []).filter((t) => now - t < 60_000);
  if (hits.length >= perMinute) return false;
  hits.push(now);
  runHits.set(userId, hits);
  if (runHits.size > 5000) runHits.clear();
  return true;
}

async function judgeBusy() {
  const queued = await Submission.countDocuments({ status: 'QUEUED' });
  return queued > 400;
}

// ---------- routes ----------

// My contests (dashboard).
router.get(
  '/contests',
  asyncHandler(async (req, res) => {
    const attempts = await Attempt.find({ userId: req.user.id }).select('contestId status startedAt deadlineAt submittedAt').lean();
    const contests = await Contest.find({ _id: { $in: attempts.map((a) => a.contestId) }, published: true })
      .select('title slug category startAt endAt durationMin proctoring.browserPolicy')
      .lean();
    const byId = new Map(contests.map((c) => [String(c._id), c]));
    const items = attempts
      .filter((a) => byId.has(String(a.contestId)))
      .map((a) => ({ contest: byId.get(String(a.contestId)), attempt: a }))
      .sort((x, y) => new Date(x.contest.startAt) - new Date(y.contest.startAt));
    send(res, { items, serverNow: Date.now() });
  })
);

// Lobby: rules + whether this browser is allowed.
router.get(
  '/contests/:contestId',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const contest = await Contest.findById(req.params.contestId).select(PUBLIC_CONTEST_FIELDS).lean();
    if (!contest || !contest.published) throw new ApiError(404, 'NOT_FOUND', 'Contest not found');
    const full = await Contest.findById(req.params.contestId).select('proctoring').lean();
    let attempt = await loadAttempt(contest._id, req.user.id);
    attempt = await closeIfExpired(attempt);
    const seb = checkSeb(req, full);
    const [mcqCount, problemCount] = await Promise.all([
      Mcq.countDocuments({ contestId: contest._id }),
      Problem.countDocuments({ contestId: contest._id }),
    ]);
    send(res, {
      contest,
      counts: { mcq: mcqCount, problems: problemCount },
      attempt: {
        status: attempt.status,
        startedAt: attempt.startedAt,
        deadlineAt: attempt.deadlineAt,
        submittedAt: attempt.submittedAt,
        lockedReason: attempt.lockedReason,
      },
      browser: { seb: seb.seb, verified: seb.verified, reason: seb.reason },
      sebConfigUrl: contest.sebConfigFileName ? `/api/public/seb/${contest.slug}.seb` : null,
      serverNow: Date.now(),
    });
  })
);

const startSchema = z.object({
  screen: z
    .object({ w: z.number().int().min(0).max(20000), h: z.number().int().min(0).max(20000), extended: z.boolean().optional() })
    .partial()
    .optional(),
});

router.post(
  '/contests/:contestId/start',
  requireObjectId('contestId'),
  validate(startSchema),
  asyncHandler(async (req, res) => {
    const contest = await loadContest(req.params.contestId);
    let attempt = await loadAttempt(contest._id, req.user.id);
    attempt = await closeIfExpired(attempt);
    const now = Date.now();

    if (attempt.status === 'SUBMITTED') throw new ApiError(409, 'ALREADY_SUBMITTED', 'Your test is already submitted');
    if (attempt.status === 'LOCKED') throw new ApiError(423, 'LOCKED', attempt.lockedReason || 'Attempt locked');
    const seb = enforceBrowser(req, contest);

    if (attempt.status === 'NOT_STARTED') {
      if (now < new Date(contest.startAt).getTime()) throw new ApiError(409, 'NOT_OPEN', 'The contest has not started yet');
      if (now > new Date(contest.endAt).getTime()) throw new ApiError(409, 'CLOSED', 'The contest window is over');

      const mcqs = await Mcq.find({ contestId: contest._id }).select('options order').sort({ order: 1, _id: 1 }).lean();
      const order = contest.mcq.shuffleQuestions ? shuffled(mcqs) : mcqs;
      const optionOrders = {};
      for (const q of mcqs) {
        const idx = range(q.options.length);
        optionOrders[String(q._id)] = contest.mcq.shuffleOptions ? shuffled(idx) : idx;
      }
      const deadline = Math.min(now + contest.durationMin * 60_000, new Date(contest.endAt).getTime());
      // Conditional update: two tabs pressing Start at once still produce one attempt start.
      await Attempt.updateOne(
        { _id: attempt._id, status: 'NOT_STARTED' },
        {
          $set: {
            status: 'IN_PROGRESS',
            startedAt: new Date(now),
            deadlineAt: new Date(deadline),
            mcqOrder: order.map((q) => q._id),
            optionOrders,
            lastSeenAt: new Date(now),
            browser: {
              seb: seb.verified || seb.seb,
              userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
              ip: req.ip,
              screen: req.body.screen || {},
            },
          },
        }
      );
    }
    attempt = await Attempt.findById(attempt._id).select('status startedAt deadlineAt').lean();
    send(res, { attempt, serverNow: Date.now() });
  })
);

// Full question paper for an in-progress attempt (no answers, no hidden tests).
router.get(
  '/contests/:contestId/paper',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const { contest, attempt } = await activeContext(req);
    const [mcqs, problems] = await Promise.all([
      Mcq.find({ contestId: contest._id }).select('text options marks').lean(),
      Problem.find({ contestId: contest._id })
        .select('title statement inputFormat outputFormat constraints points timeLimitMs memoryMb starterCode samples order')
        .sort({ order: 1, _id: 1 })
        .lean(),
    ]);
    const mcqById = new Map(mcqs.map((q) => [String(q._id), q]));
    // Questions added after the candidate started are appended at the end.
    const orderIds = [...attempt.mcqOrder.map(String), ...mcqs.map((q) => String(q._id)).filter((id) => !attempt.mcqOrder.map(String).includes(id))];
    const paperMcqs = orderIds
      .map((id) => mcqById.get(id))
      .filter(Boolean)
      .map((q) => {
        const optOrder = attempt.optionOrders?.[String(q._id)] || range(q.options.length);
        return {
          _id: q._id,
          text: q.text,
          marks: q.marks ?? contest.mcq.marks,
          options: optOrder.filter((i) => i < q.options.length).map((i) => ({ id: i, text: q.options[i] })),
        };
      });

    send(res, {
      contest: {
        _id: contest._id,
        title: contest.title,
        mcq: { negative: contest.mcq.negative },
        coding: contest.coding,
        proctoring: {
          browserPolicy: contest.proctoring.browserPolicy,
          requireFullscreen: contest.proctoring.requireFullscreen,
          blockPaste: contest.proctoring.blockPaste,
          lockAfterViolations: contest.proctoring.lockAfterViolations,
        },
      },
      attempt: {
        _id: attempt._id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        deadlineAt: attempt.deadlineAt,
        violations: attempt.violations,
        mcqAnswers: attempt.mcqAnswers || {},
        codeDrafts: attempt.codeDrafts || {},
        coding: Object.fromEntries(
          Object.entries(attempt.coding || {}).map(([pid, v]) => [pid, { score: v.score, max: v.max }])
        ),
      },
      mcqs: paperMcqs,
      problems,
      serverNow: Date.now(),
    });
  })
);

router.put(
  '/contests/:contestId/mcq/:mcqId',
  requireObjectId('contestId', 'mcqId'),
  validate(z.object({ choice: z.number().int().min(0).max(9).nullable() })),
  asyncHandler(async (req, res) => {
    const { contest, attempt } = await activeContext(req);
    const q = await Mcq.findOne({ _id: req.params.mcqId, contestId: contest._id }).select('options').lean();
    if (!q) throw new ApiError(404, 'NOT_FOUND', 'Question not found');
    const { choice } = req.body;
    if (choice !== null && choice >= q.options.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid option');
    const key = `mcqAnswers.${q._id}`;
    await Attempt.updateOne(
      { _id: attempt._id, status: 'IN_PROGRESS' },
      choice === null ? { $unset: { [key]: '' } } : { $set: { [key]: choice } }
    );
    send(res, { saved: true });
  })
);

router.put(
  '/contests/:contestId/drafts/:problemId',
  requireObjectId('contestId', 'problemId'),
  validate(z.object({ code: z.string().max(config.limits.maxCodeBytes) })),
  asyncHandler(async (req, res) => {
    const { attempt } = await activeContext(req);
    await Attempt.updateOne(
      { _id: attempt._id, status: 'IN_PROGRESS' },
      { $set: { [`codeDrafts.${req.params.problemId}`]: req.body.code } }
    );
    send(res, { saved: true });
  })
);

const runSchema = z.object({
  code: z.string().min(1).max(config.limits.maxCodeBytes),
  input: z.string().max(config.limits.maxCustomInputBytes).nullable().optional(),
});

router.post(
  '/contests/:contestId/problems/:problemId/run',
  requireObjectId('contestId', 'problemId'),
  validate(runSchema),
  asyncHandler(async (req, res) => {
    const { contest, attempt } = await activeContext(req);
    const problem = await Problem.findOne({ _id: req.params.problemId, contestId: contest._id }).select('_id').lean();
    if (!problem) throw new ApiError(404, 'NOT_FOUND', 'Problem not found');
    if (!allowRun(req.user.id, contest.coding.maxRunsPerMinute)) {
      throw new ApiError(429, 'RATE_LIMITED', `Max ${contest.coding.maxRunsPerMinute} runs per minute. Wait a bit.`);
    }
    if (await judgeBusy()) throw new ApiError(503, 'JUDGE_BUSY', 'Judge is busy. Try Run again in a few seconds.');
    const sub = await Submission.create({
      kind: 'RUN',
      contestId: contest._id,
      problemId: problem._id,
      attemptId: attempt._id,
      userId: req.user.id,
      code: req.body.code,
      customInput: req.body.input ?? null,
    });
    await Attempt.updateOne({ _id: attempt._id }, { $set: { [`codeDrafts.${problem._id}`]: req.body.code } });
    send(res, { submissionId: sub._id }, 202);
  })
);

router.post(
  '/contests/:contestId/problems/:problemId/submit',
  requireObjectId('contestId', 'problemId'),
  validate(z.object({ code: z.string().min(1).max(config.limits.maxCodeBytes) })),
  asyncHandler(async (req, res) => {
    const { contest, attempt } = await activeContext(req);
    const problem = await Problem.findOne({ _id: req.params.problemId, contestId: contest._id }).select('_id').lean();
    if (!problem) throw new ApiError(404, 'NOT_FOUND', 'Problem not found');

    const last = await Submission.findOne({ attemptId: attempt._id, problemId: problem._id, kind: 'SUBMIT' })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean();
    const cooldown = contest.coding.submitCooldownSec * 1000;
    if (last && Date.now() - new Date(last.createdAt).getTime() < cooldown) {
      const wait = Math.ceil((cooldown - (Date.now() - new Date(last.createdAt).getTime())) / 1000);
      throw new ApiError(429, 'COOLDOWN', `Wait ${wait}s before submitting this problem again`);
    }
    const count = await Submission.countDocuments({ attemptId: attempt._id, problemId: problem._id, kind: 'SUBMIT' });
    if (count >= contest.coding.maxSubmissionsPerProblem) {
      throw new ApiError(429, 'LIMIT', 'Submission limit reached for this problem');
    }
    const sub = await Submission.create({
      kind: 'SUBMIT',
      contestId: contest._id,
      problemId: problem._id,
      attemptId: attempt._id,
      userId: req.user.id,
      code: req.body.code,
    });
    await Attempt.updateOne({ _id: attempt._id }, { $set: { [`codeDrafts.${problem._id}`]: req.body.code } });
    send(res, { submissionId: sub._id }, 202);
  })
);

router.get(
  '/contests/:contestId/problems/:problemId/submissions',
  requireObjectId('contestId', 'problemId'),
  asyncHandler(async (req, res) => {
    const attempt = await loadAttempt(req.params.contestId, req.user.id);
    const items = await Submission.find({ attemptId: attempt._id, problemId: req.params.problemId, kind: 'SUBMIT' })
      .select('status verdict score maxScore passed total createdAt')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    send(res, { items });
  })
);

const queuePosCache = new Map(); // subId -> { pos, exp }

router.get(
  '/submissions/:submissionId',
  requireObjectId('submissionId'),
  asyncHandler(async (req, res) => {
    const sub = await Submission.findOne({ _id: req.params.submissionId, userId: req.user.id })
      .select('-code -userId -workerId')
      .lean();
    if (!sub) throw new ApiError(404, 'NOT_FOUND', 'Submission not found');
    let queuePosition = null;
    if (sub.status === 'QUEUED') {
      const qKey = String(sub._id);
      const cached = queuePosCache.get(qKey);
      if (cached && cached.exp > Date.now()) {
        queuePosition = cached.pos;
      } else {
        queuePosition = (await Submission.countDocuments({ status: 'QUEUED', createdAt: { $lt: sub.createdAt } })) + 1;
        queuePosCache.set(qKey, { pos: queuePosition, exp: Date.now() + 1500 });
        if (queuePosCache.size > 2000) queuePosCache.clear();
      }
    }
    send(res, { ...sub, queuePosition });
  })
);

// ---------- proctoring events + heartbeat ----------

const EVENT_CODES = {
  // code: [severity, counts towards auto-lock]
  TAB_HIDDEN: ['MED', true],
  WINDOW_BLUR: ['LOW', false],
  FULLSCREEN_EXIT: ['HIGH', true],
  PASTE_BLOCKED: ['LOW', false],
  COPY_BLOCKED: ['LOW', false],
  CONTEXT_MENU: ['LOW', false],
  SHORTCUT_BLOCKED: ['LOW', false],
  DEVTOOLS_SUSPECTED: ['MED', false],
  MULTI_SCREEN: ['HIGH', true],
  EXTENSION_IFRAME: ['HIGH', true],
  KNOWN_FINGERPRINT: ['HIGH', true],
  OVERLAY_NODE: ['MED', true],
  FOREIGN_SHADOW_ROOT: ['MED', false],
  DOM_INJECTION: ['LOW', false],
  NOT_SEB: ['MED', false],
  NETWORK_OFFLINE: ['LOW', false],
  PAGE_RELOAD: ['LOW', false],
};

const recentCounted = new Map(); // `${attemptId}:${code}` -> ts (one count per code per 5s)

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out = {};
  for (const [k, v] of Object.entries(meta).slice(0, 8)) {
    if (typeof v === 'number' || typeof v === 'boolean') out[k.slice(0, 30)] = v;
    else if (typeof v === 'string') out[k.slice(0, 30)] = v.slice(0, 120);
  }
  return out;
}

const eventsSchema = z.object({
  focused: z.boolean().optional(),
  events: z
    .array(z.object({ code: z.string().max(40), t: z.number().optional(), meta: z.any().optional() }))
    .max(50)
    .default([]),
});

router.post(
  '/contests/:contestId/events',
  requireObjectId('contestId'),
  validate(eventsSchema),
  asyncHandler(async (req, res) => {
    const contest = await loadContest(req.params.contestId);
    let attempt = await loadAttempt(contest._id, req.user.id);
    attempt = await closeIfExpired(attempt);
    if (attempt.status !== 'IN_PROGRESS') {
      return send(res, { status: attempt.status, violations: attempt.violations, lockedReason: attempt.lockedReason });
    }
    const now = Date.now();
    const docs = [];
    let counted = 0;
    for (const ev of req.body.events) {
      const def = EVENT_CODES[ev.code];
      if (!def) continue;
      const t = Number.isFinite(ev.t) && Math.abs(now - ev.t) < 10 * 60_000 ? ev.t : now;
      let isCounted = false;
      if (def[1]) {
        const k = `${attempt._id}:${ev.code}`;
        if (!recentCounted.has(k) || now - recentCounted.get(k) > 5000) {
          recentCounted.set(k, now);
          isCounted = true;
          counted += 1;
        }
      }
      docs.push({
        contestId: contest._id,
        attemptId: attempt._id,
        userId: attempt.userId,
        code: ev.code,
        severity: def[0],
        counted: isCounted,
        at: new Date(t),
        meta: sanitizeMeta(ev.meta),
      });
    }
    if (recentCounted.size > 20000) recentCounted.clear();
    if (docs.length) await ProctorEvent.insertMany(docs, { ordered: false });

    const update = { $set: { lastSeenAt: new Date(now) }, $inc: { eventCount: docs.length, violations: counted } };
    if (typeof req.body.focused === 'boolean') update.$set.focused = req.body.focused;
    const fresh = await Attempt.findOneAndUpdate({ _id: attempt._id, status: 'IN_PROGRESS' }, update, { new: true }).lean();
    if (!fresh) return send(res, { status: 'SUBMITTED' });

    const lockAt = contest.proctoring.lockAfterViolations;
    if (lockAt > 0 && fresh.violations >= lockAt) {
      const reason = `Locked after ${fresh.violations} integrity violations. Contact the organiser to continue.`;
      await Attempt.updateOne({ _id: attempt._id, status: 'IN_PROGRESS' }, { $set: { status: 'LOCKED', lockedReason: reason } });
      return send(res, { status: 'LOCKED', violations: fresh.violations, lockedReason: reason, serverNow: now });
    }
    send(res, { status: fresh.status, violations: fresh.violations, deadlineAt: fresh.deadlineAt, serverNow: now });
  })
);

router.post(
  '/contests/:contestId/finish',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const contest = await loadContest(req.params.contestId);
    const attempt = await loadAttempt(contest._id, req.user.id);
    if (attempt.status === 'IN_PROGRESS') {
      const end = Math.min(Date.now(), new Date(attempt.deadlineAt).getTime());
      await Attempt.updateOne({ _id: attempt._id, status: 'IN_PROGRESS' }, { $set: { status: 'SUBMITTED', submittedAt: new Date(end) } });
    }
    send(res, { status: attempt.status === 'LOCKED' ? 'LOCKED' : 'SUBMITTED' });
  })
);

module.exports = router;
module.exports._internal = { EVENT_CODES, isObjectId };
