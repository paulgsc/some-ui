# The daily jobs run

A scheduled task runs this every morning at 07:52 Pacific, in a fresh session
with the Indeed and Google Drive connectors and a checkout of
`paulgsc/some-ui`. It reads my résumé and what I said about yesterday's picks,
searches Indeed on two tracks, and leaves one file in Drive: today's digest.
The phone opens that file, and later runs read it back to see what was
already picked.

The run writes to Drive only. It changes nothing in the repo: no commits, no
pushes, no PRs. A posting that needs a résumé composition that doesn't exist
yet is proposed as a patch with `pr: null`, and I decide whether to write it.

The shapes are this package's schemas, and `src/__tests__/sample.digest.json`
is a complete digest to copy. The limits (picks per track, places, queries,
excluded titles, posting age) are `src/policy.ts`. When this file and the
policy disagree, the policy wins and this file is the bug.

## 0. Before anything

1. Read the Google Doc titled `README — Drive SOP` in My Drive. It is the rule
   for where files go, and its `some-ui jobs/` section holds the folder ids.
   Every Drive result's owner must be paulgathondudev@gmail.com; if one isn't,
   stop.
2. If the Indeed connector isn't available, stop and say so. Write no digest:
   a digest from yesterday's postings would read as today's.
3. List `some-ui jobs/Brief/`. If `digest-<today>.json` is already there,
   stop and say so. A digest is never replaced.

Today is the date in America/Los_Angeles.

## 1. The evidence

From the repo at `origin/main`, and from `paulgsc/server` at its `main` (a
shallow, read-only clone):

- `packages/ui/resume/src/react/generated/data.ts`: every composition, by
  variant, with its summary, skills, all project bullets, highlights, toolbox,
  education and additional experience. These variants are the only ones a
  `build` may name.
- `packages/ui/resume/src/canon/resume.meta.typ`: the provenance of each claim,
  the named gaps, and "Non-engineering employment history". I confirmed on
  2026-10-17 that its four jobs are true and may be cited: WIS (2024–present),
  CABA Design (2020–2023), Natera (2019–2020) and PayLocity (2017–2019).
- `packages/ui/resume/src/data/personal.typ`: location, work authorization and
  education.
- `packages/ui/resume/scripts/check-claims.mjs`: `FORBIDDEN_TERMS`, which never
  appear in a fit.

Every fit cites one of these. Its `source` names the repo and path
(`server · scripts/check_metric_contract.py`) or the job
(`personal · Natera, 2019–2020`). A fit restates a claim the evidence already
makes; it never adds one. A requirement the evidence doesn't meet goes in
`gaps`, and anything the posting asks for that I must not claim goes in
`dontClaim`.

Record both commits in `evidence`, and the some-ui commit as each build's
`ref`.

## 2. What I said since the last run

Every digest lists in `read` the Decisions and Scout files it took in. Read
every digest in `Brief/` and collect those names; the files in
`some-ui jobs/Decisions/` and `some-ui jobs/Scout/` that no digest names are
new. The phone offers a share again until I confirm it arrived, so a new file
can repeat one already read. Each debrief, outcome and disagreement carries an
`id`: skip one whose `id` any decisions file in `Decisions/` already carried
when it was read, and a voice note whose file name one already named. For
each new file:

1. Check it with the checker (step 8). One that fails is skipped and named in
   the summary, never guessed at.
2. Transcribe every voice note it names, with the transcriber this task's
   prompt carries. If it can't, carry on without the note and say so.
3. Take it in:
   - **Passed picks:** the reasons and notes tell me what to stop sending. A
     reason given twice is a rule for this run.
   - **Disagreements:** a set-aside posting I would have picked. Look it up
     again; if it is still open, it may be a pick today.
   - **Debriefs and outcomes:** how applying went and what came of it. Report
     them in the summary. Once there are 30 or more outcomes, compare them with
     the odds each pick was given and say in the summary whether the rubric
     reads high or low. Don't change the rubric yourself.

A pick is known by its fingerprint (each entry also names the digest day it
came from). When a later decisions file restates a pick, I changed my mind:
the newest entry is the decision that stands.

A posting picked in any earlier digest, or named in any decisions file, is
never picked again, unless a disagreement brought it back.

## 3. Search

