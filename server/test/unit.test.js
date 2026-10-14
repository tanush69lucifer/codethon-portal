// Unit tests that need no database or Java: `npm test`
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://unused';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { check } = require('../src/services/compare');
const { findSimilar } = require('../src/services/plagiarism');
const { parseParticipants, toCsv } = require('../src/services/participants');
const { mcqScore, codingScoreFromTests } = require('../src/services/scoring');
const { detectClass } = require('../src/judge/sandbox');
const { sha256 } = require('../src/middleware/seb');

test('checkers', () => {
  assert.ok(check('tokens', '1 2\n3\n', '1  2 3'));
  assert.ok(!check('tokens', '1 2 3', '1 2'));
  assert.ok(check('exact', 'a\nb\n', 'a  \nb'));
  assert.ok(!check('exact', 'a b', 'a  b'));
  assert.ok(check('float', '0.3333333', '0.33333331'));
  assert.ok(!check('float', '0.33', '0.34'));
});

test('plagiarism catches renamed copy, ignores different solution', () => {
  const a = `import java.util.*; public class Main { public static void main(String[] args) { Scanner sc = new Scanner(System.in);
    int n = sc.nextInt(); long sum = 0; for (int i = 0; i < n; i++) { long x = sc.nextLong(); if (x % 2 == 0) sum += x; } System.out.println(sum); } }`;
  const b = `import java.util.*; public class Main { // my code
    public static void main(String[] q) { Scanner in = new Scanner(System.in);
    int cnt = in.nextInt(); long total = 0; for (int j = 0; j < cnt; j++) { long v = in.nextLong(); if (v % 2 == 0) total += v; } System.out.println(total); } }`;
  const c = `import java.io.*; public class Main { public static void main(String[] a) throws IOException { BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    br.readLine(); String[] p = br.readLine().trim().split(" "); long s = 0; for (String t : p) { long v = Long.parseLong(t); s += (v & 1) == 0 ? v : 0; } System.out.println(s); } }`;
  const pairs = findSimilar([
    { id: 1, userId: 'u1', problemId: 'p', code: a },
    { id: 2, userId: 'u2', problemId: 'p', code: b },
    { id: 3, userId: 'u3', problemId: 'p', code: c },
  ], 0.8);
  assert.strictEqual(pairs.length, 1);
  assert.deepStrictEqual([pairs[0].a.submissionId, pairs[0].b.submissionId].sort(), [1, 2]);
});

test('razorpay csv: paid only, dedupe, name from notes, category filter', () => {
  const buf = fs.readFileSync(path.resolve(__dirname, '../../samples/participants-razorpay-sample.csv'));
  const all = parseParticipants(buf, {});
  assert.strictEqual(all.rows.length, 3);
  assert.strictEqual(all.skipped.notPaid, 1);
  assert.strictEqual(all.skipped.duplicate, 1);
  assert.strictEqual(all.rows[0].name, 'Aarav Sharma');
  const senior = parseParticipants(buf, { filterColumn: 'category', filterValue: 'Senior' });
  assert.strictEqual(senior.rows.length, 2);
});

test('csv export escapes formulas but keeps phone numbers', () => {
  const csv = toCsv(['a', 'b'], [['=HYPERLINK("x")', '+919800000001']]);
  assert.ok(csv.includes(`'=HYPERLINK`));
  assert.ok(csv.includes(',+919800000001'));
});

test('scoring', () => {
  const contest = { mcq: { marks: 2, negative: 0.5 } };
  const mcqs = [{ _id: 'a', correctIndex: 1 }, { _id: 'b', correctIndex: 0, marks: 4 }, { _id: 'c', correctIndex: 2 }];
  const s = mcqScore({ mcqAnswers: { a: 1, b: 2 } }, mcqs, contest);
  assert.deepStrictEqual(s, { score: 1.5, correct: 1, wrong: 1, attempted: 2 });
  const p = { points: 100, tests: [{ weight: 1 }, { weight: 1 }, { weight: 2 }] };
  assert.strictEqual(codingScoreFromTests(p, [{ verdict: 'AC' }, { verdict: 'WA' }, { verdict: 'AC' }]), 75);
});

test('class detection + seb hash', () => {
  assert.strictEqual(detectClass('public final class Solution {'), 'Solution');
  assert.strictEqual(detectClass('class X {}'), 'Main');
  assert.strictEqual(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
