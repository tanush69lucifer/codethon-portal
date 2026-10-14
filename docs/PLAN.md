# 7-day plan (Tanush + Darshit)

The platform is already built and tested. The 7 days go into **hosting it, loading real content, SEB, a mock test and hardening**, not into writing features from scratch. Feature freeze is at the end of Day 5.

| Day | Tanush (owner, content, ops) | Darshit (backend, infra) |
|---|---|---|
| **1** | Run locally (README), click through as candidate and organiser. Decide the date and time, categories and marking. Get a VM + domain (docs/DEPLOY.md §1). | Read docs/BACKEND.md. Run locally with **Docker judge** (`JUDGE_MODE=docker`). `node scripts/smoke.js` must pass. Read `judge/runner.sh` + `sandbox.js` end to end. |
| **2** | Write contest JSON per category: 30 MCQs + 3–4 Java problems, 8–15 hidden tests each, plus a reference solution for every problem. | Deploy to the VM with `scripts/deploy.sh`, HTTPS working, backups script/cron. Change branding (name in `client/src/components/ui.jsx` Brand + `index.html` title). |
| **3** | Import contests, validate every problem with its reference solution (it must score full). Import the Razorpay CSV, check counts against Razorpay. | Make the SEB config (docs/SEB.md), test on Windows + macOS, paste the Config Key, upload `.seb`. Confirm that Chrome is refused. |
| **4** | Create a **mock contest** (copy settings, 5 MCQs + 1 problem). Invite 20–50 students. Write the candidate instruction mail (SEB install + link + access code). | Load test on the VM: `loadtest.js --users 500`. Tune `JUDGE_CONCURRENCY`, decide VM size for the day. Fix anything from the mock. |
| **5** | **Mock test.** Watch the Live monitor, note false positives, ask students what confused them. | Fix the mock issues. **Feature freeze tonight.** |
| **6** | Send the final credentials email. Publish contests (window times in IST!). | Scale the VM to 8 vCPU, take a fresh backup, dry run: 1 candidate per category end to end in SEB. |
| **7** | **Event.** Live monitor, unlock/+time, announcements. | On call: logs, queue depth, backups every 30 min. After: leaderboard CSV + similarity check. |

## Decisions already made (change in Settings if needed)

- **Java 21 only.** The code must have a `public class` (named `Main` by convention), read stdin and print stdout.
- **Timer:** per candidate, from Start, cut off at the window end. Answers autosave. A closed tab doesn't stop the clock.
- **Coding scoring:** best submission per problem, partial points by test weight. Run (samples or custom input) is free but rate-limited.
- **Ranking:** total score → coding score → time to last improvement (+ optional penalty minutes per wrong submission). Admin-only leaderboard.
- **Integrity:**
  - SEB required (blocks extensions, other apps and copy-paste).
  - The in-page detector logs tab-switch, fullscreen exit, overlays, extension iframes, known AI-tool DOM fingerprints, multi-screen and devtools.
  - Paste from outside the editor is blocked.
  - Auto-lock after 6 serious violations; an admin can unlock.
  - Similarity check runs after the contest.
  - One device per login.

## Open questions to settle on Day 1

1. What do Linux and Chromebook users do? SEB doesn't support them (see docs/SEB.md).
2. Negative marking for MCQs: yes or no, and how much?
3. Late-start policy: the window end currently cuts the time short. Is that OK, or do you want a longer window?
4. Who gets the SEB quit password on the day?

## Test checklist before the mock

- [ ] Candidate: login → lobby → start → MCQ answer survives refresh → code draft survives refresh → Run custom input → Submit → see score → Finish.
- [ ] Second login on another device kicks the first.
- [ ] Time over → auto-submitted; late answers rejected.
- [ ] Tab switch / exit fullscreen (in Chrome mock) → warnings → lock at the threshold → admin unlock works.
- [ ] Admin: +Time works (also reopens a timed-out attempt), Force submit, New access code.
- [ ] Wrong / TLE / MLE / CE solutions get the right verdicts in the Docker sandbox.
- [ ] Malicious code is contained: `Runtime.exec`, file writes, network, `while(true) new Thread()` all fail or get killed.
- [ ] Leaderboard CSV opens correctly in Excel/Sheets.

## After the Codethon: SaaS roadmap

| Phase | What | Why |
|---|---|---|
| 1. Multi-tenant | `orgId` on every model, org signup, `ORG_ADMIN` + `PROCTOR` roles, per-org branding and subdomain | Sell to other schools and companies |
| 2. Billing | Razorpay subscriptions per org (per-candidate or per-event pricing), usage metering from attempts | Revenue |
| 3. Languages | Python, C++, JS runner images (same tar-in/tar-out protocol) | Most buyers want more than Java |
| 4. Hiring features | Question bank + random sets per candidate, invite links, candidate reports PDF, ATS export | Hiring use case |
| 5. Proctoring+ | Optional webcam snapshots / face presence, screen-share check, desktop agent for non-SEB OSes | Higher-stakes exams |
| 6. Scale | Redis/BullMQ queue, autoscaled judge pool, Socket.IO live push, Mongo replica set | 5k+ concurrent |

Most of the architecture (stateless API, Mongo queue, independent workers) already fits this. Phase 1 is mainly adding `orgId` to queries.
