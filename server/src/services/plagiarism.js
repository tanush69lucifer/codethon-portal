// Code similarity check (MOSS-style winnowing) for Java submissions.
// Renaming variables, changing whitespace/comments or string literals does not hide a copy:
// identifiers -> I, numbers -> N, strings -> S, then 5-gram fingerprints are compared (Jaccard).
const crypto = require('crypto');

const JAVA_KEYWORDS = new Set(
  ('abstract assert boolean break byte case catch char class const continue default do double else enum extends final ' +
    'finally float for goto if implements import instanceof int interface long native new package private protected public ' +
    'return short static strictfp super switch synchronized this throw throws transient try void volatile while var record ' +
    'true false null String System out println print printf Scanner nextInt nextLine next nextLong nextDouble length size ' +
    'Math max min abs ArrayList List Map HashMap HashSet Set Arrays sort StringBuilder append toString charAt BufferedReader ' +
    'InputStreamReader readLine parseInt split Integer Long').split(/\s+/)
);

function normalizeJava(code) {
  const src = String(code || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' S ')
    .replace(/'(?:\\.|[^'\\])'/g, ' S ');
  const tokens = src.match(/[A-Za-z_$][\w$]*|\d[\d_.]*[lLfFdD]?|[{}()[\];,.<>=!+\-*/%&|^~?:]+/g) || [];
  return tokens
    .filter((t) => !['import', 'package'].includes(t))
    .map((t) => {
      if (/^\d/.test(t)) return 'N';
      if (/^[A-Za-z_$]/.test(t)) return JAVA_KEYWORDS.has(t) ? t : 'I';
      return t;
    });
}

const hash = (s) => crypto.createHash('md5').update(s).digest().readUInt32BE(0);

function fingerprint(code, k = 5, w = 4) {
  const toks = normalizeJava(code);
  if (toks.length < k) return new Set(toks.length ? [hash(toks.join(' '))] : []);
  const grams = [];
  for (let i = 0; i + k <= toks.length; i += 1) grams.push(hash(toks.slice(i, i + k).join(' ')));
  const fp = new Set();
  for (let i = 0; i + w <= grams.length; i += 1) {
    let min = grams[i];
    for (let j = 1; j < w; j += 1) if (grams[i + j] < min) min = grams[i + j];
    fp.add(min);
  }
  if (!fp.size) grams.forEach((g) => fp.add(g));
  return fp;
}

/**
 * items: [{ id, attemptId, userId, problemId, code }]
 * Returns pairs with similarity >= threshold (0..1), grouped per problem.
 */
function findSimilar(items, threshold = 0.8, minTokens = 25) {
  const byProblem = new Map();
  for (const it of items) {
    if (normalizeJava(it.code).length < minTokens) continue; // ignore near-empty programs
    const list = byProblem.get(String(it.problemId)) || [];
    list.push({ ...it, fp: fingerprint(it.code) });
    byProblem.set(String(it.problemId), list);
  }

  const pairs = [];
  for (const [problemId, list] of byProblem) {
    // Inverted index: fingerprint -> item indexes, so we only compare items sharing something.
    const index = new Map();
    list.forEach((it, i) => {
      for (const h of it.fp) {
        const arr = index.get(h) || [];
        arr.push(i);
        index.set(h, arr);
      }
    });
    const shared = new Map(); // "i:j" -> count
    for (const arr of index.values()) {
      if (arr.length > 60) continue; // boilerplate everyone shares
      for (let a = 0; a < arr.length; a += 1) {
        for (let b = a + 1; b < arr.length; b += 1) {
          const key = `${arr[a]}:${arr[b]}`;
          shared.set(key, (shared.get(key) || 0) + 1);
        }
      }
    }
    for (const [key, common] of shared) {
      const [i, j] = key.split(':').map(Number);
      const A = list[i];
      const B = list[j];
      if (String(A.userId) === String(B.userId)) continue;
      const sim = common / (A.fp.size + B.fp.size - common);
      if (sim >= threshold) {
        pairs.push({
          problemId,
          similarity: Math.round(sim * 1000) / 10,
          a: { submissionId: A.id, attemptId: A.attemptId, userId: A.userId },
          b: { submissionId: B.id, attemptId: B.attemptId, userId: B.userId },
        });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

module.exports = { findSimilar, normalizeJava, fingerprint };
