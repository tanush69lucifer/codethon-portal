const mongoose = require('mongoose');

const { ObjectId, Mixed } = mongoose.Schema.Types;

// Integrity signals from the candidate browser. These are clues for a human
// reviewer, not proof. Never store typed/pasted text here.
const proctorEventSchema = new mongoose.Schema(
  {
    contestId: { type: ObjectId, required: true },
    attemptId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    code: { type: String, required: true },
    severity: { type: String, enum: ['LOW', 'MED', 'HIGH'], default: 'LOW' },
    counted: { type: Boolean, default: false }, // counted towards auto-lock
    at: { type: Date, default: Date.now },
    meta: { type: Mixed, default: {} },
  },
  { versionKey: false }
);

proctorEventSchema.index({ attemptId: 1, at: -1 });
proctorEventSchema.index({ contestId: 1, at: -1 });

module.exports = mongoose.model('ProctorEvent', proctorEventSchema);
