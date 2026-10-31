# @some-ui/job-desk

The Jobs wing's contract: the files a daily routine and the phone pass to each
other through Google Drive's `some-ui jobs/` folders. There's no server and no
UI here, only the shapes, the policy, a sample and a checker.

| File                                    | Written by        | Read by     | Drive folder             |
| --------------------------------------- | ----------------- | ----------- | ------------------------ |
| `digest-<day>.json`, job-digest/1       | the daily routine | the phone   | `some-ui jobs/Brief`     |
| `decisions-<day>.json`, job-decisions/1 | the phone, shared | the routine | `some-ui jobs/Decisions` |
| `scouts-<stamp>.json`, job-scouts/1     | the phone, shared | the routine | `some-ui jobs/Scout`     |

Every run, one that stops early included, also leaves `run-jobs-<stamp>.json`
(`routine-run/1`, `"routine": "jobs"`, `JobsRunSchema`) in the mailbox's `run`
folder only, never in Drive: when it ran, what it read, the digest it added,
and what it couldn't do (`ROUTINE.md` §9).

A second decisions share on one day is `decisions-<day>-2.json`, then `-3`
(`decisionsFileName`).

The files also pass through the mailbox (`apps/mailbox`, a Worker and D1
database), beside Drive. `ROUTINE.md` §0.4 says how the routine uses it, and
`apps/mailbox/README.md` who may put and read what.

- `src/policy.ts` sets how many picks each track gets, where to search, the
  queries, and the titles never picked. The owner set it on 2026-10-17. Its
  `RUN_HOSTS` are the hosts whose links the run opens itself; with a link
  anywhere else, the scout form asks for the posting's own text
  (`linkReach`).
- `ROUTINE.md` is the routine's instructions. The scheduled task's prompt
  points at it, so a change to the run is a reviewed change here.
- `src/sample.digest.json` (`sampleDigest()`) is a complete digest on made-up
  postings: the template a run copies, and what the web builds' `/job-run`
  page reads to a viewer, since the real digests stay on the phone.
- `pnpm --filter @some-ui/job-desk queue --day <today> <files>` reads every
  digest and decisions file named and prints the picks still open, those that
  lapse today (`queueOf`), and each track's free slots: a run adds picks only
  into those (`MAX_OPEN_PICKS`). A pick stays open until I pass it or debrief
  it and share that, or until it lapses, untouched for `LAPSE_DAYS` days.
- `pnpm --filter @some-ui/job-desk check <file>` checks any of the three files,
  or a run record, the way the phone will read it, after a build. It prints
  `[]` when the file is ready to upload. A run record is also held to its file
  name, to what its outcome means, and to problems said in my terms
  (`runFindings`).

The files are append-only by convention: a later one adds to what an earlier
one said, and the routine never replaces a digest.

## A ChatGPT prompt for scouts

When ChatGPT recommends a job, I file it as a scout (Jobs › Scout). When the
run can't read a scout's posting on a board, it takes the place and posted
date from the scout's Location and Posted, then the company, title and
anything I left blank from the text I pasted, never from a summary, and it
scores my fit against the résumé itself (`ROUTINE.md` §3). A posting whose
page shows no date can still be picked, and the pick says it is undated. So I keep this
prompt in ChatGPT: it hands me the posting first, and its own fit analysis
after, which stays out of the scout.

```text
When you recommend a job to me, start with one block I can paste as it is,
with these lines in this order:

Title:
Company:
Location:
Posted: the date the posting shows, or "not shown"
Pay: as the posting states it, or "not shown"
Link:
Description: the posting's description, word for word as its page shows
it, with nothing summarized, shortened or added

Take every line from the posting itself. If you can't see the posting's own
text, say so instead of writing the block.

After the block, give your analysis of how I fit, apart from it. I don't
paste that part.
```

The link goes in the form's Link, the title and company in Title and company,
the location in Location, the posted date in Posted ("Not shown on the page"
when it says "not shown"), and the whole block in Posting text.
