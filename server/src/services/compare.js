// Output checkers. Expected output comes from the problem's test, actual from the program.

const normNewlines = (s) => String(s ?? '').replace(/\r\n?/g, '\n');

function exact(expected, actual) {
  const clean = (s) =>
    normNewlines(s)
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');
  return clean(expected) === clean(actual);
}

const tokens = (s) => normNewlines(s).split(/\s+/).filter(Boolean);

function tokenCompare(expected, actual) {
  const a = tokens(expected);
  const b = tokens(actual);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function floatCompare(expected, actual, eps = 1e-6) {
  const a = tokens(expected);
  const b = tokens(actual);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const diff = Math.abs(x - y);
    if (diff > eps && diff > eps * Math.abs(x)) return false;
  }
  return true;
}

function check(checker, expected, actual) {
  if (checker === 'exact') return exact(expected, actual);
  if (checker === 'float') return floatCompare(expected, actual);
  return tokenCompare(expected, actual);
}

module.exports = { check, exact, tokenCompare, floatCompare };
