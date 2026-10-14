// Central config. Every env var the server reads is listed here (see ../../.env.example).
const path = require('path');
require('dotenv').config({ path: process.env.ENV_FILE || path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // also allow server/.env

const required = ['MONGO_URI', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[config] Missing required env var ${key}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

module.exports = {
  appName: process.env.APP_NAME || 'Codethon Portal',
  port: num(process.env.PORT, 5000),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '10h',
  // Public origin the candidates use (https://contest.example.com). Used for CORS and SEB URL checks.
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, ''),
  corsOrigins: (process.env.CORS_ORIGINS || process.env.PUBLIC_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  isProd: process.env.NODE_ENV === 'production',
  serveClient: process.env.SERVE_CLIENT !== 'false',
  clientDist: process.env.CLIENT_DIST || path.resolve(__dirname, '../../client/dist'),

  admin: {
    email: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD || '',
  },

  judge: {
    // docker = sandboxed (production). local = runs runner.sh directly on the host (DEV ONLY, unsafe).
    mode: process.env.JUDGE_MODE || 'docker',
    image: process.env.JUDGE_IMAGE || 'codethon-java-runner:latest',
    concurrency: num(process.env.JUDGE_CONCURRENCY, 2),
    // Extra wall-clock allowance per test for JVM startup, added on top of the problem's time limit.
    jvmGraceMs: num(process.env.JUDGE_JVM_GRACE_MS, 600),
    compileTimeoutSec: num(process.env.JUDGE_COMPILE_TIMEOUT_SEC, 25),
    containerMemoryMb: num(process.env.JUDGE_CONTAINER_MEMORY_MB, 768),
    maxOutputKb: num(process.env.JUDGE_MAX_OUTPUT_KB, 2048),
    runnerScript: path.resolve(__dirname, '../../judge/runner.sh'),
    staleRunningMs: num(process.env.JUDGE_STALE_MS, 3 * 60 * 1000),
  },

  limits: {
    maxCodeBytes: num(process.env.MAX_CODE_BYTES, 64 * 1024),
    maxCustomInputBytes: num(process.env.MAX_CUSTOM_INPUT_BYTES, 64 * 1024),
    submitGraceSec: num(process.env.SUBMIT_GRACE_SEC, 30),
  },
};
