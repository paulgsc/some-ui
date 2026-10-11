---
name: amo-release-notes
description: Write the AMO release notes for an extension's open release PR (suspender-ledger today), the "Version notes" and "Notes for reviewers" that extension-release.yml submits to addons.mozilla.org, from the build evidence, then push them so the PR turns ready. Use when the user says /amo-release-notes, asks to write or fix AMO notes or reviewer notes, or a release PR body says "Notes needed" or "Notes are stale".
---

# amo-release-notes

You write one file, `extensions/<name>/release/notes.md`, and push it to the release
branch. `extension-release.yml` does everything else: it rebuilds from `main`, checks your
notes against the build, bumps the version, writes the changelog and `release.json`, and
marks the PR ready. A person then skims the PR and squash-merges it, and the sign job
submits exactly the text the PR showed.

The goal is a reviewer at Mozilla who can approve without guessing. Extensions here have
been disabled before over a reviewer's reading of the code (`extensions/docs/amo-compliance.md`
§1, B3), so the notes must be accurate first and complete second. Something vague is a
reason to ask for more information, and something false is a reason to reject.

## 1. Get the release branch and build it

```sh
git fetch --unshallow origin 2>/dev/null; git fetch origin main changeset-release/extension-suspender-ledger
git checkout -B changeset-release/extension-suspender-ledger origin/changeset-release/extension-suspender-ledger
pnpm install --frozen-lockfile
npx turbo run build --filter=@some-extension/suspender-ledger...
node extensions/scripts/amo-release.mjs evidence extensions/suspender-ledger
```

Full history matters: the evidence lists commits since the baseline release. If no release
PR is open, there is nothing to release (the build equals the last release), or the
workflow has not run yet. Say which, and stop.

The evidence prints the **content digest** your notes must name, the three **allowed
versions**, the manifest surface table, the built files that changed, and the commits.
`release/evidence.md` on the branch is the CI-computed copy. If its digest differs from
your local one, use CI's and say so in your reply: the PR is judged against CI's build.

## 2. Find out what actually changed

The built files are the truth. A commit list overstates (most commits never reach the
bundle) and understates (a dependency bump can change it with no source commit).

- For each changed or added file in `dist/`, find the source that produced it: the commits
  marked as touching shipped source, then `git diff <baseline commit> HEAD -- <paths>`.
  Read the diffs, not only the subjects.
- If a file changed and no source commit explains it, it is a toolchain change (a bundler
  or minifier bump). Say that plainly in the reviewer notes. Do not invent a feature.
- Check every statement you make against the code as it is now, including those you take
  from `amo-notes.md` or `extensions/docs/REVIEWER.md`. If a doc is wrong, fix the doc in
  your reply's proposal rather than repeating it. (Before 0.3.0 both still described a
  suspend page that had been deleted.)
- Look for anything a reviewer would want named even if nobody asked: new storage keys,
  new extension pages, code run in pages (`scripting.executeScript`), messages accepted
  from outside (`onMessageExternal`), anything that records URLs or titles, console output
  in content scripts. If code contradicts a claim in `amo-notes.md` (for example, a log that
  records a page title where the doc says origin only), stop and tell the user. That is a
  rejection waiting to happen, and fixing it is a code change, not a notes change.

## 3. Choose the version

There are three allowed versions: the next patch, minor and major. Choose by what a user or
reviewer meets, not by commit labels:

- **patch:** restores behavior the extension already promised, or changes internals,
  with nothing new to see or use and no permission or data change.
- **minor:** adds something users can see or use, or turns a feature that did not work
  into one that now does well enough to be a new experience.
- **major:** breaks something a user relied on: removes a feature, changes what a setting
  means, or drops data. (Pre-1.0 the same rule applies; 1.0.0 is not used for "it is
  stable now" without the owner saying so.)

A bug fix is patch even when the previous release was badly broken: the fix restores what
was promised. 0.2.1 → 0.3.0 is the worked example. The sweep fixes alone were patch work,
but the release also added the Diagnostics page and the kept-awake badge and banner, so it
was minor. If you are torn between two, choose the larger and say why in `rationale`.

## 4. Write `release/notes.md`

```markdown
<!-- amo-release
version: 0.3.0
content: sha256:<the digest from step 1>
rationale: Minor. <one or two sentences: what makes it this bump>
-->

## Version notes

- <Public. What a user notices, in plain words, one line per change. No file paths.>

## Notes for reviewers

<What the extension is, in one or two sentences, and where the stable facts live
(extensions/<name>/amo-notes.md in the source archive).>

What changed since <baseline version>:

1. <Each change a reviewer would check: what it does, the files, the APIs it uses, and
   what it stores or reads. Mention every changed file the evidence lists, or group the
   toolchain-only ones in one line.>

<One line saying the permission, content script and file comparison below is computed
from both builds.>
```

- Write plain text in "Notes for reviewers" (AMO does not render it). "Version notes" may
  use simple Markdown bullets.
- Do not repeat the generated tail: the job appends a computed comparison of every
  permission, the host list, content scripts, CSP, web-accessible resources, data
  collection and built files. Do not assert any of those in prose unless the table agrees,
  and never write "unchanged" for something the table marks changed.
- Leave room. AMO caps each field at 3000 characters, and the generated tail takes about
  1200 of the reviewer field. `check` (below) counts both.
- No placeholders (TODO, TBD, "(draft)"): the check refuses them.

## 5. Check, commit, push

```sh
node extensions/scripts/amo-release.mjs check extensions/suspender-ledger
git add extensions/suspender-ledger/release/notes.md
git commit -m "docs(suspender-ledger): AMO notes for <version>"
git push origin changeset-release/extension-suspender-ledger
```

`check` prints the exact reviewer text with the generated tail. Read it once as the
reviewer would. Commit only `notes.md`: the workflow regenerates every other file on the
branch, so other edits are lost.

The push starts `extension-release.yml`. A few minutes later the PR body should start with
"✅ Ready" and the PR should no longer be a draft. If it still says the notes are stale,
the body lists why. Fix the cause and push again.

## Notes written ahead of time

A feature PR to `main` may also carry `release/notes.md` for the next version, as the PR
that introduced this flow did for 0.3.0. The release PR then opens ready without a separate
step. The digest still has to match: any later push to `main` that changes the build makes
those notes stale, and the release PR says so.
