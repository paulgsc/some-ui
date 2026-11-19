# The interview week: the Monday routine

A scheduled cloud session runs this every Monday (IW4, #2935). It writes the
week of mock interview that opens that day (`some-ui.interview-week/2`): an
invented company and role, five questions to answer by voice (four while
`docs/calls/` holds no call to ask about), and three teleprompter cards
to read, after the essay's opening (IW10, #3177). First, it writes the essay on each week that ended
(`some-ui.interview-essay/1`, IW6, #2937), the video home renders with the
owner's own takes.

This is a routine of its own, apart from Rust Rounds' `pnpm monday` (C277).
The two share the mailbox client, the week's dates and `render call-facts`.

Code does everything a model needn't decide (LEVERS, #2162). It chooses:

- each question's family and variant, rotated least recently asked first;
- each decision question's recorded call (`docs/calls/<ID>.json`);
- each card's source (an epic, a doc, an invariant) and situation;
- the essay's opening, always the week's first card, `opening`.

It also fills the ids, dates and targets, reads the owner's body of work at
the checkout's commit, checks the week and puts it. You write only the words:
the company and role, each question's prompt, guidelines and ready answer,
and each card's script.

## Before you start

1. Work from `main` of `paulgsc/some-ui`, fetched back two weeks, since
   `render call-facts` reads a commit from before the week that ended. On a
   shallow clone, run from the checkout's root:
   `git fetch --shallow-since="$(date -u -d '14 days ago' +%F)" origin main`.
2. Read its `CLAUDE.md`, then run `pnpm install --frozen-lockfile`, then
   build the package's workspace dependencies, which a fresh clone has
   none of: `npx turbo run build --filter="@some-ui/interview-week^..." --continue`.
3. `JOBS_MAILBOX_URL` and `JOBS_MAILBOX_TOKEN` are set in this environment.
   Never print the token, and never turn on shell tracing. If either is
   unset, stop: say so in the summary and put nothing.
4. `gh` must reach GitHub's search API, since `render call-facts` reads the
   week's epics through it.

Run every command below from `packages/ui/interview-week`, with a scratch
folder outside the checkout as `<run>`.

## Steps

1. **Pull:** `pnpm monday pull --to <run>`. It copies the mailbox's interview
   weeks and essays (`brief/interview-week-…`, `brief/interview-essay-…`) and
   prints one more command.
2. **Facts:** run the command `pull` printed. It writes `<run>/facts.json`:
   the epics that moved in the last week, each with its "Why", and the pull
   requests that merged.
3. **Prepare:** `pnpm monday prepare --from <run>`. It writes
   `<run>/bundle.json` and prints what it chose. The bundle's `next` is
   `null` when the mailbox already holds this week. Only in that case, write
   `{"schema":"some-ui.interview-monday-values/2","week":null}` and go to
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

`values.json` is `{"schema":"some-ui.interview-monday-values/2","week":…}`:

```json
{
  "company": { "name": "…", "about": "…" },
  "role": { "title": "…", "about": "…" },
  "questions": [
    { "id": "…", "prompt": "…", "guidelines": ["…"], "ready": { "…": "…" } }
  ],
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

### A question's ready answer

`ready` is the first rung of the question's ladder (IW8, #3175): the owner
studies it, reads it aloud, says it from its cues, and in time says it in
their own words. It is the normal way in, never a rescue. It is drawn from
the owner's body of work, and every claim names where it comes from.

Each question carries its `ground`, which code sets from its family, and
the two kinds are written differently:

- **An open question** (`ground: "open"`: about yourself, a time you…, why
  this role, strengths and weaknesses) is generic. Its answer follows the
  structure research agrees on for that kind of question (for a time you…,
  the situation, task, action and result; for about yourself, present,
  past, future, tied to the role), skewed to the owner: their path, how they
  work, what they build. It needn't speak about the code. A claim may cite
  a source, and `finish` doesn't require one.
- **A question about the body of work** (`ground: "work"`: a decision, today)
  is concrete and falsifiable. Every part of `answer` and `another` names at
  least one source, and every claim in it is one the source shows: what the
  thing is, what it's for, the options, the trade-off, the edge cases. Vague
  or made-up claims are what its poor answer shows.

For either kind:

- **Ground what you cite** in the bundle's `next.sources`, the body of work at
  `next.commit`: every recorded call, doc under `docs/` and declared invariant, and the
  pull requests merged and epics that moved in the last week, in both repos.
  An older pull request is cited through the call that names it. A doc or
  invariant is cited with its `path` as `next.sources` gives it. Pick the one or two pieces that answer the
  question best for this role, and read them (`gh pr view`, the file, the
  call's JSON) before you write. A source is cited as
  `{"kind":"pull","repo":"some-ui","number":3170}`, `{"kind":"issue",…}`,
  `{"kind":"call","id":"C266"}`, `{"kind":"doc","path":"docs/…"}` or
  `{"kind":"invariant","id":"RS1","path":"CLAUDE.md"}`. `finish` refuses one
  not in `next.sources`, and a week whose file would pass 64 KiB, the most
  home keeps. Never state a number, a count or a result the source
  doesn't show.
- **What a body-of-work answer communicates:** the architecture and
  infrastructure, a decision with its alternatives and trade-offs, the edge
  cases, and enough of a thread that an interviewer can ask the next
  question.
- **`answer`:** 3 to 6 parts, in the order they're said. Each part has a
  `label` (1 to 5 words, like "The situation" or "The options"), its `text`
  (6 to 80 words, first person, spoken), a `note` (4 to 40 words) on why this
  part works, and its `sources`. Together the texts run 60% to all of the
  question's target at 140 words a minute.
- **`another`:** a second good answer in a different shape (principle first,
  say, where `answer` tells a story), with a `note` on when that shape suits
  and its `sources`. From 40% to all of the target's words.
- **`poor`:** a poor answer someone might give (vague, no alternative named,
  a claim the work doesn't show, the strongest work left out), 15 to 120
  words, with 2 to 5 `notes` on why it's poor. Cite in `sources` whatever a
  note checks it against. It's for study, so it's plausible, never a joke.
- **`cues`:** 3 to 8 cues of 1 to 6 words each, in order, that bring back
  each part when said from cues.

The essay is to read the owner's own answer the same way: an open one for
its structure, a body-of-work one also against its sources, facts anyone can
look up, never a score. Today's essay (below) doesn't yet: it reads neither
`ground` nor `ready`, and still writes its own model answer. That waits on a
follow-up to IW6 (#3175).

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

### The essay's opening

The week's first card, `opening`, is the opening of this week's interview
essay, read in the owner's own voice (owner, 2026-11-17). The owner reads it
on the phone like any card; the essay then opens on that take, after the
brand. Left unread, the essay opens as it always has.

- **Two parts.** First the owner's moniker, `paulgsc`, in the first line
  ("I'm paulgsc."). Then what this week trains, in a sentence or two, from
  the card's `material`: the week's questions, and what last week's essay
  pointed to next.
- **No assessment.** No rating, score or grade, no "how ready am I", no
  pass or fail, and no finish line. The practice is ongoing: there's always
  another week. `finish` refuses a script that assesses.
- **Length:** 25 to 90 words, so about 10 to 35 seconds, a breath a line.

## The essay on the week that ended

Run this before the week's steps, from `packages/ui/interview-week`, with
`<run>/essay` as its folder. Code reads home's final record of each week
past its deadline, what home heard in each take **with its words**, and runs
IW3's measures (fillers, pauses, mumbling, pace, length; a read's misreads,
pauses mid-phrase, pace variation and lead-in). It also draws the faults
chart. You write only the judged half of each answer and the words said.
You read text only, never audio.

1. **Pull:** `pnpm essay pull --to <run>/essay`. It copies `brief`'s
   interview weeks and essays, home's newest interview index
   (`index-interview-…`) and the transcripts of every take it names.
2. **Prepare:** `pnpm essay prepare --from <run>/essay`. It writes
   `bundle.json` and prints what is owed:
   - `essays`: each week owed an essay, oldest first, at most two a run.
     Each question and card is restated with its answer: a take, what home
     heard in it and its `measured` faults, a silence (a take in which home
     heard nothing said is one too), or `unheard`: a take home couldn't make
     out (garbled, or home failed to hear it), which the essay reads as if
     it was left unanswered. `chart` is the faults over
     the weeks, as code counts them.
   - `waiting`: weeks owed an essay that can't be written yet, and why (a
     take not heard yet, or heard without its words). A later Monday writes
     them. Never write an essay from a guess at a take. A take home couldn't
     make out never holds a week back.
     If `essays` is empty, skip to the week's steps.
3. **Write `<run>/essay/values.json`** from the bundle alone, as "What you
   write in an essay" says.
4. **Finish:** `pnpm essay finish --from <run>/essay`. It builds each essay
   and checks it with the format's own parser, then answers `ready` and
   writes it to `out`, or lists every problem. Fix exactly those problems in
   `values.json` and run it again. Never change the bundle or the code to
   get past a problem.
5. **Put:** `pnpm essay put --from <run>/essay`. It puts each essay in
   `brief` as `interview-essay-<week>.json`, where home reads it and renders
   it. `201` and `200` are success. Report any other answer in the summary
   and don't retry.

The summary lists each essay put with its answer, and each week `waiting`
and why.

### What you write in an essay

`values.json` is
`{"schema":"some-ui.interview-essay-values/1","essays":[…]}`, one entry per
week in the bundle's `essays`. Every object is strict: a field code fills (a
transcript, a fault, a count, the chart) is refused there.

**No score and no grade** (owner, 2026-11-13). Say what was there and what
was missing; never rate the answer, and never call the model answer
"correct". **No real employer:** the company and role were invented, and
`finish` refuses an employer's name anywhere you write.

An essay is `{"week","open","questions":[…],"reads":[…],"weeks","next"}`:

- `open`: the invented company and role, restated in a few sentences.
- `weeks`: what the chart shows, in plain words: counts week by week, which
  went down and which up. Never a total.
- `next`: `{"said","topics"}`, what next week comes back to (at most five
  topics), from the faults that stood out.

Each question is `{"id","question","model","beside","answer"}`:

- `question`: the question and what a good answer covers, said.
- `model`: a model answer that meets the guidelines, in the first person,
  from the owner's real kind of work, written apart from their answer. Never
  call it correct, and never name a real employer.
- `beside`: the model answer set beside the owner's, guideline by guideline.
- `answer`, for a take: `{"judged","marks","said"}`.
  - `judged` fills IW3's judged schema: `star` (situation, task, action,
    result), each `{"mark","quote"}`, the mark `covered`, `partly` or
    `missing`, and the quote a few words of the transcript that show it, or
    `null` when missing; `hedges`, each quoted ("I think maybe"); and
    `decision`, for a decision question only, otherwise `null`: the
    `options` named, each quoted, and `why`, `tradeOff` and `undo` marked
    as above. Code turns them into faults; count nothing yourself.
  - `marks`: one per guideline, in order, `{"mark","note"}`, `note` a
    sentence on what is partly there or missing.
  - `said`: the take's faults said plainly, the measured ones from the
    bundle's `measured` (say the counts as they are) and the judged ones.
- `answer`, for a silence: `{"guess"}`, a guess at why, said as a guess.
- `answer`, for an `unheard` take: leave it out. Code says that something
  was said and couldn't be made out; never read anything into it.

**Filler counts** come from home's verbatim decode, which keeps most fillers
but can miss some late in a long take (#2937). Until the owner has checked
it against real takes, say a filler count as "at least".

Each read is `{"id","card","answer"}`:

- `card`: where the read is given, said.
- `answer`, for a take: `{"change","said"}`. `change` is one plain sentence
  on what to change next time, from the measured faults (a flat pace, a
  pause inside a phrase, a slow lead-in, a misread word). `said` says the
  faults and the change.
- `answer`, for a card left unread: `{"guess"}`; for an `unheard` read,
  leave it out.

The week's opening card (`opening`, IW10) is not a read: the bundle leaves
it out of `reads`, and the essay plays the owner's take of it, as it is,
first after the brand. Write nothing for it, and never count or judge it.

## When it runs

The scheduled task fires every Monday at 03:41 Pacific
(`CRON_TZ=America/Los_Angeles 41 3 * * 1`), after the phone's new week
opens at Monday 00:00. Its prompt:

> Follow `packages/ui/interview-week/ROUTINE.md` on `main` of
> paulgsc/some-ui, exactly: the interview week's Monday routine. Write only
> the values it asks for, put what `finish` makes ready, and end with its
> summary.
