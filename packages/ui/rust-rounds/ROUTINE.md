# Rust Rounds: the Monday routine

A scheduled cloud session runs this every Monday (RR18, #2693). It closes the
week that ended and opens the next one. For each week past its deadline, it
writes the essay that answers it (`some-ui.rust-essay/1`, the video home
renders with the owner's own takes). It also writes next week's exercise
(`some-ui.rust-week/1`, the brief and tickets the phone shows).

Code does everything a model needn't decide. Code reads the mailbox, decides
which weeks are owed an essay and whether each can be written yet, restates
every fact, chooses next week's topics, runs each program with a real rustc,
checks both files with the app's own parsers and puts them. You write the
values its bundle asks for: the essay's words and readings, and next week's
scenario and tickets. You decide nothing about either file's shape (LEVERS,
#2162).

You read text only, never audio. What the owner said reaches you as what home
heard in each take.

## Before you start

1. Work from `main` of `paulgsc/some-ui`. Read its `CLAUDE.md`, then run
   `pnpm install --frozen-lockfile`.
2. Run `rustc --version`. If rustc is missing, install a current stable one
   (`curl --proto '=https' -sSf https://sh.rustup.rs | sh -s -- -y`). Home
   records with `--edition 2024 -C opt-level=0`, and so does `finish`.
3. `JOBS_MAILBOX_URL` and `JOBS_MAILBOX_TOKEN` are set in this environment.
   Never print the token, and never turn on shell tracing. If either is
   unset, stop: say so in the summary and put nothing.

Run every command below from `packages/ui/rust-rounds`, with a scratch folder
outside the checkout as `<run>`.

## Steps

1. **Pull:** `pnpm monday pull --to <run>`. It copies the mailbox's weeks
   and essays (`brief`) and home's final record of each week past its
   deadline (the newest `index-rust-…` in `index`). It also copies what home
   heard in every take and pasted error those records name (`transcript`).
2. **Prepare:** `pnpm monday prepare --from <run>`. It writes
   `<run>/bundle.json` and prints what is owed:
   - `essays`: each week owed an essay, oldest first, at most two a run. Each
     ticket is restated with its answer: a take and what home heard in it,
     or a silence and how often the ticket was opened.
   - `waiting`: weeks owed an essay that can't be written yet, and why: home
     hasn't made the record final, or hasn't heard a take. A later Monday
     writes them. Never write an essay from a draft or a guess at a take.
   - `next`: next week's id, when it opens and is due, its `seeds` (the
     errors the owner pasted, each with what they said about it) and its
     `topics`. It is `null` when the mailbox already holds next week.
   - `due`: the concepts the decay record says are due a recheck next week,
     and why: `decayed`, `faded` (may have faded) or `not-yet-known`. It is
     read from the essays already written, so this run's own answers aren't
     in it yet.
3. **Write `<run>/values.json`** from the bundle alone, as "What you write"
   says.
4. **Finish:** `pnpm monday finish --from <run>`. It runs every program of
   next week with rustc, builds both files and checks them. It answers
   `ready` and writes them to `<run>/out`, or lists every problem. Fix
   exactly those problems in `values.json` and run it again. Never change the
   bundle, a fact it states or the code to get past a problem.
5. **Put:** `pnpm monday put --from <run>`. It puts next week first, then
   each essay, in `brief`. `201` and `200` are success. Report any other
   answer in the summary and don't retry.
6. **Summarize:** list each file put with its answer, each week `waiting`
   and why, any pasted error the bundle couldn't seed (`notSeeded`), and
   anything you skipped. If nothing was owed, say so in one line.

## What you write

`values.json` is
`{"schema":"some-ui.rust-monday-values/1","essays":[…],"week":…}`. It holds
one essay entry per week in the bundle's `essays`, and `week` set to `null`
when the bundle's `next` is `null`. Every object is strict: a field the
bundle or code fills (a company, a transcript, a date, a chart) is refused
there.

### An essay

`{"week","open","tickets":[…],"weeks","next"}`. `open`, `weeks` and `next`
are what is said over the opening, the chart and next week. The essay is a
public record, made to be rewatched: say what each thing is, in plain
sentences, and assume nothing remembered.

- `open`: the week's company, story and SLA, restated in a few sentences.
- `weeks`: what the chart shows. Code draws the chart and the role line from
  the decay record (RR19, #2695) and writes a sentence under it for each
  decay and fading, so say what the essays' SOLO levels show over the weeks,
  and the bundle's `due`, in plain words. Name no role, stage or level beyond
  SOLO's: the role line is code's, read across weeks by a stated rule.
- `next`: what next week comes back to, from the bundle's `next`.

Each ticket is
`{"id","bests":[…],"question","best","beside","answer":…,"dives":[…]}`,
with one ticket for each of the week's, by its id:

- `bests`: a best fit for each speak-to point, in order. Write it apart from
  the owner's answer, as if no answer existed. It is never called
  "correct".
- `question`: the ticket's spec and speak-to points, said.
- `best`: the best fits, said.
- `beside`: the best fit set beside the owner's answer, point by point, then
  the SOLO level and what it means on the scale.
- `answer`, for a ticket the owner answered:
  `{"marks":[{"mark","note"}],"solo":{"level","why"}}`. Give one mark per
  speak-to point: `covered`, `partly` or `missing`. `note` says what is
  partly there or missing, in a sentence. `solo.level` is 1 to 5 on the
  scale below, and `why` says in a sentence what the answer joined or didn't.
- `answer`, for a silence: `{"guess"}`, a guess at why, in a sentence or two,
  from what the bundle shows (how often it was opened, what earlier weeks
  covered). Say it is a guess.
- `dives`: two deep dives on the ticket's biggest gaps. A gap is `missing`
  over `partly` over `covered`, and every point of a silence is a gap. Each
  dive is `{"point","title","shows","code","said"}`: the point it goes into
  (from 0), a title, one to five lines the frame lists while it is said, an
  optional snippet, and `said`. `said` takes 2 to 5 minutes, 300 to 750 words,
  and `finish` counts them. Dive into a covered point only when no
  point has a bigger gap, and then go one step past the ticket.

**SOLO** (Biggs & Collis, 1982), as applied to explaining code by Lister et
al. (ITiCSE 2006), is the only judgement. Judge each answer against what the
week's references say: the Rust Reference, the Rustonomicon, the Async Book
and the Ownership Inventory, as the bundle names them. Never judge it by
whether it uses the right words.

1. **Prestructural:** misses the point, or restates the question.
2. **Unistructural:** one relevant aspect, on its own.
3. **Multistructural:** several relevant aspects, not tied together.
4. **Relational:** the aspects joined into one account of why the code
   behaves as it does and what that costs against the SLA.
5. **Extended abstract:** that account carried past the ticket, to the
   principle and where else it holds or breaks.

Nothing else judges the owner: no score, grade, rubric, level or praise of
your own, and no word that they were wrong. The marks, the comparison and
the SOLO level are the whole reading.

### Next week

`{"company":{"name","about"},"role","audience","story","sla":[{"what","target"}],"tickets":[…]}`.
It is laid out
by GRASPS: an invented company and its user story, an SLA the tickets answer
to, and the owner in a role on its team. The company is never a real one's
name, and not one of `earlierCompanies`. Code adds the id, the dates, the
references and the rubric.

`tickets` holds 2 to 4 tickets. Each is
`{"id","title","spec","figures","speakTo","program","expect","concepts","seed"}`:

- **Never trivia.** Each ticket's program does one of three things: it
  compiles but misses the SLA, it doesn't compile, or it fails only in some
  situations. The ticket asks the owner to explain why, what it costs and
  buys, and what they would do.
- `id`: a key like `TB-101`, in the company's letters, unique in the week.
- `figures`: facts the scenario states as given, such as a latency or a
  rate. Nothing measures them.
- `speakTo`: 2 or 3 speak-to points, a closed space for the answer.
- `program`: a whole binary with `fn main`. It uses only `std`, reads no
  input, touches no files or network, and finishes at once. Its lines end in
  `\n`, use spaces, not tabs, and are at most 40 columns wide, and it has at
  most 25 lines. The phone shows it unwrapped.
- `expect`: what rustc does with it, which `finish` checks:
  `{"outcome":"compile-error","code":"E0507"}` (with `code` null for an
  error with no code), `{"outcome":"prints","stdout":"…"}`, or
  `{"outcome":"panics"}`.
- `concepts`: every concept it touches, `{"id","name"}`. Name each of the
  bundle's `topics` in some ticket by the topic's own `id` and `name`, so
  the chart counts it under the same row every week. Reuse an earlier
  week's id and name for any other concept you name again.
- `seed`: on the ticket built from a pasted error, that error's `at` from
  the bundle's `seeds`. Each seed takes exactly one ticket: a small program
  that gives the same error for the same reason, set in the week's
  scenario. Code adds a sentence to its spec naming where it came from.
  Leave `seed` out on every other ticket.

**Topics** are code's (`src/lib/monday/topics.ts`). The bundle lists the
pasted errors first. Next come the concepts the decay record marks due a
recheck (RR19, #2695, the bundle's `due`): decayed first, then those that may
have faded, then those met and not yet known, each past its recheck on the
Leitner system. Last come the
areas of the references that no week touched longest ago. Write to the
topics the bundle gives, and never choose others in their place.

## When it runs

The scheduled task fires every Monday at 03:41 Pacific
(`CRON_TZ=America/Los_Angeles 41 3 * * 1`). By then the week due Sunday at
23:59 is final on home, and the phone's new week opens at Monday 00:00. Its
prompt:

> Follow `packages/ui/rust-rounds/ROUTINE.md` on `main` of paulgsc/some-ui,
> exactly: the Rust Rounds Monday routine. Write only the values it asks
> for, put what `finish` makes ready, and end with its summary.
