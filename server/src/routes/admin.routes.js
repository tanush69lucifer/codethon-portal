// Admin API. Mounted at /api/admin. Every route needs an ADMIN token.
const router = require('express').Router();
const multer = require('multer');
const { z } = require('zod');
const { parse } = require('csv-parse/sync');
const Contest = require('../models/Contest');
const Mcq = require('../models/Mcq');
const Problem = require('../models/Problem');
const Attempt = require('../models/Attempt');
const Submission = require('../models/Submission');
const ProctorEvent = require('../models/ProctorEvent');
const User = require('../models/User');
const { requireAuth, requireRole, forgetNonce, newNonce } = require('../middleware/auth');
const { ApiError, asyncHandler, send, validate, requireObjectId } = require('../utils/http');
const { leaderboard, mcqScore } = require('../services/scoring');
const { findSimilar } = require('../services/plagiarism');
const { parseParticipants, importParticipants, newAccessCode, toCsv } = require('../services/participants');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth, requireRole('ADMIN'));

// ---------- schemas ----------

const contestBody = z.object({
  title: z.string().trim().min(2).max(140),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, 'lowercase letters, digits and dashes'),
  category: z.string().trim().max(60).optional(),
  instructions: z.string().max(8000).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  durationMin: z.number().int().min(5).max(600),
  published: z.boolean().optional(),
  mcq: z
    .object({
      marks: z.number().min(0).max(100),
      negative: z.number().min(0).max(100),
      shuffleQuestions: z.boolean(),
      shuffleOptions: z.boolean(),
    })
    .partial()
    .optional(),
  coding: z
    .object({
      maxRunsPerMinute: z.number().int().min(1).max(60),
      submitCooldownSec: z.number().int().min(0).max(600),
      maxSubmissionsPerProblem: z.number().int().min(1).max(500),
      wrongSubmissionPenaltyMin: z.number().min(0).max(60),
    })
    .partial()
    .optional(),
  proctoring: z
    .object({
      browserPolicy: z.enum(['SEB_REQUIRED', 'SEB_PREFERRED', 'ANY']),
      sebConfigKeys: z.array(z.string().trim().regex(/^[a-fA-F0-9]{64}$/, 'SEB Config Key is 64 hex characters')).max(5),
      requireFullscreen: z.boolean(),
      blockPaste: z.boolean(),
      lockAfterViolations: z.number().int().min(0).max(100),
    })
    .partial()
    .optional(),
});

const mcqBody = z.object({
  text: z.string().trim().min(1).max(4000),
  options: z.array(z.string().trim().min(1).max(1000)).min(2).max(6),
  correctIndex: z.number().int().min(0).max(5),
  marks: z.number().min(0).max(100).nullable().optional(),
  order: z.number().int().optional(),
  tag: z.string().max(40).optional(),
});

const ioPair = z.object({ input: z.string().max(5_000_000), output: z.string().max(5_000_000) });
const problemBody = z.object({
  title: z.string().trim().min(1).max(140),
  statement: z.string().max(20000).optional(),
  inputFormat: z.string().max(4000).optional(),
  outputFormat: z.string().max(4000).optional(),
  constraints: z.string().max(4000).optional(),
  points: z.number().min(0).max(1000).optional(),
  timeLimitMs: z.number().int().min(200).max(15000).optional(),
  memoryMb: z.number().int().min(32).max(1024).optional(),
  checker: z.enum(['tokens', 'exact', 'float']).optional(),
  starterCode: z.string().max(20000).optional(),
  order: z.number().int().optional(),
  samples: z.array(ioPair.extend({ explanation: z.string().max(4000).optional() })).max(10).optional(),
  tests: z.array(ioPair.extend({ weight: z.number().min(0).max(100).optional() })).max(100).optional(),
});

function checkWindow(body) {
  if (body.startAt && body.endAt && body.endAt <= body.startAt) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'End time must be after start time');
  }
}

async function getContest(id, select) {
  const c = await Contest.findById(id).select(select || '').lean();
  if (!c) throw new ApiError(404, 'NOT_FOUND', 'Contest not found');
  return c;
}

async function hasStarted(contestId) {
  return Attempt.exists({ contestId, status: { $ne: 'NOT_STARTED' } });
}

// ---------- contests ----------

