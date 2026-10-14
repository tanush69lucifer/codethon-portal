const mongoose = require('mongoose');

const sampleSchema = new mongoose.Schema(
  { input: { type: String, default: '' }, output: { type: String, default: '' }, explanation: { type: String, default: '' } },
  { _id: false }
);

// Hidden tests are judged on Submit. They NEVER leave the server (candidate APIs strip them).
const testSchema = new mongoose.Schema(
  { input: { type: String, default: '' }, output: { type: String, default: '' }, weight: { type: Number, default: 1, min: 0 } },
  { _id: false }
);

const problemSchema = new mongoose.Schema(
  {
    contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true, index: true },
    order: { type: Number, default: 0 },
    title: { type: String, required: true, maxlength: 140 },
    statement: { type: String, default: '', maxlength: 20000 }, // markdown
    inputFormat: { type: String, default: '', maxlength: 4000 },
    outputFormat: { type: String, default: '', maxlength: 4000 },
    constraints: { type: String, default: '', maxlength: 4000 },
    points: { type: Number, default: 100, min: 0 },
    timeLimitMs: { type: Number, default: 2000, min: 200, max: 15000 }, // per test, CPU work only (JVM grace added by judge)
    memoryMb: { type: Number, default: 256, min: 32, max: 1024 },
    // exact: byte match after trimming trailing whitespace per line. tokens: whitespace-insensitive.
    // float: tokens, numbers compared with 1e-6 tolerance.
    checker: { type: String, enum: ['tokens', 'exact', 'float'], default: 'tokens' },
    starterCode: { type: String, default: '' },
    samples: { type: [sampleSchema], default: [] },
    tests: { type: [testSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Problem', problemSchema);
