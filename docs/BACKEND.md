# Backend guide (for Darshit and Tanush)

Everything you need to work on the server without reading all of it first.

## 1. Architecture

```
 Candidate browser (SEB or Chrome)          Admin browser
   React + Monaco + detector                React admin panel
          │  HTTPS (REST/JSON, same origin)        │
          ▼                                        ▼
   ┌──────────────── Caddy (TLS) ────────────────────┐
   │                api  (src/index.js)              │  stateless, can run N copies
   │  auth · candidate · admin · public routes       │
   └───────────────┬─────────────────────────────────┘
                   │ Mongoose
                   ▼
              MongoDB  ◄──────── worker(s) (src/worker.js)
   users, contests, mcqs, problems,      claim QUEUED submission (atomic findOneAndUpdate)
   attempts, submissions (= job queue),  → docker run codethon-java-runner (tar in / tar out)
   proctorevents                         → verdicts + score → write back → update best score
```

Design decisions (and why):

| Decision | Why |
|---|---|
| **MongoDB is also the judge queue** (`submissions.status = QUEUED → RUNNING → DONE/ERROR`) | No Redis/RabbitMQ to run. Atomic claim makes multiple workers safe. Easily handles ~10 submissions/s. Swap to BullMQ later if needed. |
| **Polling, not WebSockets** | Candidates poll their own submission (~1 s), admin monitor refreshes every 5 s. Simpler, survives flaky networks, works fine at 500 users. |
| **Own Java judge (Docker) instead of Judge0** | One small image, ARM + x86, no extra services, full control over limits. Job goes in as a tar on stdin and results come out as a tar on stdout, so no shared folders. |
| **Server-authoritative timer** | `attempt.deadlineAt` is set on start. Every write checks it (+30 s grace). Client timer is display only. |
| **Single device per login** | `user.sessionNonce` rotates on login. Old JWTs fail with `SESSION_REPLACED` within ~10 s. |
| **API serves the built client** | Same origin, so there's no CORS and SEB config is simpler. |

## 2. Code map

```
server/src/
  config.js            every env var (read this first)
  db.js                mongoose connect
  app.js               express app: helmet, CSP, rate limits, routes, static client
  index.js             API entry; bootstraps admin from ADMIN_EMAIL/ADMIN_PASSWORD
  worker.js            judge worker entry (loop, concurrency slots, stale-job requeue)
  middleware/auth.js   JWT sign/verify, sessionNonce check (10 s cache), requireRole
  middleware/seb.js    Safe Exam Browser Config-Key verification
  models/              User, Contest, Mcq, Problem, Attempt, Submission, ProctorEvent
  routes/auth.routes.js       /api/auth
  routes/candidate.routes.js  /api/c       (CANDIDATE only)
  routes/admin.routes.js      /api/admin   (ADMIN only)
  routes/public.routes.js     /api/public  (SEB config download, info)
  judge/sandbox.js     runs judge/runner.sh in docker (or locally in dev)
  judge/judge.js       verdict per test, score, RUN vs SUBMIT behaviour
  services/scoring.js  MCQ score, best-score update, leaderboard + tie-break
  services/compare.js  output checkers: tokens | exact | float
  services/plagiarism.js  winnowing similarity on normalised Java tokens
  services/participants.js  Razorpay CSV parsing/import, access codes, CSV export
  utils/http.js        ApiError, asyncHandler, send, validate(zod), errorHandler
server/scripts/        seed.js, smoke.js, loadtest.js, createAdmin.js
judge/runner.sh        what runs inside the sandbox container
```

Conventions:
- Success `{ ok: true, data }`, error `{ ok: false, error: { code, message, details? } }`.
- Wrap handlers in `asyncHandler`, throw `new ApiError(status, CODE, message)`, validate bodies with `validate(zodSchema)`.
- Never send `correctIndex`, hidden `tests`, `accessCode` or other candidates' code to a CANDIDATE route.
- Wording in the UI and API: "flag / violation / review", never "cheater".

## 3. Data model

| Collection | Key fields | Notes |
|---|---|---|
| **users** | name, email (unique), phone, role `ADMIN\|CANDIDATE`, passwordHash (admin), accessCode (candidate, select:false), sessionNonce, isActive, meta | Candidates are created by CSV import. |
| **contests** | title, slug, category, instructions, startAt, endAt, durationMin, published, `mcq{marks,negative,shuffleQuestions,shuffleOptions}`, `coding{maxRunsPerMinute,submitCooldownSec,maxSubmissionsPerProblem,wrongSubmissionPenaltyMin}`, `proctoring{browserPolicy,sebConfigKeys[],requireFullscreen,blockPaste,lockAfterViolations}`, sebConfigFile | One contest per category. |
| **mcqs** | contestId, order, text (md), options[2-6], correctIndex, marks? | |
| **problems** | contestId, order, title, statement/inputFormat/outputFormat/constraints (md), points, timeLimitMs, memoryMb, checker, starterCode, samples[{input,output,explanation}], tests[{input,output,weight}] | Tests live inside the doc. Keep the total under ~10 MB. |
| **attempts** | contestId+userId (unique), status `NOT_STARTED\|IN_PROGRESS\|SUBMITTED\|LOCKED`, startedAt, deadlineAt, submittedAt, mcqOrder, optionOrders, mcqAnswers{mcqId:origIdx}, codeDrafts{pid:code}, coding{pid:{score,max,submissionId,at}}, lastImprovementAt, violations, lastSeenAt, focused, browser{seb,userAgent,ip,screen}, extraMinutes | Created at import, which is what assigns a candidate to a contest. |
| **submissions** | kind `RUN\|SUBMIT`, contestId, problemId, attemptId, userId, code, customInput, status, verdict, score, maxScore, passed, total, tests[{verdict,timeMs}], compileOutput, runOutputs[] (RUN only), workerId, timestamps | This is also the queue. |
| **proctorevents** | contestId, attemptId, userId, code, severity, counted, at, meta | Small numbers/strings only. Never typed or pasted text. |

