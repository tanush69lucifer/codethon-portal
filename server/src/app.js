const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { notFound, errorHandler } = require('./utils/http');

const app = express();

app.set('trust proxy', 1); // behind Caddy / a load balancer: req.ip = real client IP
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Monaco editor needs blob: workers and inline styles.
        'script-src': ["'self'"],
        'worker-src': ["'self'", 'blob:'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'font-src': ["'self'", 'data:'],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"], // nobody can embed the exam in an iframe
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors({ origin: config.corsOrigins, credentials: false }));
app.use(compression());
app.use(express.json({ limit: '6mb' })); // contest import JSON can carry test data
if (!config.isProd) app.use(morgan('dev'));

// Two ceilings to absorb bugs/abuse:
//  - per logged-in session (a normal candidate makes ~20-40 requests/min)
//  - per IP, very generous because a whole school/hostel can share one public IP.
const tooMany = (req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Slow down.' } });
const bearer = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(-32) : null;
};
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.API_RATE_PER_SESSION_PER_MIN) || 240,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => !bearer(req),
    keyGenerator: (req) => `tok:${bearer(req)}`,
    handler: tooMany,
  })
);
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.API_RATE_PER_IP_PER_MIN) || 20000,
    standardHeaders: false,
    legacyHeaders: false,
    handler: tooMany,
  })
);

app.get('/health', (req, res) => res.json({ ok: true, data: { status: 'up', time: Date.now() } }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/c', require('./routes/candidate.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api', notFound);

// Serve the built React app from the same origin (simplest deploy, no CORS issues inside SEB).
if (config.serveClient && fs.existsSync(path.join(config.clientDist, 'index.html'))) {
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(config.clientDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
