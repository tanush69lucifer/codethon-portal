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
  if (a.length === b.length) {
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }
  // School-friendly prompt handling (ICSE / ISC):
  // If student printed conversational prompts (e.g. "Enter N: ", "Result is: 42"),
  // verify whether the expected answer tokens match the trailing tail tokens of the student's output.
  if (b.length > a.length && a.length > 0) {
    const tail = b.slice(b.length - a.length);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== tail[i]) return false;
    }
    return true;
  }
  return false;
}

function floatCompare(expected, actual, eps = 1e-6) {
  const a = tokens(expected);
  const b = tokens(actual);
  if (a.length !== b.length) {
    if (b.length > a.length && a.length > 0) {
      const tail = b.slice(b.length - a.length);
      return compareFloats(a, tail, eps);
    }
    return false;
  }
  return compareFloats(a, b, eps);
}

function compareFloats(a, b, eps) {
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
