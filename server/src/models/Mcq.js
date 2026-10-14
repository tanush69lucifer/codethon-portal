const mongoose = require('mongoose');

const mcqSchema = new mongoose.Schema(
  {
    contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true, index: true },
    order: { type: Number, default: 0 },
    text: { type: String, required: true, maxlength: 4000 }, // markdown; code blocks allowed
    options: {
      type: [String],
      validate: [(v) => v.length >= 2 && v.length <= 6, 'MCQ needs 2 to 6 options'],
    },
    correctIndex: { type: Number, required: true, min: 0 },
    marks: { type: Number, default: null }, // null = contest default
    tag: { type: String, default: '', maxlength: 40 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Mcq', mcqSchema);
