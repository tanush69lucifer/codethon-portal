const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const User = require('../models/User');
const { ApiError } = require('../utils/http');

const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role, name: user.name, n: user.sessionNonce }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

const newNonce = () => crypto.randomBytes(9).toString('base64url');

// Tiny cache so 500 candidates polling doesn't hit Mongo for every request.
// A new login is enforced within NONCE_TTL_MS on other devices.
const NONCE_TTL_MS = 10_000;
const nonceCache = new Map(); // userId -> { nonce, active, exp }

async function currentNonce(userId) {
  const hit = nonceCache.get(userId);
  if (hit && hit.exp > Date.now()) return hit;
  const user = await User.findById(userId).select('sessionNonce isActive').lean();
  const entry = { nonce: user?.sessionNonce ?? null, active: Boolean(user?.isActive), exp: Date.now() + NONCE_TTL_MS };
  nonceCache.set(userId, entry);
  if (nonceCache.size > 5000) nonceCache.clear();
  return entry;
}

const forgetNonce = (userId) => nonceCache.delete(String(userId));

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired, please log in again');
    }
    const entry = await currentNonce(payload.sub);
    if (!entry.active) throw new ApiError(401, 'UNAUTHENTICATED', 'Account disabled');
    if (entry.nonce !== payload.n) {
      throw new ApiError(401, 'SESSION_REPLACED', 'You logged in on another device or tab. This session was closed.');
    }
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
    next();
  } catch (err) {
    next(err);
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(new ApiError(403, 'FORBIDDEN', 'Not allowed'));

module.exports = { signToken, newNonce, requireAuth, requireRole, forgetNonce };
