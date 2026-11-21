# Narration (draft): the tin bird, Kokoro

The host says the intro, each chapter line and the close; the narrator says each scene. Written to add what the picture can't show.

## intro

This is an open question, not an explainer. Two repositories, one person, and a crowd of agent sessions all merge into GitHub on a free personal account, and the merges wait in line. I'll show where the time goes, with the numbers, what we settled on, and why we still don't like it. If you know a better pattern that stays on GitHub and costs nothing, that's the part I'm asking for. It's as of November twenty-first, twenty twenty-six.

## P1

_Chapter one. The pain._

Start with one small pull request. It adds three records of decisions and one line to a ledger. Four JSON files, sixty-one lines, and no code at all.

## P2

_Chapter one. The pain._

Its main workflow ran for fifteen and a half minutes of wall time, and thirty-three runner-minutes in all. The Rust build, the Rust tests and four Rust dependency audits all ran, and all passed. The pull request touched no Rust, so none of them could have failed.

## P3

_Chapter one. The pain._

The job that decides what runs logged why. A filter called rust matched every one of the four files. Logged out, GitHub shows this log only to people signed in, so these lines are copied from it, word for word.

## P4

_Chapter one. The pain._

Here is the cause. Each list ends with a pattern meant to leave Markdown out. But the filter's default rule is that a file counts when any one pattern matches it, and 'not Markdown' matches nearly every file there is. So the Rust flag and the Node flag were on for almost every pull request.

## P5

_Chapter one. The pain._

Over the last thirty merged pull requests, that's a thousand of three thousand eight hundred runner-minutes, about a quarter, spent on jobs the change could not fail. Most of it is the Rust audits, on twenty-eight pull requests that had no Rust in them.

## P6

_Chapter one. The pain._

The next pull request changed one test fixture and spent eighty-six minutes. Seventeen of them couldn't fail. Thirty-nine more were the whole suite run again, because another branch had merged first and this one had to catch up.

## P7

_Chapter one. The pain._

Catching up is the bigger cost. Both repositories require a branch to be up to date before it merges. So each merge puts every open pull request behind, and each one runs its whole suite again with no change of its own. On one day, that was thirty-eight percent of the minutes here, and sixteen percent on the server.

## P8

_Chapter one. The pain._

In the list of runs it looks like this: the same pull request, run again and again, each time triggered by a synchronize that carried someone else's merge. And through all of it, every red check that day was a flaky test or a red we had planned. Review found every real fault.

## K1

_Chapter two. The constraints._

The tool built for this is GitHub's merge queue. It gives the same safety as up to date, without making each author re-run. GitHub's own page says who gets it: public repositories owned by an organization, or private ones on Enterprise Cloud. Both of ours belong to a personal account.

## K2

_Chapter two. The constraints._

So the answer has to keep four things. It stays on GitHub. It costs nothing. Main never goes red because two green branches met for the first time after merging. And CI stays, because it is what makes drift loud, even on the days it finds nothing.

## W1

_Chapter three. What we chose._

What we settled on has two parts. First, a branch does all its settling before it ever opens a pull request: review, fixes, and the checks a laptop can run. Then three to five settled branches land together in one bucket, so one CI round covers all of them. Second, fix the filter, so a change only runs the jobs it can fail.

## H1

_Chapter four. What still hurts._

Buckets trade one pain for others. A single flaky test now holds back several branches, not one. Reverting a feature means picking it back out of a bucket. Changes that come in pairs across the two repositories still go one after the other. And both repositories share one pool of runners, so under load the queue never clears.

## H2

_Chapter four. What still hurts._

This is the other half of the first pull request. The server change had to wait until the ledger line had landed, and then its own check against the other repository was run again before it could merge.

## Q1

_Chapter five. The open question._

Here's where I'd like help. A free organization seems to get the merge queue on public repositories, so moving there might be the whole answer, if nothing else breaks. Or a train: a bot branch that tests a batch once and then fast-forwards main. Or a looser gate on the pull request, the full suite on main, and a revert when it goes red. Each one gives something up. Which would you pick, or what are we missing?

## close

The audit's data and scripts, and the workflow file, are public in the some-ui repository, and the description links each. If you have a pattern that keeps all four constraints, the issue is open.