router.get(
  '/contests',
  asyncHandler(async (req, res) => {
    const contests = await Contest.find().sort({ startAt: -1 }).lean();
    const ids = contests.map((c) => c._id);
    const [mcqs, problems, attempts] = await Promise.all([
      Mcq.aggregate([{ $match: { contestId: { $in: ids } } }, { $group: { _id: '$contestId', n: { $sum: 1 } } }]),
      Problem.aggregate([{ $match: { contestId: { $in: ids } } }, { $group: { _id: '$contestId', n: { $sum: 1 } } }]),
      Attempt.aggregate([{ $match: { contestId: { $in: ids } } }, { $group: { _id: { c: '$contestId', s: '$status' }, n: { $sum: 1 } } }]),
    ]);
    const count = (arr, id) => arr.find((x) => String(x._id) === String(id))?.n || 0;
    const items = contests.map((c) => {
      const byStatus = {};
      attempts.filter((a) => String(a._id.c) === String(c._id)).forEach((a) => (byStatus[a._id.s] = a.n));
      return { ...c, counts: { mcq: count(mcqs, c._id), problems: count(problems, c._id), ...byStatus } };
    });
    send(res, { items });
  })
);

router.post(
  '/contests',
  validate(contestBody),
  asyncHandler(async (req, res) => {
    checkWindow(req.body);
    const contest = await Contest.create(req.body);
    send(res, contest, 201);
  })
);

router.get(
  '/contests/:contestId',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => send(res, await getContest(req.params.contestId)))
);

router.patch(
  '/contests/:contestId',
  requireObjectId('contestId'),
  validate(contestBody.partial()),
  asyncHandler(async (req, res) => {
    const existing = await getContest(req.params.contestId);
    checkWindow({ startAt: req.body.startAt || existing.startAt, endAt: req.body.endAt || existing.endAt });
    const $set = {};
    for (const [k, v] of Object.entries(req.body)) {
      if (['mcq', 'coding', 'proctoring'].includes(k) && v) {
        for (const [k2, v2] of Object.entries(v)) $set[`${k}.${k2}`] = v2;
      } else $set[k] = v;
    }
    await Contest.updateOne({ _id: req.params.contestId }, { $set }, { runValidators: true });
    send(res, await Contest.findById(req.params.contestId).lean());
  })
);

router.delete(
  '/contests/:contestId',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    if (await hasStarted(req.params.contestId)) {
      throw new ApiError(409, 'CONFLICT', 'Candidates have already started this contest. Unpublish it instead.');
    }
    const id = req.params.contestId;
    await Promise.all([
      Mcq.deleteMany({ contestId: id }),
      Problem.deleteMany({ contestId: id }),
      Attempt.deleteMany({ contestId: id }),
      Contest.deleteOne({ _id: id }),
    ]);
    send(res, { deleted: true });
  })
);

// Whole contest as JSON (settings + MCQs with answers + problems with hidden tests). Keep it private.
router.get(
  '/contests/:contestId/export',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const c = await getContest(req.params.contestId, '-sebConfigFile');
    const strip = ({ _id, contestId, createdAt, updatedAt, __v, ...rest }) => rest; // eslint-disable-line no-unused-vars
    const [mcqs, problems] = await Promise.all([
      Mcq.find({ contestId: c._id }).sort({ order: 1, _id: 1 }).lean(),
      Problem.find({ contestId: c._id }).sort({ order: 1, _id: 1 }).lean(),
    ]);
    res.setHeader('Content-Disposition', `attachment; filename="${c.slug}.contest.json"`);
    res.json({ version: 1, contest: strip(c), mcqs: mcqs.map(strip), problems: problems.map(strip) });
  })
);

const importSchema = z.object({
  contest: contestBody,
  mcqs: z.array(mcqBody.extend({ correctIndex: z.number().int().min(0).max(5) })).max(200).default([]),
  problems: z.array(problemBody).max(20).default([]),
});

