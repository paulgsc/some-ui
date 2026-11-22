# CI audit, 2026-11-21

The evidence behind the open-question essay on merges (paulgsc/some-ui#3387):
which PR jobs ran where the PR's files couldn't fail them, and how much
runner time update-branch merges of main cost, in both repositories.

| File | What |
|---|---|
| `jobs.json` | The last 30 merged some-ui PRs: each run's jobs, their runner-minutes, whether the run was an update-branch merge, and whether the PR's files could fail the job (`cls.py`'s rules) |
| `today.json` | Every PR-triggered run on 2026-11-21 in some-ui and server, its runner-minutes, and whether its head was a merge of main |
| `collect.py`, `today.py`, `today2.py` | Pulled the raw runs from GitHub's API (`gh api`) |
| `cls.py`, `scls.py`, `over.py` | Classified each job: could this PR's files fail it? (`dirs.json`, `*-dirs.txt`: the workspaces each job builds) |
| `derive.py` | Wrote `jobs.json` and `today.json` from the raw pulls |

The raw pulls (about 2.3 MB, every step of every job) stay out of this
repository, which keeps small JSON. They were on paulgsc/some-ui's
`claude/ci-audit-data` branch, `prototypes/ci-audit/`.

Headline numbers, from `jobs.json`: 1,000 of 3,793 runner-minutes went to
jobs the PR couldn't fail. From `today.json`: update-branch reruns were
2,647 of 7,052 PR minutes in some-ui and 798 of 4,893 in server.
