# The interview week: the Monday routine

A scheduled cloud session runs this every Monday (IW4, #2935). It writes the
week of mock interview that opens that day (`some-ui.interview-week/1`): an
invented company and role, five questions to answer by voice (four while
`docs/calls/` holds no call to ask about), and three teleprompter cards
to read. The essay on the week that ended comes later
(IW6, #2937).

This is a routine of its own, apart from Rust Rounds' `pnpm monday` (C277).
The two share the mailbox client, the week's dates and `render call-facts`.

Code does everything a model needn't decide (LEVERS, #2162). It chooses:

- each question's family and variant, rotated least recently asked first;
- each decision question's recorded call (`docs/calls/<ID>.json`);
- each card's source (an epic, a doc, an invariant) and situation.

It also fills the ids, dates and targets, checks the week and puts it. You
write only the words: the company and role, each question's prompt and
guidelines, and each card's script.

## Before you start

1. Work from `main` of `paulgsc/some-ui`, fetched back at least a week
   (`git fetch --shallow-since=<a week ago> origin main` on a shallow clone).
   Read its `CLAUDE.md`, then run `pnpm install --frozen-lockfile`.
2. `JOBS_MAILBOX_URL` and `JOBS_MAILBOX_TOKEN` are set in this environment.
   Never print the token, and never turn on shell tracing. If either is
   unset, stop: say so in the summary and put nothing.
3. `gh` must reach GitHub's search API, since `render call-facts` reads the
   week's epics through it.

Run every command below from `packages/ui/interview-week`, with a scratch
folder outside the checkout as `<run>`.

## Steps

1. **Pull:** `pnpm monday pull --to <run>`. It copies the mailbox's interview
   weeks (`brief/interview-week-…`) and prints one more command.
2. **Facts:** run the command `pull` printed. It writes `<run>/facts.json`:
   the epics that moved in the last week, each with its "Why".
3. **Prepare:** `pnpm monday prepare --from <run>`. It writes
   `<run>/bundle.json` and prints what it chose. The bundle's `next` is
   `null` when the mailbox already holds this week. Only in that case, write
   `{"schema":"some-ui.interview-monday-values/1","week":null}` and go to
   step 5.
4. **Write `<run>/values.json`** from the bundle alone, as "What you write"
   says.
5. **Finish:** `pnpm monday finish --from <run>`. It builds the week and
   checks it, then answers `ready` and writes it to `<run>/out`, or lists
   every problem. Fix exactly those problems in `values.json` and run it
   again. Never change the bundle, a fact it states, or the code to get past
   a problem.
6. **Put:** `pnpm monday put --from <run>`. `201` and `200` are success.
   Report any other answer in the summary and don't retry.
7. **Summarize:** the file put and its answer, the company and role, the
   questions and cards by id, and any file the bundle lists as `unread`. If
   nothing was owed, say so in one line.

## What you write

`values.json` is `{"schema":"some-ui.interview-monday-values/1","week":…}`:

```json
{
  "company": { "name": "…", "about": "…" },
  "role": { "title": "…", "about": "…" },
  "questions": [{ "id": "…", "prompt": "…", "guidelines": ["…"] }],
  "cards": [{ "id": "…", "script": "…" }]
}
```

Every object is strict. A field the bundle or code fills (a family, a
source, a date, a target) is refused there. Write one question for each of
the bundle's `questions` and one card for each of its `cards`, by id.

**The interview is faux** (owner, 2026-11-13). The company and role are
invented, and never a real employer, past or prospective.

- `company.name` is new: not one of `earlierCompanies`. `finish` also
  refuses the owner's own employers (from the résumé) and a list of large
  ones.
- A card's script may name what this repo runs on (GitHub, Cloudflare,
  Google Play), since it presents this repo's own work. No other text may
  name a real employer.

### The company and role

- `company`: a name of one to four words, and what it does in a sentence or
  two (`about`, 8 to 60 words).
- `role`: a title, and what the role owns in a sentence or two. Choose a
  role the owner's real work could answer for: building the full stack of a
  product, its phone app, its services and its tooling.

### A question

- `prompt`: the question as the interviewer asks it, 4 to 50 words. Word
  the bundle's `asks` for this company and role. Keep it to one question.
- `guidelines`: 2 to 5 lines, each 4 to 40 words, saying what a good answer
  covers for this role. The essay later reads the answer against them.
  - **Tell me about yourself, a time you…, strengths and weaknesses:** a
    clear structure (for a time you…, the situation, task, action and
    result), one concrete example, and how it bears on the role.
  - **Why this role:** something specific in this role, tied to work the
    owner has done.
  - **Decision:** the bundle's `call` is a real decision from this repo,
    recorded with what was chosen, the options, why it was gray and how to
    undo it. Ask about it in plain words, as an interviewer who read the
    pull request would, and as the variant `asks`: why this over the other
    options, what it cost, or what would undo it. Never quote the record
    back. The guidelines ask the answer to name the options, why this one
    was chosen, the trade-off, and what would undo it.

### A card

A card is a script the owner reads aloud, verbatim, after a cue. It
presents one piece of this repo's work: why it exists, what problem it
answers, what was decided and why. The skill trained is a natural read,
the kind that carries over to an ad read or a talk.

- Write from the card's `material` (an epic's "Why" and "Where we are", a
  doc, or an invariant's declaration) and its `situation`, which is where
  the read is given.
- **Voice:** first person, plain, spoken, as the owner would present the work
  to an interviewer or an audience. Never recite the source's text, its
  file names or its jargon. Say what the thing does for a person.
- **Length:** 150 to 300 words, so one to two minutes. `finish` counts them
  and sets the card's target from them, at 150 words a minute.
- **Breaths:** a line break where a breath belongs, each line at most 30
  words. A blank line between parts is fine.

## When it runs

The scheduled task fires every Monday at 03:41 Pacific
(`CRON_TZ=America/Los_Angeles 41 3 * * 1`), after the phone's new week
opens at Monday 00:00. Its prompt:

> Follow `packages/ui/interview-week/ROUTINE.md` on `main` of
> paulgsc/some-ui, exactly: the interview week's Monday routine. Write only
> the values it asks for, put what `finish` makes ready, and end with its
> summary.
