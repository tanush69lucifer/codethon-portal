// Reset a candidate's attempt back to NOT_STARTED so they can retake the test.
// Usage: node scripts/reset-attempt.js [email]
// Example: node scripts/reset-attempt.js candidate@demo.test
const { connectDB, mongoose } = require('../src/db');
const User = require('../src/models/User');
const Attempt = require('../src/models/Attempt');
const Submission = require('../src/models/Submission');
const ProctorEvent = require('../src/models/ProctorEvent');

async function main() {
  await connectDB();
  const targetEmail = process.argv[2] || 'candidate@demo.test';

  const user = await User.findOne({ email: targetEmail });
  if (!user) {
    console.error(`User with email "${targetEmail}" not found.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const result = await Attempt.updateMany(
    { userId: user._id },
    {
      $set: {
        status: 'NOT_STARTED',
        startedAt: null,
        deadlineAt: null,
        submittedAt: null,
        lockedReason: '',
        extraMinutes: 0,
        mcqOrder: [],
        optionOrders: {},
        mcqAnswers: {},
        codeDrafts: {},
        coding: {},
        violations: 0,
        eventCount: 0,
        lastSeenAt: null,
      },
    }
  );

  await Submission.deleteMany({ userId: user._id });
  await ProctorEvent.deleteMany({ userId: user._id });

  console.log(`\nAttempt for ${targetEmail} has been reset to NOT_STARTED (${result.modifiedCount} updated).`);
  console.log(`The candidate can now log in and restart the exam fresh.\n`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
