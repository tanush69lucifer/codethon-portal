const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Also acts as the judge queue: workers atomically claim QUEUED docs.
const submissionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['RUN', 'SUBMIT'], required: true },
    contestId: { type: ObjectId, ref: 'Contest', required: true },
    problemId: { type: ObjectId, ref: 'Problem', required: true },
    attemptId: { type: ObjectId, ref: 'Attempt', required: true },
    userId: { type: ObjectId, ref: 'User', required: true },
    language: { type: String, default: 'java' },
    code: { type: String, required: true },
    customInput: { type: String, default: null }, // RUN with custom input; null = run samples

    status: { type: String, enum: ['QUEUED', 'RUNNING', 'DONE', 'ERROR'], default: 'QUEUED' },
    // AC WA TLE MLE RE CE OLE PARTIAL IE(internal error)
    verdict: { type: String, default: null },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    passed: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    tests: {
      type: [{ _id: false, verdict: String, timeMs: Number }],
      default: [],
    },
    compileOutput: { type: String, default: '' },
    // RUN only: what the program printed (trimmed), so candidates can debug.
    runOutputs: {
      type: [{ _id: false, input: String, expected: String, stdout: String, stderr: String, verdict: String, timeMs: Number }],
      default: [],
    },
    workerId: { type: String, default: '' },
    startedAt: Date,
    finishedAt: Date,

    // Instrumentation (all optional; older documents simply lack them).
    codeHash: { type: String, default: '' }, // sha256 of the exact source, hex
    queueWaitMs: { type: Number, default: null }, // createdAt -> claimed by a worker
    compileMs: { type: Number, default: null }, // javac wall time inside the sandbox
    sandboxMs: { type: Number, default: null }, // whole sandbox call: container start + compile + all tests
    overheadMs: { type: Number, default: null }, // sandboxMs - compileMs - sum(test timeMs): container start, JVM-external cost
  },
  { timestamps: true }
);

submissionSchema.index({ status: 1, createdAt: 1 }); // queue scan (FIFO claims)
submissionSchema.index({ status: 1, kind: 1, createdAt: 1 }); // queue scan (SUBMIT-first claims)
submissionSchema.index({ problemId: 1, codeHash: 1 }); // duplicate-source analysis
submissionSchema.index({ attemptId: 1, problemId: 1, createdAt: -1 });
submissionSchema.index({ contestId: 1, kind: 1, problemId: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
