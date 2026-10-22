# @some-ui/job-desk

The Jobs wing's contract: the files a daily routine and the phone pass to each
other through Google Drive's `some-ui jobs/` folders. There's no server and no
UI here, only the shapes, the policy, a sample and a checker.

| File                                    | Written by        | Read by     | Drive folder             |
| --------------------------------------- | ----------------- | ----------- | ------------------------ |
| `digest-<day>.json`, job-digest/1       | the daily routine | the phone   | `some-ui jobs/Brief`     |
| `decisions-<day>.json`, job-decisions/1 | the phone, shared | the routine | `some-ui jobs/Decisions` |
| `scouts-<stamp>.json`, job-scouts/1     | the phone, shared | the routine | `some-ui jobs/Scout`     |

A second decisions share on one day is `decisions-<day>-2.json`, then `-3`
(`decisionsFileName`).

The files also pass through the mailbox (`apps/mailbox`, a Worker and D1
database), beside Drive. The routine puts each digest there once Drive has it,
and reads the mailbox's `decisions` and `scout` folders as well as Drive's
(`ROUTINE.md` §0.4, §2 and §8). Today nothing puts decisions or scouts in the
mailbox and nothing reads the digest from it; home and the phone take those
parts later. Voice notes never go through it.

- `src/policy.ts` sets how many picks each track gets, where to search, the
  queries, and the titles never picked. The owner set it on 2026-10-17.
- `ROUTINE.md` is the routine's instructions. The scheduled task's prompt
  points at it, so a change to the run is a reviewed change here.
- `src/sample.digest.json` (`sampleDigest()`) is a complete digest on made-up
  postings: the template a run copies, and what the web builds' `/job-run`
  page reads to a viewer, since the real digests stay on the phone.
- `pnpm --filter @some-ui/job-desk queue <files>` reads every digest and
  decisions file named and prints the picks still open (`openPicks`) and each
  track's free slots: a run adds picks only into those (`MAX_OPEN_PICKS`).
  A pick stays open until I pass it, archive it, or debrief it, and share that.
- `pnpm --filter @some-ui/job-desk check <file>` checks any of the three files
  the way the phone will read it, after a build. It prints `[]` when the file
  is ready to upload.

The files are append-only by convention: a later one adds to what an earlier
one said, and the routine never replaces a digest.