For every query in `QUERIES` (the software list, then each adjacent family's)
and every place in `LOCATIONS`, call `search_jobs` with that `search` and
`location`, country `US` and job type `fulltime`. Each call returns about ten
postings.

Give each posting its `fingerprint()`. Postings with the same fingerprint are
one posting. The same company and title in several cities are one posting
too: keep the remote one, else the nearest to Berkeley. `seen` is the count of
distinct postings left.

The connector's job ids count up within this session and mean nothing in the
next one, so call `get_job_details` for every posting you might pick in this
same run.

## 4. Set aside

Set a posting aside, with a one-line `why`, when:

- its title matches `EXCLUDED_TITLE`, or its description has customer calls,
  phone duties, a sales quota, escalation calls or a support rotation. I never
  take customer-facing or phone roles. Solutions work qualifies only when it
  is integration or internal-tools building with no quota and no calls;
- it was posted more than `MAX_POSTING_AGE_DAYS` days ago;
- it is part-time, gig work, or a staffing program with relocation or
  repayment terms;
- it requires a security clearance or US citizenship. Work authorization is
  "Authorized to work in the US for any employer"; there is no clearance;
- it asks for five or more years, or a senior, staff or lead title;
- it was already decided (step 2). Count these in `seen`, but leave them out
  of `setAside`.

List at most `MAX_SET_ASIDE` (40) set-aside postings, those closest to being picked first.

## 5. Score

**Fit**, 0 to 1: list the posting's required qualifications, leaving out
"nice to have" ones. Score each 1 when a fit covers it, 0.5 when the evidence
is adjacent (the same skill in another setting), and 0 otherwise. Fit is the
total over the count, and `fitWhy` says "covers N of M requirements", counting
the halves as covered.

**Odds**, 0 to 1, the chance of a reply: start at 0.5, then

- −0.1 for each required year beyond two;
- +0.1 if posted in the last 7 days, −0.1 if 15 to 30 days ago;
- +0.05 if remote or within a commute of Berkeley;
- −0.1 if a computer-science degree is required with no "or equivalent";
  my degree is a B.S. in Mechanical Engineering;
- clamp to between 0.02 and 0.95.

`oddsWhy` names the factors that moved it. Both scores are judgments until the
outcomes calibrate them, and the digest says so by naming its reasons.

Rank each track's candidates by fit × odds and take up to `PICKS_PER_DAY`. On
the adjacent track, when two scores are within 0.05, prefer a family not yet
picked today. Fewer picks than the limit is fine; a weak pick is not.

## 6. The résumé for each pick

- **Build** when an existing composition already leads with the evidence the
  posting wants. Pick the variant whose summary and skills match the posting
  best, and a layout that takes contact details: `safe` by default, `classic`
  for a modern ATS (Greenhouse, Lever, Ashby), `conventional` for traditional
  employers (government, healthcare, finance) and `vanilla` for an old parser
  (Taleo, a legacy iCIMS form).
- **Patch** when none does. That is every adjacent pick until the data, QA and
  solutions compositions exist. Name the new `variant` (`data`, `qa` or
  `solutions`), a `fallback` existing variant to send meanwhile, `pr: null`,
  and in `change` what the composition would lead with, in a sentence or two,
  from evidence that exists.

## 7. The kit

- **Fields:** email, GitHub and portfolio from the identity block of
  `packages/ui/resume/src/data/resume.typ`, and location from `personal.typ`.
  Never a phone number or street address: I type those myself.
- **Answers:** work authorization ("Yes, for any employer") and sponsorship
  ("Not needed") when the form asks. Add nothing the evidence doesn't say.
- **Why:** a draft of at most 120 words, only when the form asks for one,
  built from the pick's fits.

## 8. Write it

1. Give each pick an `id`: three letters of the company and four hex digits
   (`blu-7f2a`), unique in the digest.
2. For each scout read in step 2, look the posting up with `search_jobs`,
   using its title words and the company. Use its `postingText` when it has
   one. The verdict is `agree` (and it becomes a pick when it outranks one),
   `disagree` with why, or `not-found`.
3. `read` names every Decisions and Scout file this run took in.
4. Save the digest as bare JSON to a scratch file and check it from the repo
   root (run `pnpm install` first if `node_modules` is missing):

   ```sh
   pnpm --filter @some-ui/job-desk build
   pnpm --filter @some-ui/job-desk check <file>
   ```

   It must print `[]`. Fix every finding and check again; never upload a
   digest with findings.

5. Upload it as `digest-<today>.json` into `some-ui jobs/Brief/`: bare JSON,
   `contentMimeType` `application/json`, `disableConversionToGoogleType`
   true. Confirm the result's mimeType is `application/json` and its fileSize
   equals the local file's byte count.

Never edit, move, rename or trash anything under `some-ui jobs/`. Triage
`Inbox/` per the SOP if it holds anything.

## 9. Summary

End with: each pick with its track, scores and résumé; how many postings were
set aside, by reason; what each new decisions file and voice note said; each
scout's verdict; the calibration note, once there are enough outcomes; and
anything skipped, with why.
