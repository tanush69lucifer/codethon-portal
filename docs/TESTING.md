# What was tested

Verified in a Linux workspace (`JUDGE_MODE=local`, MongoDB-compatible test database):

- `scripts/smoke.js`: 22/22 checks pass (login, single-device sessions, start, paper hides answers and hidden tests, MCQ autosave, Run, Submit, cooldown, violations, auto-lock, admin monitor, leaderboard, plagiarism, finish).
- Judge verdicts: AC, WA (partial score), TLE, MLE, RE and CE. A `public class Solution` also works.
- Browser run through the real UI with Playwright: candidate takes the test end to end, outside paste is blocked, and every admin tab renders.
- Codezis candidate UI: every candidate screen (login, dashboard, lobby, MCQ, coding run/submit, finish dialog, fullscreen gate, submitted) rendered against a mocked API with no page errors; the organiser console still renders.
- SEB checks: blocked without SEB. Allowed with a correct `ConfigKeyHash` header or JS-API hash. Blocked with a wrong hash or a foreign origin.
- Load test: 300 simulated candidates on one 2-core box with 0 errors.

**Not tested here:** the Docker sandbox itself (`JUDGE_MODE=docker`), because the workspace could not pull images. Run `scripts/deploy.sh` and its self-test on the VM before the event.

## Run the checks yourself

```bash
cd server
npm test                          # unit tests
npm run seed && npm run smoke     # end-to-end smoke (API + worker must be running)
npm run loadtest                  # simulated candidates
```
