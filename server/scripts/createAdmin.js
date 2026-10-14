// Create or reset an extra admin: node scripts/createAdmin.js email@x.com "Strong Password" "Name"
const { connectDB, mongoose } = require('../src/db');
const User = require('../src/models/User');

async function main() {
  const [email, password, name = 'Admin'] = process.argv.slice(2);
  if (!email || !password || password.length < 10) {
    console.error('Usage: node scripts/createAdmin.js <email> <password (10+ chars)> [name]');
    process.exit(1);
  }
  await connectDB();
  const passwordHash = await User.hashPassword(password);
  await User.updateOne(
    { email: email.toLowerCase() },
    { $set: { name, role: 'ADMIN', passwordHash, isActive: true } },
    { upsert: true }
  );
  console.log(`Admin ready: ${email}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