// Create (or replace, with ?replace=1 before anyone starts) a full contest from JSON.
router.post(
  '/contests/import',
  asyncHandler(async (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid contest JSON', parsed.error.flatten());
    const { contest: cBody, mcqs, problems } = parsed.data;
    checkWindow(cBody);
    mcqs.forEach((q, i) => {
      if (q.correctIndex >= q.options.length) throw new ApiError(400, 'VALIDATION_ERROR', `MCQ #${i + 1}: correctIndex out of range`);
    });

    let contest = await Contest.findOne({ slug: cBody.slug });
    if (contest) {
      if (req.query.replace !== '1') throw new ApiError(409, 'CONFLICT', `Slug "${cBody.slug}" exists. Use replace to overwrite.`);
      if (await hasStarted(contest._id)) throw new ApiError(409, 'CONFLICT', 'Cannot replace: candidates already started');
      contest.set(cBody);
      await contest.save();
      await Promise.all([Mcq.deleteMany({ contestId: contest._id }), Problem.deleteMany({ contestId: contest._id })]);
    } else {
      contest = await Contest.create(cBody);
    }
    await Mcq.insertMany(mcqs.map((q, i) => ({ ...q, order: q.order ?? i, contestId: contest._id })));
    await Problem.insertMany(problems.map((p, i) => ({ ...p, order: p.order ?? i, contestId: contest._id })));
    send(res, { contestId: contest._id, mcqs: mcqs.length, problems: problems.length }, 201);
  })
);

// Optional .seb file that candidates download (sebs:// link opens SEB directly).
router.post(
  '/contests/:contestId/seb-file',
  requireObjectId('contestId'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'VALIDATION_ERROR', 'Attach the .seb file');
    if (!/\.seb$/i.test(req.file.originalname)) throw new ApiError(400, 'VALIDATION_ERROR', 'File must end with .seb');
    await Contest.updateOne(
      { _id: req.params.contestId },
      { $set: { sebConfigFile: req.file.buffer, sebConfigFileName: req.file.originalname.slice(0, 80) } }
    );
    send(res, { uploaded: true });
  })
);

router.delete(
  '/contests/:contestId/seb-file',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    await Contest.updateOne({ _id: req.params.contestId }, { $unset: { sebConfigFile: 1 }, $set: { sebConfigFileName: '' } });
    send(res, { removed: true });
  })
);

// ---------- MCQs ----------

router.get(
  '/contests/:contestId/mcqs',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const items = await Mcq.find({ contestId: req.params.contestId }).sort({ order: 1, _id: 1 }).lean();
    send(res, { items });
  })
);

router.post(
  '/contests/:contestId/mcqs',
  requireObjectId('contestId'),
  validate(mcqBody),
  asyncHandler(async (req, res) => {
    await getContest(req.params.contestId, '_id');
    if (req.body.correctIndex >= req.body.options.length) throw new ApiError(400, 'VALIDATION_ERROR', 'correctIndex out of range');
    const order = req.body.order ?? (await Mcq.countDocuments({ contestId: req.params.contestId }));
    send(res, await Mcq.create({ ...req.body, order, contestId: req.params.contestId }), 201);
  })
);

router.patch(
  '/mcqs/:mcqId',
  requireObjectId('mcqId'),
  validate(mcqBody.partial()),
  asyncHandler(async (req, res) => {
    const q = await Mcq.findById(req.params.mcqId);
    if (!q) throw new ApiError(404, 'NOT_FOUND', 'MCQ not found');
    q.set(req.body);
    if (q.correctIndex >= q.options.length) throw new ApiError(400, 'VALIDATION_ERROR', 'correctIndex out of range');
    await q.save();
    send(res, q);
  })
);

router.delete(
  '/mcqs/:mcqId',
  requireObjectId('mcqId'),
  asyncHandler(async (req, res) => {
    await Mcq.deleteOne({ _id: req.params.mcqId });
    send(res, { deleted: true });
  })
);