## 4. API reference

All routes are under `/api`. Auth uses the `Authorization: Bearer <jwt>` header.

### Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | /auth/login | `{email, code}` (candidate) or `{email, password}` (admin) | Returns `{token, user}`. Rotates sessionNonce. 20 tries / 10 min per IP+email. |
| GET | /auth/me | | |
| POST | /auth/logout | | Invalidates all sessions of the user. |

### Candidate (`/api/c`, role CANDIDATE)
| Method | Path | Notes |
|---|---|---|
| GET | /contests | My contests + attempt status |
| GET | /contests/:cid | Lobby: rules, counts, attempt, `browser{seb,verified,reason}`, sebConfigUrl |
| POST | /contests/:cid/start | `{screen}` → starts or resumes. Checks window, SEB policy, creates the shuffled order. |
| GET | /contests/:cid/paper | MCQs (shuffled, no answers), problems (samples only), saved answers/drafts/best scores, deadlineAt, serverNow |
| PUT | /contests/:cid/mcq/:mcqId | `{choice: originalOptionIndex \| null}` |
| PUT | /contests/:cid/drafts/:pid | `{code}` autosave |
| POST | /contests/:cid/problems/:pid/run | `{code, input: string \| null}` → 202 `{submissionId}`. null = run samples. Rate limited per minute; 503 if queue > 400. |
| POST | /contests/:cid/problems/:pid/submit | `{code}` → 202 `{submissionId}`. Cooldown + max count. |
| GET | /contests/:cid/problems/:pid/submissions | My SUBMIT history |
| GET | /submissions/:sid | Poll result (+queuePosition while queued) |
| POST | /contests/:cid/events | `{focused, events:[{code,t,meta}]}`. Heartbeat + proctor signals. Returns `{status, violations, deadlineAt}` and may return LOCKED. |
| POST | /contests/:cid/finish | Submit the whole test |

Every exam action (`paper`, `mcq`, `drafts`, `run`, `submit`) goes through `activeContext()`, which:
1. loads the contest and attempt,
2. auto-submits if the deadline plus grace has passed,
3. rejects LOCKED or SUBMITTED attempts,
4. enforces the SEB policy.

### Admin (`/api/admin`, role ADMIN)
| Area | Endpoints |
|---|---|
| Contests | `GET/POST /contests`, `GET/PATCH/DELETE /contests/:cid`, `GET /contests/:cid/export`, `POST /contests/import[?replace=1]`, `POST/DELETE /contests/:cid/seb-file` |
| MCQs | `GET/POST /contests/:cid/mcqs`, `PATCH/DELETE /mcqs/:id`, `POST /contests/:cid/mcqs/bulk-csv` (multipart `file`, `replace=1`) |
| Problems | `GET/POST /contests/:cid/problems`, `GET/PATCH/DELETE /problems/:id`, `POST /problems/:id/validate {code}` (reference solution dry-run) |
| Participants | `GET /contests/:cid/participants`, `POST /contests/:cid/participants/import` (multipart `file` + optional `preview=1`, `emailColumn`, `nameColumn`, `phoneColumn`, `statusColumn`, `onlyPaid`, `filterColumn`, `filterValue`), `POST /contests/:cid/participants {name,email,phone}`, `GET /contests/:cid/participants/credentials.csv` |
| Attempt actions | `POST /attempts/:aid/reset-code`, `/logout`, `/unlock {resetViolations}`, `/extra-time {minutes}`, `/force-submit`, `DELETE /attempts/:aid` (only NOT_STARTED), `GET /attempts/:aid` (events + submissions) |
| Live | `GET /contests/:cid/monitor`, `GET /contests/:cid/events` (latest MED/HIGH) |
| Results | `GET /contests/:cid/leaderboard`, `GET /contests/:cid/leaderboard.csv`, `POST /contests/:cid/plagiarism {threshold}`, `GET /submissions/:sid` (with code) |
| System | `GET /system` (queue depth, workers seen in the last 5 min, avg wait/run) |

## 5. Judge internals

