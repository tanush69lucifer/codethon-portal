# Contest data formats

The fastest way to build a contest is to write one JSON file and import it with Admin → **Import contest JSON**. You can also edit everything in the UI afterwards. See `samples/contest-sample.json`.

```jsonc
{
  "version": 1,
  "contest": {
    "title": "Codethon 2026 – Senior",
    "slug": "codethon-2026-senior",          // a-z 0-9 -, unique
    "category": "Senior",
    "instructions": "Markdown shown in the lobby",
    "startAt": "2026-10-21T04:30:00.000Z",   // UTC! 10:00 IST = 04:30Z
    "endAt":   "2026-10-21T07:30:00.000Z",   // late starters get less time
    "durationMin": 120,
    "published": false,
    "mcq": { "marks": 1, "negative": 0.25, "shuffleQuestions": true, "shuffleOptions": true },
    "coding": { "maxRunsPerMinute": 6, "submitCooldownSec": 20, "maxSubmissionsPerProblem": 30, "wrongSubmissionPenaltyMin": 0 },
    "proctoring": { "browserPolicy": "SEB_REQUIRED", "sebConfigKeys": [], "requireFullscreen": true, "blockPaste": true, "lockAfterViolations": 6 }
  },
  "mcqs": [
    { "text": "What prints?\n\n```java\nSystem.out.println(1 + 2 + \"3\");\n```", "options": ["123", "33", "6", "Error"], "correctIndex": 1, "marks": null }
  ],
  "problems": [
    {
      "title": "Sum of Even Numbers",
      "statement": "Markdown…", "inputFormat": "…", "outputFormat": "…", "constraints": "…",
      "points": 100, "timeLimitMs": 2000, "memoryMb": 256,
      "checker": "tokens",                    // tokens | exact | float
      "starterCode": "public class Main { … }",
      "samples": [ { "input": "5\n1 2 3 4 5\n", "output": "6\n", "explanation": "2+4" } ],
      "tests":   [ { "input": "…", "output": "…", "weight": 1 } ]
    }
  ]
}
```

Re-importing the same slug asks to **replace** it. That is only allowed before any candidate has started.

## Tips for coding problems

- **8–15 hidden tests per problem.** Include edge cases (n=1, max n, negatives) and give bigger tests a higher `weight`, so partial solutions get partial marks.
- **Time limits:** measure your reference solution with "Run reference solution", then set the limit to about 2–3× its slowest test. Java start-up is already covered by `JUDGE_JVM_GRACE_MS`.
- **Scanner vs BufferedReader:** say in the statement that big inputs need `BufferedReader`. `Scanner` on 10⁵ numbers is slow.
- **Output checking:** use `tokens` unless spacing matters. Use `float` for decimal answers.

## MCQ CSV (Admin → MCQs → Upload CSV)

```
question,a,b,c,d,answer,marks
"Which keyword is used to inherit a class?",implements,extends,inherits,super,B,2
```

- `answer` is a letter A–F or a number 1–6.
- Add columns `e,f` for up to 6 options.
- If `marks` is blank, the contest default is used.

## Participants CSV (Admin → Participants → Import Razorpay CSV)

Use the Razorpay **Payments export**, or any CSV with an email column.

| Column | How it's found |
|---|---|
| email | `email` (required) |
| phone | `contact` / phone / mobile |
| status | Only `captured` / `paid` / `success` rows are imported (untick "Only paid rows" for a manual list). |
| name | `name` column, else the `name` key inside the `notes` JSON, else the start of the email. |
| category | Optional filter. Set *Only import if column* = `category` and *equals* = `Senior`. This also reads keys inside `notes`. |

Duplicates by email are merged. Re-importing is safe: existing access codes are kept.

**Credentials CSV** has the columns `name, email, phone, access_code, contest`. Mail-merge it out, for example with Gmail plus a mail-merge add-on, or a small script.