// Bulk MCQ CSV: question, a, b, c, d, (e, f), answer (A-F or 1-6), marks(optional)
router.post(
  '/contests/:contestId/mcqs/bulk-csv',
  requireObjectId('contestId'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    await getContest(req.params.contestId, '_id');
    if (!req.file) throw new ApiError(400, 'VALIDATION_ERROR', 'Attach a CSV file');
    let rows;
    try {
      rows = parse(req.file.buffer, { columns: (h) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true });
    } catch (e) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Could not read CSV: ${e.message}`);
    }
    const optionKeys = [
      ['a', 'option1', 'option a'],
      ['b', 'option2', 'option b'],
      ['c', 'option3', 'option c'],
      ['d', 'option4', 'option d'],
      ['e', 'option5', 'option e'],
      ['f', 'option6', 'option f'],
    ];
    const errors = [];
    const docs = [];
    const start = req.body.replace === '1' ? 0 : await Mcq.countDocuments({ contestId: req.params.contestId });
    rows.forEach((r, i) => {
      const text = r.question || r.text;
      const options = optionKeys.map((keys) => keys.map((k) => r[k]).find((v) => v)).filter(Boolean);
      const ans = String(r.answer || r.correct || '').trim().toUpperCase();
      const correctIndex = /^[A-F]$/.test(ans) ? ans.charCodeAt(0) - 65 : Number(ans) - 1;
      if (!text || options.length < 2 || !(correctIndex >= 0 && correctIndex < options.length)) {
        errors.push(`Row ${i + 2}: needs question, at least 2 options and a valid answer`);
        return;
      }
      docs.push({
        contestId: req.params.contestId,
        text,
        options,
        correctIndex,
        marks: r.marks ? Number(r.marks) : null,
        order: start + docs.length,
      });
    });
    if (errors.length) throw new ApiError(400, 'VALIDATION_ERROR', `${errors.length} bad row(s)`, { errors: errors.slice(0, 20) });
    if (req.body.replace === '1') {
      if (await hasStarted(req.params.contestId)) throw new ApiError(409, 'CONFLICT', 'Cannot replace after candidates started');
      await Mcq.deleteMany({ contestId: req.params.contestId });
    }
    await Mcq.insertMany(docs);
    send(res, { added: docs.length }, 201);
  })
);

// ---------- problems ----------

router.get(
  '/contests/:contestId/problems',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const items = await Problem.find({ contestId: req.params.contestId }).sort({ order: 1, _id: 1 }).lean();
    send(res, { items });
  })
);

router.post(
  '/contests/:contestId/problems',
  requireObjectId('contestId'),
  validate(problemBody),
  asyncHandler(async (req, res) => {
    await getContest(req.params.contestId, '_id');
    const order = req.body.order ?? (await Problem.countDocuments({ contestId: req.params.contestId }));
    send(res, await Problem.create({ ...req.body, order, contestId: req.params.contestId }), 201);
  })
);

router.get(
  '/problems/:problemId',
  requireObjectId('problemId'),
  asyncHandler(async (req, res) => {
    const p = await Problem.findById(req.params.problemId).lean();
    if (!p) throw new ApiError(404, 'NOT_FOUND', 'Problem not found');
    send(res, p);
  })
);

router.patch(
  '/problems/:problemId',
  requireObjectId('problemId'),
  validate(problemBody.partial()),
  asyncHandler(async (req, res) => {
    const p = await Problem.findByIdAndUpdate(req.params.problemId, { $set: req.body }, { new: true, runValidators: true }).lean();
    if (!p) throw new ApiError(404, 'NOT_FOUND', 'Problem not found');
    send(res, p);
  })
);

router.delete(
  '/problems/:problemId',
  requireObjectId('problemId'),
  asyncHandler(async (req, res) => {
    await Problem.deleteOne({ _id: req.params.problemId });
    send(res, { deleted: true });
  })
);

// Test the reference solution against the problem's samples + hidden tests (admin "dry run").
router.post(
  '/problems/:problemId/validate',
  requireObjectId('problemId'),
  validate(z.object({ code: z.string().min(1).max(64 * 1024) })),
  asyncHandler(async (req, res) => {
    const p = await Problem.findById(req.params.problemId).select('contestId').lean();
    if (!p) throw new ApiError(404, 'NOT_FOUND', 'Problem not found');
    // Admin validations go through the same queue, attached to a synthetic admin attempt.
    let attempt = await Attempt.findOne({ contestId: p.contestId, userId: req.user.id });
    if (!attempt) attempt = await Attempt.create({ contestId: p.contestId, userId: req.user.id, status: 'NOT_STARTED' });
    const sub = await Submission.create({
      kind: 'SUBMIT',
      contestId: p.contestId,
      problemId: p._id,
      attemptId: attempt._id,
      userId: req.user.id,
      code: req.body.code,
    });
    send(res, { submissionId: sub._id }, 202);
  })
);

// ---------- participants ----------

router.get(
  '/contests/:contestId/participants',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const attempts = await Attempt.find({ contestId: req.params.contestId })
      .select('userId status startedAt submittedAt violations')
      .lean();
    const users = await User.find({ _id: { $in: attempts.map((a) => a.userId) }, role: 'CANDIDATE' })
      .select('name email phone isActive')
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const q = String(req.query.search || '').toLowerCase();
    const items = attempts
      .filter((a) => byId.has(String(a.userId)))
      .map((a) => ({ attemptId: a._id, status: a.status, violations: a.violations, startedAt: a.startedAt, submittedAt: a.submittedAt, user: byId.get(String(a.userId)) }))
      .filter((r) => !q || r.user.name.toLowerCase().includes(q) || r.user.email.includes(q) || (r.user.phone || '').includes(q))
      .sort((x, y) => x.user.name.localeCompare(y.user.name));
    send(res, { items, total: items.length });
  })
);

// Step 1 (preview=1) shows what will be imported; step 2 imports.
router.post(
  '/contests/:contestId/participants/import',
  requireObjectId('contestId'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    await getContest(req.params.contestId, '_id');
    if (!req.file) throw new ApiError(400, 'VALIDATION_ERROR', 'Attach the CSV exported from Razorpay');
    const b = req.body || {};
    const parsed = parseParticipants(req.file.buffer, {
      emailColumn: b.emailColumn || undefined,
      nameColumn: b.nameColumn || undefined,
      phoneColumn: b.phoneColumn || undefined,
      statusColumn: b.statusColumn || undefined,
      onlyPaid: b.onlyPaid !== 'false',
      filterColumn: b.filterColumn || undefined,
      filterValue: b.filterValue || undefined,
    });
    if (b.preview === '1') {
      return send(res, { preview: true, columns: parsed.columns, skipped: parsed.skipped, count: parsed.rows.length, sample: parsed.rows.slice(0, 10) });
    }
    const result = await importParticipants(req.params.contestId, parsed.rows);
    send(res, { ...result, skipped: parsed.skipped, columns: parsed.columns });
  })
);

router.post(
  '/contests/:contestId/participants',
  requireObjectId('contestId'),
  validate(z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().toLowerCase().email(), phone: z.string().max(20).optional() })),
  asyncHandler(async (req, res) => {
    await getContest(req.params.contestId, '_id');
    const result = await importParticipants(req.params.contestId, [{ ...req.body, phone: req.body.phone || '', meta: { source: 'manual' } }]);
    send(res, result, 201);
  })
);

router.get(
  '/contests/:contestId/participants/credentials.csv',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const c = await getContest(req.params.contestId, 'slug title');
    const attempts = await Attempt.find({ contestId: c._id }).select('userId').lean();
    const users = await User.find({ _id: { $in: attempts.map((a) => a.userId) }, role: 'CANDIDATE' })
      .select('name email phone +accessCode')
      .sort({ name: 1 })
      .lean();
    const csv = toCsv(['name', 'email', 'phone', 'access_code', 'contest'], users.map((u) => [u.name, u.email, u.phone, u.accessCode, c.title]));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${c.slug}-credentials.csv"`);
    res.send(csv);
  })
);

