# Deploy & event-day runbook

## 1. What you need

| Piece | Recommendation |
|---|---|
| **Server** | One Ubuntu 22.04/24.04 VM. **Event day: 8 vCPU / 16 GB.** Practice and mock runs: 2–4 vCPU is fine. |
| **Domain** | Any domain or subdomain with an A record pointing to the VM (school subdomain, a cheap domain, or a free DuckDNS name). Caddy gets HTTPS automatically. |
| **Database** | MongoDB in the same `docker compose` stack (default). Atlas free M0 is fine for development but **not** for 500 live users (it is throttled). |

### Hosting options (cheapest first)
1. **Oracle Cloud Always Free.** Oracle's docs currently list Ampere A1 at **2 OCPU / 12 GB** total, plus 200 GB disk. That is enough for development, the mock test and the API + Mongo. It is too small to also judge 500 people at the final rush. Oracle can reclaim instances that stay idle for 7 days. ARM64 works: every image used here has ARM builds.
2. **Student credits** (Azure for Students, GitHub Student Pack offers, cloud trials). Check what is currently offered. A credit covering a few days of an 8-vCPU VM is all you need.
3. **Pay by the hour for the event only.** Create an 8 vCPU / 16 GB VM the day before, run the contest, take a backup, delete the VM. The cost is a few days of one VM, so check the provider's current hourly price.

**Split option:** run API + Mongo on the free VM and start extra `worker` processes on a second, bigger VM only during the contest. Expose Mongo to that VM only through the firewall, with auth enabled.

## 2. First deploy

```bash
ssh ubuntu@<vm-ip>
git clone <your-private-repo> codethon && cd codethon
cp .env.example .env && nano .env
```
Fill in:
```
NODE_ENV=production
JWT_SECRET=<node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
PUBLIC_URL=https://contest.yourdomain.in
CORS_ORIGINS=https://contest.yourdomain.in
DOMAIN=contest.yourdomain.in
ADMIN_EMAIL=you@genzis...      ADMIN_PASSWORD=<long password>
JUDGE_MODE=docker
JUDGE_CONCURRENCY=6            # vCPU - 2
```
Then:
```bash
bash scripts/deploy.sh          # installs Docker, builds sandbox, self-test prints 3, starts stack
```
Open the firewall for ports 80 and 443. On Oracle you need both the VCN security list **and** the instance's iptables. Visit `https://DOMAIN`, log in as the organiser, and import `samples/contest-sample.json` to try it out.

Update later with: `git pull && sudo docker compose up -d --build`. Logs: `sudo docker compose logs -f api worker`.

## 3. Capacity (measured, so you know what to expect)

These numbers come from a small test box: 2 cores running the load generator, a MongoDB-compatible test DB, the API and the judge together.

- **150 simulated candidates:** API p95 is about 60–230 ms for login, start, MCQ save, heartbeat and polling, with 0 errors.
- **300 candidates on the same 2 cores:** 0 errors. Latency rose to a few seconds because the judge used every core.
  - **Lesson:** keep 2 cores free for API + Mongo and give the rest to the judge. On event day, use 8 vCPU with `JUDGE_CONCURRENCY=6`.
- **Judge throughput** is about `JUDGE_CONCURRENCY / 2 s` ≈ 3 submissions per second with 6 slots. A 500-person contest with 4 problems makes roughly 5–10k submissions in total, peaking in the last 15 minutes. If the admin home shows the queue staying above ~50, start another worker on a second machine or lower the run limit per minute.

**Run your own load test on the real VM before the event** (staging data only):
```bash
sudo docker compose exec api node scripts/loadtest.js --url http://localhost:5000 --contest <slug> --users 500 --minutes 5
```

## 4. Backups
```bash
# before, during (every 30 min) and after the contest
sudo docker compose exec -T mongo mongodump --archive --gzip > backup-$(date +%F-%H%M).gz
# restore
sudo docker compose exec -T mongo mongorestore --archive --gzip --drop < backup-....gz
```
Copy backups off the VM (scp or Drive). Also export each contest from Settings → Export JSON.

## 5. Event-day runbook

**T-3 days**
- [ ] Final contest imported: MCQs, problems with hidden tests, each validated with a reference solution (Problems → Edit → "Run reference solution", must score full).
- [ ] Participants imported from the Razorpay CSV and the credentials CSV mailed out.
- [ ] SEB config made, uploaded, Config Key pasted into Settings (docs/SEB.md).

**T-1 day: mock test** with 20–50 real students on a practice contest using the same settings.
- [ ] Everyone can install SEB, open the link and log in.
- [ ] Violations look sane, with no false locks.
- [ ] Load test run, backup taken.

**T-0, 30 min before:** check that the admin home shows workers active, the queue is 0, the contest is published and the window times are right.

**During**
- Keep the Live monitor open.
- Unlock false positives. Use +Time for people with real outages.
- Watch the judge queue on the admin home.
- Run a backup every 30 min.

**After**
1. Leaderboard → Download CSV.
2. Integrity → run the similarity check and review pairs above 80%.
3. Review attempts with many violations before announcing winners.
