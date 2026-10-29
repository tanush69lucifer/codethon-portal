// Complete Factory Reset for Codethon Portal:
// Drops/wipes all users, attempts, contests, MCQs, problems, submissions, proctor logs,
// and recreates fresh Admin, Demo Contest, and Candidates.
//
// Usage: node scripts/reset-all.js [adminEmail] [adminPassword]
// Example: npm run reset-all
// Example: node scripts/reset-all.js admin@example.com "myNewPassword123"

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
  if (config.isProd) throw new Error('Refusing to reset in production mode');
  await connectDB();

  console.log('\n[1/4] Clearing all database collections...');
  await Promise.all([
    User.deleteMany({}),
    Contest.deleteMany({}),
    Mcq.deleteMany({}),
    Problem.deleteMany({}),
    Attempt.deleteMany({}),
    Submission.deleteMany({}),
    ProctorEvent.deleteMany({}),
  ]);
  console.log('✓ All users, attempts, contests, and submissions wiped clean.');

  // Determine admin credentials
  const adminEmail = (process.argv[2] || config.admin.email || 'admin@example.com').toLowerCase().trim();
  const adminPassword = process.argv[3] || config.admin.password || 'change-this-password';

  console.log('\n[2/4] Creating fresh Admin...');
  const adminHash = await User.hashPassword(adminPassword);
  await User.create({
    name: 'Admin',
    email: adminEmail,
    role: 'ADMIN',
    passwordHash: adminHash,
    isActive: true,
  });
  console.log(`✓ Admin created: ${adminEmail}`);

  console.log('\n[3/4] Importing sample contest & questions...');
  const samplePath = path.resolve(__dirname, '../../samples/contest-sample.json');
  const sampleData = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

  const now = Date.now();
  const contest = await Contest.create({
    ...sampleData.contest,
    startAt: new Date(now - 10 * 60_000), // opened 10m ago
    endAt: new Date(now + 7 * 24 * 3600_000), // open for 7 days
    published: true,
  });

  await Mcq.insertMany(sampleData.mcqs.map((q, i) => ({ ...q, order: i, contestId: contest._id })));
  await Problem.insertMany(sampleData.problems.map((p, i) => ({ ...p, order: i, contestId: contest._id })));
  console.log(`✓ Seeded contest "${contest.title}" (${contest._id})`);

  console.log('\n[4/4] Creating demo candidates...');
  const demoCandidates = [
    { name: 'Demo Candidate', email: 'candidate@demo.test', accessCode: 'DEMO2026' },
    { name: 'Demo Candidate 2', email: 'candidate2@demo.test', accessCode: 'DEMO2027' },
  ];

  for (const c of demoCandidates) {
    const user = await User.create({
      name: c.name,
      email: c.email,
      accessCode: c.accessCode,
      role: 'CANDIDATE',
      isActive: true,
    });
    await Attempt.create({
      contestId: contest._id,
      userId: user._id,
      status: 'NOT_STARTED',
    });
  }
  console.log('✓ Created candidates with NOT_STARTED attempts.');

  console.log('\n======================================================');
  console.log('🎉 TOTAL RESET COMPLETE! EVERYTHING IS FRESH & READY');
  console.log('======================================================');
  console.log(`Admin Portal:`);
  console.log(`   URL:      http://localhost:5173/admin/login`);
  console.log(`   Email:    ${adminEmail}`);
  console.log(`   Password: ${adminPassword}`);
  console.log(`\nCandidate Portal:`);
  console.log(`   URL:          http://localhost:5173/`);
  console.log(`   Candidate 1:  candidate@demo.test  / DEMO2026`);
  console.log(`   Candidate 2:  candidate2@demo.test / DEMO2027`);
  console.log('======================================================\n');

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('\nReset failed:', e.message);
  await mongoose.disconnect();
  process.exit(1);
});
