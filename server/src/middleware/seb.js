// Safe Exam Browser (SEB) verification.
//
// SEB proves its configuration with a "Config Key". On every request it sends
//   X-SafeExamBrowser-ConfigKeyHash = SHA256(absoluteRequestUrl + configKey)
// Newer SEB versions also expose the same value to page JavaScript via
// SafeExamBrowser.security.configKey (hash of the *page* URL + config key).
// Our client forwards that as X-SEB-Page-Url + X-SEB-Page-Hash, which covers
// XHR requests where the native header might be missing.
//
// Honest limits: the hash is per-URL and can be replayed by someone who sniffs it
// from inside SEB. It raises the bar a lot (normal Chrome + extensions is blocked),
// it is not a cryptographic attestation. Combine with the in-page detector + review.
const crypto = require('crypto');
const config = require('../config');

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function requestUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}${req.originalUrl}`;
}

function sameOrigin(url) {
  try {
    const u = new URL(url);
    const allowed = [config.publicUrl, ...config.corsOrigins].map((o) => new URL(o).origin);
    return allowed.includes(u.origin);
  } catch {
    return false;
  }
}

/**
 * Returns { seb: boolean, verified: boolean, reason }.
 * seb = request looks like it comes from SEB. verified = config key matched.
 */
function checkSeb(req, contest) {
  const ua = req.headers['user-agent'] || '';
  const looksLikeSeb = /\bSEB\b|SafeExamBrowser/i.test(ua);
  const keys = (contest?.proctoring?.sebConfigKeys || []).map((k) => String(k).trim()).filter(Boolean);

  const nativeHash = String(req.headers['x-safeexambrowser-configkeyhash'] || '').toLowerCase();
  const pageUrl = String(req.headers['x-seb-page-url'] || '').split('#')[0];
  const pageHash = String(req.headers['x-seb-page-hash'] || '').toLowerCase();

  if (!keys.length) {
    // No key configured: we can only rely on the user agent. Admin should add the key before the event.
    return { seb: looksLikeSeb, verified: false, reason: looksLikeSeb ? 'SEB_NO_KEY_CONFIGURED' : 'NOT_SEB' };
  }

  if (nativeHash) {
    const url = requestUrl(req);
    if (keys.some((k) => sha256(url + k) === nativeHash)) return { seb: true, verified: true, reason: 'OK_HEADER' };
  }
  if (pageHash && pageUrl && sameOrigin(pageUrl)) {
    if (keys.some((k) => sha256(pageUrl + k) === pageHash)) return { seb: true, verified: true, reason: 'OK_JSAPI' };
  }
  if (nativeHash || pageHash) return { seb: true, verified: false, reason: 'SEB_KEY_MISMATCH' };
  return { seb: looksLikeSeb, verified: false, reason: looksLikeSeb ? 'SEB_NO_HASH' : 'NOT_SEB' };
}

module.exports = { checkSeb, sha256, requestUrl };
