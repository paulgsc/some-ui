# @some-ui/job-desk

The Jobs wing's contract: the files a daily routine and the phone pass to each
other through Google Drive's `some-ui jobs/` folders. There's no server and no
UI here, only the shapes, the policy and a checker.

| File                                    | Written by        | Read by     | Drive folder             |
| --------------------------------------- | ----------------- | ----------- | ------------------------ |
| `digest-<day>.json`, job-digest/1       | the daily routine | the phone   | `some-ui jobs/Brief`     |
| `decisions-<day>.json`, job-decisions/1 | the phone, shared | the routine | `some-ui jobs/Decisions` |
| `scouts-<stamp>.json`, job-scouts/1     | the phone, shared | the routine | `some-ui jobs/Scout`     |

- `src/policy.ts` sets how many picks each track gets, where to search, the
  queries, and the titles never picked. The owner set it on 2026-10-17.
- `ROUTINE.md` is the routine's instructions. The scheduled task's prompt
  points at it, so a change to the run is a reviewed change here.
- `pnpm --filter @some-ui/job-desk check <file>` checks any of the three files
  the way the phone will read it, after a build. It prints `[]` when the file
  is ready to upload.

Indeed gives a run no stable key for a posting, so `fingerprint()` names one by
company, title and location. Everything is append-only: a later file adds to
what an earlier one said and never restates it, and the routine never replaces
a digest.