1. `POST run|submit` inserts a `submissions` doc with status QUEUED.
2. `worker.js` loop: `findOneAndUpdate({status:'QUEUED'}, {status:'RUNNING', workerId}, {sort:{createdAt:1}})`. JUDGE_CONCURRENCY slots per process. Jobs stuck in RUNNING for more than 3 min are re-queued.
3. `judge.js` picks the cases:
   - RUN: the custom input, or all samples.
   - SUBMIT: hidden tests, falling back to samples if there are none.
4. `sandbox.js` tars `<Class>.java` and `tests/i.in`, then runs:
   ```
   docker run --rm -i --network none --cpus 1 --memory <max(768, mem+384)>m --memory-swap same
     --pids-limit 160 --read-only --tmpfs /tmp:rw,nosuid,size=256m --cap-drop ALL
     --security-opt no-new-privileges --ulimit nofile=256 --log-driver none
     -e SRC_FILE -e MAIN_CLASS -e N_TESTS -e TL_SEC -e MEM_MB ... codethon-java-runner
   ```
   The image runs as uid 65534 (nobody). A hard kill fires after `compile + N × (TL + 1) + 20 s`.
5. `runner.sh` (inside the container):
   - compiles with `javac`, using a 25 s timeout,
   - runs each test with `timeout -s KILL TL java -Xmx<mem>m -Xss64m -XX:+UseSerialGC`,
   - limits output files with `ulimit -f`,
   - records `i exitCode wallMs`,
   - writes the results back as a tar to stdout.
6. The verdict for each test (`verdictFor`):

   | Result | Verdict |
   |---|---|
   | exit 137/124 and time ≥ limit | TLE |
   | exit 137/124, under the time limit | MLE (container OOM) |
   | exit 153 | OLE |
   | stderr contains `OutOfMemoryError` | MLE |
   | any other nonzero exit | RE |
   | wall time > limit | TLE |
   | otherwise | checker decides AC or WA |

   The limit is `timeLimitMs + JUDGE_JVM_GRACE_MS` (600 ms by default, to cover JVM start).
7. Score = `points × passedWeight / totalWeight`. Only RUN returns stdout/stderr. SUBMIT returns verdict and time per test, never the hidden data.
8. `recordBestScore()` is an atomic conditional update, so the best score only goes up. `lastImprovementAt` feeds the tie-break.

**Capacity math:** one submission with about 10 small tests takes ~1.5–3 s of one core (javac ~0.7 s plus JVM start ~0.1–0.3 s per test). Throughput ≈ `slots / avg seconds`. Set `JUDGE_CONCURRENCY = cores − 2` so the API and Mongo keep two cores. Add more worker machines by pointing more `worker.js` processes at the same Mongo.

## 6. Proctoring signals

The detector lives in `client/src/proctor/detector.js` and is batched by `useProctor.js`. The full list of codes and severities is `EVENT_CODES` in `candidate.routes.js`.

- Counted towards auto-lock (one count per code per 5 s): TAB_HIDDEN, FULLSCREEN_EXIT, MULTI_SCREEN, EXTENSION_IFRAME, KNOWN_FINGERPRINT, OVERLAY_NODE.
- Logged only: WINDOW_BLUR, PASTE_BLOCKED, COPY_BLOCKED, CONTEXT_MENU, SHORTCUT_BLOCKED, DEVTOOLS_SUSPECTED, FOREIGN_SHADOW_ROOT, DOM_INJECTION, NOT_SEB, NETWORK_OFFLINE, PAGE_RELOAD.
- `lockAfterViolations` (0 = off) sets the attempt to LOCKED. An admin can unlock it, add time or force-submit from Live monitor.
- Paste: outside text is blocked. Text the candidate copied inside the editor can be pasted back.
- The browser alone cannot see a second phone or laptop, or a separate desktop app window when SEB isn't used. That is why the plan is SEB + signals + similarity check + human review.

## 7. Security checklist (already done)

- helmet + strict CSP (`frame-ancestors 'none'`), JSON body limit, per-session and per-IP rate limits, login limiter.
- zod validation on every body. ObjectId checks on params. Everything is scoped to the caller's own attempt.
- bcrypt for admin passwords. Access codes are 8 characters from a 31-character alphabet (about 8.5×10¹¹ combinations) and rate-limited.
- Hidden tests, answers and other candidates' code are never in candidate responses (`smoke.js` asserts this).
- The sandbox has no network, a read-only rootfs, runs as non-root, has all caps dropped, and is limited on pids, memory and CPU.
- Credentials and results CSVs escape spreadsheet formulas.

**Known trade-offs:**
- Access codes are stored retrievable (`select:false`) so admins can re-export them. Rotate them with "New code".
- The worker has `docker.sock`, which is root-equivalent on that VM. Use a dedicated VM.

## 8. Where to add things next

- **Another language:** add a second runner image plus a `language` switch in `sandbox.js`/`judge.js`. The `Submission.language` field already exists.
- **Live push instead of polling:** add Socket.IO in `index.js` and emit from `worker.js` via a Mongo change stream.
- **Multi-tenant SaaS:** add `orgId` to every model, an `ORG_ADMIN` role, and scope every admin query by `orgId`. See docs/PLAN.md.
