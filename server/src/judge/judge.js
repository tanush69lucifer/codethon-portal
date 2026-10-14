// Turns raw sandbox results into verdicts and scores for one submission.
const config = require('../config');
const { execute } = require('./sandbox');
const { check } = require('../services/compare');
const { codingScoreFromTests, round2 } = require('../services/scoring');

const trimTo = (s, n) => (s && s.length > n ? `${s.slice(0, n)}\n…(truncated)` : s || '');

function verdictFor(result, problem, expected, hasExpected) {
  const limit = problem.timeLimitMs + config.judge.jvmGraceMs;
  const err = result.stderr || '';
  if (result.exitCode === 137 || result.exitCode === 124) {
    return result.timeMs >= limit - 50 ? 'TLE' : 'MLE';
  }
  if (result.exitCode === 153) return 'OLE'; // SIGXFSZ: output file too large
  if (/OutOfMemoryError/.test(err)) return 'MLE';
  if (result.exitCode !== 0) return 'RE';
  if (result.timeMs > limit) return 'TLE';
  if (!hasExpected) return 'OK';
  return check(problem.checker, expected, result.stdout) ? 'AC' : 'WA';
}

/**
 * RUN:    customInput != null -> one run, no expected output. Otherwise run all samples.
 * SUBMIT: hidden tests (falls back to samples if the problem has none).
 */
async function judgeSubmission(submission, problem) {
  const isRun = submission.kind === 'RUN';
  let cases;
  if (isRun) {
    cases =
      submission.customInput != null
        ? [{ input: submission.customInput, output: null }]
        : problem.samples.map((s) => ({ input: s.input, output: s.output }));
  } else {
    cases = problem.tests.length ? problem.tests : problem.samples.map((s) => ({ ...s, weight: 1 }));
  }
  if (!cases.length) cases = [{ input: '', output: null }];

  const { compileError, results } = await execute({
    code: submission.code,
    inputs: cases.map((c) => c.input),
    timeLimitMs: problem.timeLimitMs,
    memoryMb: problem.memoryMb,
  });

  const maxScore = isRun ? 0 : problem.points;
  if (compileError) {
    return {
      verdict: 'CE',
      compileOutput: trimTo(compileError, 8000),
      score: 0,
      maxScore,
      passed: 0,
      total: cases.length,
      tests: [],
      runOutputs: [],
    };
  }

  const tests = cases.map((c, i) => {
    const r = results[i] || { exitCode: 137, timeMs: 0, stdout: '', stderr: 'not executed' };
    return { verdict: verdictFor(r, problem, c.output, c.output != null), timeMs: r.timeMs, raw: r };
  });
  const passed = tests.filter((t) => t.verdict === 'AC' || t.verdict === 'OK').length;
  const firstBad = tests.find((t) => t.verdict !== 'AC' && t.verdict !== 'OK');
  const verdict = firstBad ? firstBad.verdict : tests.every((t) => t.verdict === 'OK') ? 'OK' : 'AC';

  let score = 0;
  if (!isRun) {
    const scoringProblem = problem.tests.length ? problem : { ...problem, tests: cases };
    score = round2(codingScoreFromTests(scoringProblem, tests));
  }

  return {
    verdict,
    compileOutput: '',
    score,
    maxScore,
    passed,
    total: cases.length,
    tests: tests.map((t) => ({ verdict: t.verdict, timeMs: t.timeMs })),
    // Only RUN results show program output (hidden test data never leaves the server).
    runOutputs: isRun
      ? tests.map((t, i) => ({
          input: trimTo(cases[i].input, 2000),
          expected: cases[i].output == null ? null : trimTo(cases[i].output, 2000),
          stdout: trimTo(t.raw.stdout, 4000),
          stderr: trimTo(t.raw.stderr, 2000),
          verdict: t.verdict,
          timeMs: t.timeMs,
        }))
      : [],
  };
}

module.exports = { judgeSubmission, verdictFor };
