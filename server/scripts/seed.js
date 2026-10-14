// Dev seed: imports samples/contest-sample.json (opened from now for 7 days) and a demo candidate.
// Usage: npm run seed            (refuses NODE_ENV=production)
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { connectDB, mongoose } = require('../src/db');
const Contest = require('../src/models/Contest');
const Mcq = require('../src/models/Mcq');
const Problem = require('../src/models/Problem');
const Attempt = require('../src/models/Attempt');
const User = require('../src/models/User');
const Submission = require('../src/models/Submission');
const ProctorEvent = require('../src/models/ProctorEvent');

async function main() {
  if (config.isProd) throw new Error('Refusing to seed in production');
  await connectDB();
  const file = process.argv[2] || path.resolve(__dirname, '../../samples/contest-sample.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  const now = Date.now();
  const contestData = {
    ...data.contest,
    startAt: new Date(now - 10 * 60_000),
    endAt: new Date(now + 7 * 24 * 3600_000),
    published: true,
  };
  let contest = await Contest.findOne({ slug: contestData.slug });
  if (contest) {
    await Promise.all([
      Mcq.deleteMany({ contestId: contest._id }),
      Problem.deleteMany({ contestId: contest._id }),
      Attempt.deleteMany({ contestId: contest._id }),
      Submission.deleteMany({ contestId: contest._id }),
      ProctorEvent.deleteMany({ contestId: contest._id }),
    ]);
    contest.set(contestData);
    await contest.save();
  } else {
    contest = await Contest.create(contestData);
  }
  await Mcq.insertMany(data.mcqs.map((q, i) => ({ ...q, order: i, contestId: contest._id })));
  await Problem.insertMany(data.problems.map((p, i) => ({ ...p, order: i, contestId: contest._id })));

  const demo = [
    { name: 'Demo Candidate', email: 'candidate@demo.test', accessCode: 'DEMO2026' },
    { name: 'Demo Candidate 2', email: 'candidate2@demo.test', accessCode: 'DEMO2027' },
  ];
  for (const d of demo) {
    let u = await User.findOne({ email: d.email });
    if (!u) u = await User.create({ ...d, role: 'CANDIDATE' });
    else await User.updateOne({ _id: u._id }, { $set: { accessCode: d.accessCode } });
    await Attempt.create({ contestId: contest._id, userId: u._id, status: 'NOT_STARTED' });
  }

  console.log(`Seeded contest "${contest.title}" (${contest._id})`);
  console.log('Candidate login: candidate@demo.test / DEMO2026   (and candidate2@demo.test / DEMO2027)');
  console.log(`Admin login: ${config.admin.email || '(set ADMIN_EMAIL / ADMIN_PASSWORD and start the API once)'}`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect();
  process.exit(1);
});
