const mongoose = require('mongoose');

const { ObjectId, Mixed } = mongoose.Schema.Types;

// One Attempt per (contest, candidate). Created as NOT_STARTED when the candidate is
// imported, which is also what "assigns" a candidate to a contest.
const attemptSchema = new mongoose.Schema(
  {
    contestId: { type: ObjectId, ref: 'Contest', required: true },
    userId: { type: ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'LOCKED'],
      default: 'NOT_STARTED',
      index: true,
    },
    startedAt: Date,
    deadlineAt: Date, // server-authoritative end time for this candidate
    submittedAt: Date,
    lockedReason: { type: String, default: '' },
    extraMinutes: { type: Number, default: 0 }, // admin can grant extra time

    mcqOrder: { type: [ObjectId], default: [] }, // per-candidate shuffled order
    optionOrders: { type: Mixed, default: {} }, // { mcqId: [originalIndex,...] }
    mcqAnswers: { type: Mixed, default: {} }, // { mcqId: originalOptionIndex }
    codeDrafts: { type: Mixed, default: {} }, // { problemId: code } autosave
    // Best score per problem: { problemId: { score, max, submissionId, at } }
    coding: { type: Mixed, default: {} },
    lastImprovementAt: Date, // when total coding score last went up (tie-break)

    violations: { type: Number, default: 0 },
    eventCount: { type: Number, default: 0 },
    lastSeenAt: Date,
    focused: { type: Boolean, default: true },
    browser: {
      seb: { type: Boolean, default: false },
      userAgent: { type: String, default: '' },
      ip: { type: String, default: '' },
      screen: { type: Mixed, default: {} },
    },
  },
  { timestamps: true, minimize: false }
);

attemptSchema.index({ contestId: 1, userId: 1 }, { unique: true });
attemptSchema.index({ contestId: 1, status: 1 });

module.exports = mongoose.model('Attempt', attemptSchema);
