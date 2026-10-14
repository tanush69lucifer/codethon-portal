const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const User = require('../models/User');
const { signToken, newNonce, requireAuth, forgetNonce } = require('../middleware/auth');
const { ApiError, asyncHandler, send, validate } = require('../utils/http');

// Keyed by IP + email so a whole school behind one NAT is not blocked together.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
  handler: (req, res) =>
    res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Wait 10 minutes.' } }),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().max(200).optional(), // admin
  code: z.string().trim().max(40).optional(), // candidate access code
});

const publicUser = (u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role });

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, code } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash +accessCode');
    const fail = () => {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or access code is incorrect');
    };
    if (!user || !user.isActive) fail();
    if (user.role === 'ADMIN') {
      if (!password || !(await user.checkPassword(password))) fail();
    } else {
      const given = String(code || password || '').toUpperCase().replace(/\s/g, '');
      if (!given || !user.accessCode || given !== user.accessCode) fail();
    }
    user.sessionNonce = newNonce(); // invalidates any other logged-in device
    await user.save();
    forgetNonce(user._id);
    send(res, { token: signToken(user), user: publicUser(user) });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).lean();
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in');
    send(res, { user: publicUser(user) });
  })
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.user.id }, { $set: { sessionNonce: newNonce() } });
    forgetNonce(req.user.id);
    send(res, { loggedOut: true });
  })
);

module.exports = router;