async function getAttempt(id) {
  const a = await Attempt.findById(id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', 'Attempt not found');
  return a;
}

router.post(
  '/attempts/:attemptId/reset-code',
  requireObjectId('attemptId'),
  asyncHandler(async (req, res) => {
    const a = await getAttempt(req.params.attemptId);
    const code = newAccessCode();
    await User.updateOne({ _id: a.userId, role: 'CANDIDATE' }, { $set: { accessCode: code, sessionNonce: newNonce() } });
    forgetNonce(a.userId);
    send(res, { accessCode: code });
  })
);

// Force-logout (e.g. candidate says someone else is logged in).
router.post(
  '/attempts/:attemptId/logout',
  requireObjectId('attemptId'),
  asyncHandler(async (req, res) => {
    const a = await getAttempt(req.params.attemptId);
    await User.updateOne({ _id: a.userId }, { $set: { sessionNonce: newNonce() } });
    forgetNonce(a.userId);
    send(res, { done: true });
  })
);

router.post(
  '/attempts/:attemptId/unlock',
  requireObjectId('attemptId'),
  validate(z.object({ resetViolations: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const a = await getAttempt(req.params.attemptId);
    if (a.status !== 'LOCKED') throw new ApiError(409, 'CONFLICT', 'Attempt is not locked');
    a.status = 'IN_PROGRESS';
    a.lockedReason = '';
    if (req.body.resetViolations) a.violations = 0;
    await a.save();
    send(res, { status: a.status });
  })
);

router.post(
  '/attempts/:attemptId/extra-time',
  requireObjectId('attemptId'),
  validate(z.object({ minutes: z.number().int().min(1).max(180) })),
  asyncHandler(async (req, res) => {
    const a = await getAttempt(req.params.attemptId);
    if (!a.deadlineAt) throw new ApiError(409, 'CONFLICT', 'Candidate has not started');
    a.deadlineAt = new Date(a.deadlineAt.getTime() + req.body.minutes * 60_000);
    a.extraMinutes += req.body.minutes;
    if (a.status === 'SUBMITTED' && a.deadlineAt > new Date()) a.status = 'IN_PROGRESS'; // reopen if time was over
    await a.save();
    send(res, { deadlineAt: a.deadlineAt, status: a.status });
  })
);

router.post(
  '/attempts/:attemptId/force-submit',
  requireObjectId('attemptId'),
  asyncHandler(async (req, res) => {
    const a = await getAttempt(req.params.attemptId);
    if (!['IN_PROGRESS', 'LOCKED'].includes(a.status)) throw new ApiError(409, 'CONFLICT', 'Nothing to submit');
    a.status = 'SUBMITTED';
    a.submittedAt = new Date();
    await a.save();
    send(res, { status: a.status });
  })
);

router.delete(
  '/attempts/:attemptId',
  requireObjectId('attemptId'),
  asyncHandler(async (req, res) => {
    const a = await getAttempt(req.params.attemptId);
    if (a.status !== 'NOT_STARTED') throw new ApiError(409, 'CONFLICT', 'Candidate already started; cannot remove');
    await a.deleteOne();
    send(res, { deleted: true });
  })
);

// ---------- live monitor ----------

router.get(
  '/contests/:contestId/monitor',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const contest = await getContest(req.params.contestId);
    const [attempts, mcqs, problems, queue] = await Promise.all([
      Attempt.find({ contestId: contest._id })
        .select('userId status startedAt deadlineAt submittedAt violations lastSeenAt focused mcqAnswers coding browser.seb lockedReason')
        .lean(),
      Mcq.find({ contestId: contest._id }).select('correctIndex marks').lean(),
      Problem.find({ contestId: contest._id }).select('title').sort({ order: 1, _id: 1 }).lean(),
      Submission.aggregate([{ $match: { status: { $in: ['QUEUED', 'RUNNING'] } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const users = await User.find({ _id: { $in: attempts.map((a) => a.userId) }, role: 'CANDIDATE' }).select('name email').lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const now = Date.now();
    const rows = attempts
      .filter((a) => byId.has(String(a.userId)))
      .map((a) => ({
        attemptId: a._id,
        user: byId.get(String(a.userId)),
        status: a.status,
        online: a.status === 'IN_PROGRESS' && a.lastSeenAt && now - new Date(a.lastSeenAt).getTime() < 45_000,
        focused: a.focused,
        lastSeenAt: a.lastSeenAt,
        deadlineAt: a.deadlineAt,
        violations: a.violations,
        lockedReason: a.lockedReason,
        seb: a.browser?.seb || false,
        mcqAnswered: Object.keys(a.mcqAnswers || {}).length,
        mcqScore: mcqScore(a, mcqs, contest).score,
        coding: problems.map((p) => a.coding?.[String(p._id)]?.score ?? null),
      }));
    const summary = rows.reduce(
      (s, r) => {
        s[r.status] = (s[r.status] || 0) + 1;
        if (r.online) s.online += 1;
        if (r.violations > 0) s.withViolations += 1;
        return s;
      },
      { online: 0, withViolations: 0 }
    );
    const q = Object.fromEntries(queue.map((x) => [x._id, x.n]));
    send(res, { summary, queue: { queued: q.QUEUED || 0, running: q.RUNNING || 0 }, problems, totalMcq: mcqs.length, rows, serverNow: now });
  })
);

router.get(
  '/contests/:contestId/events',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const items = await ProctorEvent.find({ contestId: req.params.contestId, severity: { $in: ['MED', 'HIGH'] } })
      .sort({ at: -1 })
      .limit(100)
      .lean();
    const users = await User.find({ _id: { $in: [...new Set(items.map((e) => String(e.userId)))] } }).select('name').lean();
    const names = new Map(users.map((u) => [String(u._id), u.name]));
    send(res, { items: items.map((e) => ({ ...e, name: names.get(String(e.userId)) })) });
  })
);

router.get(
  '/attempts/:attemptId',
  requireObjectId('attemptId'),
  asyncHandler(async (req, res) => {
    const a = await Attempt.findById(req.params.attemptId).select('-codeDrafts').lean();
    if (!a) throw new ApiError(404, 'NOT_FOUND', 'Attempt not found');
    const [user, events, submissions] = await Promise.all([
      User.findById(a.userId).select('name email phone meta').lean(),
      ProctorEvent.find({ attemptId: a._id }).sort({ at: -1 }).limit(500).lean(),
      Submission.find({ attemptId: a._id, kind: 'SUBMIT' })
        .select('problemId verdict score maxScore passed total status createdAt')
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    send(res, { attempt: a, user, events, submissions });
  })
);

router.get(
  '/submissions/:submissionId',
  requireObjectId('submissionId'),
  asyncHandler(async (req, res) => {
    const s = await Submission.findById(req.params.submissionId).lean();
    if (!s) throw new ApiError(404, 'NOT_FOUND', 'Submission not found');
    send(res, s);
  })
);

// ---------- results ----------

router.get(
  '/contests/:contestId/leaderboard',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const contest = await getContest(req.params.contestId);
    send(res, await leaderboard(contest));
  })
);

router.get(
  '/contests/:contestId/leaderboard.csv',
  requireObjectId('contestId'),
  asyncHandler(async (req, res) => {
    const contest = await getContest(req.params.contestId);
    const lb = await leaderboard(contest);
    const header = ['rank', 'name', 'email', 'phone', 'mcq', ...lb.problems.map((p) => p.title), 'coding', 'total', 'time_min', 'wrong_submissions', 'violations', 'seb', 'status'];
    const rows = lb.rows.map((r) => [
      r.rank, r.name, r.email, r.phone, r.mcq, ...r.perProblem.map((v) => v ?? ''), r.coding, r.total,
      (r.timeMs / 60000).toFixed(1), r.wrongSubmissions, r.violations, r.seb ? 'yes' : 'no', r.status,
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${contest.slug}-results.csv"`);
    res.send(toCsv(header, rows));
  })
);

// Similarity check over each candidate's best submission per problem.
router.post(
  '/contests/:contestId/plagiarism',
  requireObjectId('contestId'),
  validate(z.object({ threshold: z.number().min(0.3).max(1).default(0.8) })),
  asyncHandler(async (req, res) => {
    const contest = await getContest(req.params.contestId, '_id');
    const attempts = await Attempt.find({ contestId: contest._id, status: { $ne: 'NOT_STARTED' } }).select('userId coding').lean();
    const bestIds = [];
    for (const a of attempts) for (const v of Object.values(a.coding || {})) if (v?.submissionId) bestIds.push(v.submissionId);
    const subs = await Submission.find({ _id: { $in: bestIds } }).select('attemptId userId problemId code').lean();
    const pairs = findSimilar(
      subs.map((s) => ({ id: s._id, attemptId: s.attemptId, userId: s.userId, problemId: s.problemId, code: s.code })),
      req.body.threshold
    );
    const users = await User.find({ _id: { $in: attempts.map((a) => a.userId) } }).select('name email').lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const problems = await Problem.find({ contestId: contest._id }).select('title').lean();
    const pTitle = new Map(problems.map((p) => [String(p._id), p.title]));
    send(res, {
      checked: subs.length,
      pairs: pairs.slice(0, 300).map((p) => ({
        ...p,
        problem: pTitle.get(p.problemId),
        a: { ...p.a, user: byId.get(String(p.a.userId)) },
        b: { ...p.b, user: byId.get(String(p.b.userId)) },
      })),
    });
  })
);

// ---------- system ----------

router.get(
  '/system',
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - 5 * 60_000);
    const [queued, running, recent] = await Promise.all([
      Submission.countDocuments({ status: 'QUEUED' }),
      Submission.countDocuments({ status: 'RUNNING' }),
      Submission.find({ finishedAt: { $gte: since } }).select('workerId startedAt finishedAt createdAt status').lean(),
    ]);
    const workers = [...new Set(recent.map((s) => s.workerId).filter(Boolean))];
    const waits = recent.filter((s) => s.startedAt).map((s) => new Date(s.startedAt) - new Date(s.createdAt));
    const runs = recent.filter((s) => s.startedAt && s.finishedAt).map((s) => new Date(s.finishedAt) - new Date(s.startedAt));
    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    send(res, {
      queue: { queued, running },
      last5min: { judged: recent.length, errors: recent.filter((s) => s.status === 'ERROR').length, avgWaitMs: avg(waits), avgRunMs: avg(runs), workers },
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      uptimeSec: Math.round(process.uptime()),
    });
  })
);

module.exports = router;
