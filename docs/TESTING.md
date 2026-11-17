# What was tested

Verified in a Linux workspace (`JUDGE_MODE=local`, MongoDB-compatible test database):

- `scripts/smoke.js`: 22/22 checks pass (login, single-device sessions, start, paper hides answers and hidden tests, MCQ autosave, Run, Submit, cooldown, violations, auto-lock, admin monitor, leaderboard, plagiarism, finish).
- Judge verdicts: AC, WA (partial score), TLE, MLE, RE and CE. A `public class Solution` also works.
- Browser run through the real UI with Playwright: candidate takes the test end to end, outside paste is blocked, and every admin tab renders.
- Codezis candidate UI: every candidate screen (login, dashboard, lobby, MCQ, coding run/submit, finish dialog, fullscreen gate, submitted) rendered against a mocked API with no page errors; the organiser console still renders.
- SEB checks: blocked without SEB. Allowed with a correct `ConfigKeyHash` header or JS-API hash. Blocked with a wrong hash or a foreign origin.
- Load test: 300 simulated candidates on one 2-core box with 0 errors.
- Load test v2 (17 Nov 2026): **1,000 concurrent candidates, 0 errors**. Details below.

**Not tested here:** the Docker sandbox itself (`JUDGE_MODE=docker`), because the workspace could not pull images. Run `scripts/deploy.sh` and its self-test on the VM before the event.

## Load test v2: 1,000 candidates (17 Nov 2026)

Setup: one Windows laptop running the API (single Node process), a local MongoDB 9 and the load generator, all on the same machine. API only (`--nosubmit`), because the Docker judge needs Linux. Traffic was spread over 50 simulated client IPs.

| Run | Candidates | Arrival | API p95 | Errors | Result |
|---|---|---|---|---|---|
| Full mix incl. submit + poll (no judge) | 100 | 15 s ramp | 53 ms | 0 / 11,554 | PASS |
| Full mix incl. submit + poll (no judge) | 300 | 15 s ramp | 68 ms | 0 / 34,489 | PASS |
| API only | 1,000 | all in the same second | 4.2 s | 0 / 12,090 | FAIL (latency) |
| API only | **1,000** | **20 s ramp** | **211 ms** | **0 / 12,270** | **PASS** |

Per endpoint at 1,000 candidates with a 20 s ramp (ms):

| Endpoint | p50 | p95 | p99 |
|---|---|---|---|
| login | 23 | 151 | 203 |
| start | 45 | 305 | 377 |
| paper | 37 | 252 | 332 |
| mcq save | 14 | 227 | 297 |
| heartbeat | 7 | 14 | 22 |

What it means:
- Nothing failed at any load. The only problem was latency when all 1,000 candidates hit login/start in the same instant, because the API runs on one core.
- Spreading arrivals over 20 seconds removed it completely. Planned fix: a random 0-20 s jitter before Start in the lobby, and running the API on all cores (Node cluster / PM2).
- **Still to test:** the judge under load (`--endrush` with `JUDGE_MODE=docker`) on the event VM.

Reproduce:
```bash
node scripts/loadtest.js --contest demo-senior --stages 1000 --minutes 2 --ramp 20 --ips 50 --nosubmit
```

## Run the checks yourself

```bash
cd server
npm test                          # unit tests
npm run seed && npm run smoke     # end-to-end smoke (API + worker must be running)
npm run loadtest                  # simulated candidates
```
