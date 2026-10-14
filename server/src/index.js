// API process: `npm start`. The judge runs separately: `npm run worker`.
const http = require('http');
const config = require('./config');
const { connectDB, mongoose } = require('./db');
const app = require('./app');
const User = require('./models/User');

// Creates/updates the admin from ADMIN_EMAIL + ADMIN_PASSWORD on boot, so a fresh deploy is usable.
async function ensureAdmin() {
  const { email, password } = config.admin;
  if (!email || !password) {
    console.warn('[boot] ADMIN_EMAIL/ADMIN_PASSWORD not set: no admin bootstrapped');
    return;
  }
  if (password.length < 10) {
    console.warn('[boot] ADMIN_PASSWORD should be at least 10 characters');
  }
  const existing = await User.findOne({ email }).select('+passwordHash');
  if (!existing) {
    await User.create({ name: 'Admin', email, role: 'ADMIN', passwordHash: await User.hashPassword(password) });
    console.log(`[boot] admin created: ${email}`);
  } else if (existing.role !== 'ADMIN' || !(await existing.checkPassword(password))) {
    existing.role = 'ADMIN';
    existing.passwordHash = await User.hashPassword(password);
    await existing.save();
    console.log(`[boot] admin updated: ${email}`);
  }
}

async function start() {
  await connectDB();
  await ensureAdmin();
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000; // longer than typical proxy idle timeouts
  server.listen(config.port, () => console.log(`[api] listening on :${config.port}`));

  const shutdown = async (sig) => {
    console.log(`[api] ${sig}: shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[api] failed to start', err);
  process.exit(1);
});
