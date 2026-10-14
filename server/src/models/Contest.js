const mongoose = require('mongoose');

// One contest = one category (e.g. "Junior", "Senior"). Holds settings only;
// MCQs and coding problems live in their own collections with contestId.
const contestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]{2,60}$/ },
    category: { type: String, default: '', trim: true, maxlength: 60 },
    instructions: { type: String, default: '', maxlength: 8000 }, // markdown shown in the lobby
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    durationMin: { type: Number, required: true, min: 5, max: 600 },
    published: { type: Boolean, default: false }, // candidates only see published contests

    mcq: {
      marks: { type: Number, default: 1, min: 0 }, // default marks per MCQ (overridable per question)
      negative: { type: Number, default: 0, min: 0 }, // marks deducted per wrong answer
      shuffleQuestions: { type: Boolean, default: true },
      shuffleOptions: { type: Boolean, default: true },
    },

    coding: {
      maxRunsPerMinute: { type: Number, default: 6, min: 1 },
      submitCooldownSec: { type: Number, default: 20, min: 0 },
      maxSubmissionsPerProblem: { type: Number, default: 30, min: 1 },
      // Tie-break penalty: minutes added per wrong submission made before the best one (0 = off).
      wrongSubmissionPenaltyMin: { type: Number, default: 0, min: 0 },
    },

    proctoring: {
      // SEB_REQUIRED: only Safe Exam Browser with a matching config key may open the paper.
      // SEB_PREFERRED: any browser, but non-SEB attempts are flagged.  ANY: no SEB check.
      browserPolicy: { type: String, enum: ['SEB_REQUIRED', 'SEB_PREFERRED', 'ANY'], default: 'SEB_REQUIRED' },
      sebConfigKeys: { type: [String], default: [] }, // Config Key(s) copied from the SEB Config Tool
      requireFullscreen: { type: Boolean, default: true }, // enforced for non-SEB browsers
      blockPaste: { type: Boolean, default: true },
      // Lock the attempt after this many serious violations (0 = never auto-lock, flag only).
      lockAfterViolations: { type: Number, default: 6, min: 0 },
    },
    sebConfigFile: { type: Buffer, select: false }, // optional .seb file served to candidates
    sebConfigFileName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contest', contestSchema);
