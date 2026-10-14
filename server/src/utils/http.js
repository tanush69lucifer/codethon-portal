// Small HTTP helpers shared by every route.
// Success: { ok: true, data }   Error: { ok: false, error: { code, message, details? } }

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const send = (res, data, status = 200) => res.status(status).json({ ok: true, data });

// validate(schema) for req.body, validate(schema, 'query') for query strings.
const validate = (schema, where = 'body') => (req, res, next) => {
  const parsed = schema.safeParse(req[where] ?? {});
  if (!parsed.success) {
    return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten()));
  }
  req[where === 'body' ? 'body' : 'validQuery'] = parsed.data;
  next();
};

const isObjectId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

function requireObjectId(...params) {
  return (req, res, next) => {
    for (const p of params) {
      if (!isObjectId(req.params[p])) return next(new ApiError(400, 'INVALID_ID', `Invalid ${p}`));
    }
    next();
  };
}

function notFound(req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `No route ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ ok: false, error: { code: 'CONFLICT', message: 'Duplicate value', details: err.keyValue } });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: err.message } });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ ok: false, error: { code: 'UPLOAD_ERROR', message: err.message } });
  }
  console.error('[error]', err);
  res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
}

module.exports = { ApiError, asyncHandler, send, validate, isObjectId, requireObjectId, notFound, errorHandler };
