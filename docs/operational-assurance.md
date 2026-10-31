# Operational assurance: what the system promises about outcomes and work

The owner delegates the code (writing, review, merging) to agents and does not read it. Two
properties must hold across `paulgsc/some-ui` and `paulgsc/server` anyway, and the owner needs to
see whether they do without opening a file. This document is the grammar for both: the words,
the shapes, and what holds each of them. The record lives in one file,
`packages/assurance/src/ledger.json`; `pnpm check:assurance` holds it, and `/assurance` shows it.

Epic: #2199.

## The two properties

- **No silent failure** (bounded outcome accountability). Every obligation the system accepts
  reaches a stated outcome, or is seen to be overdue, within a declared bound. What is still
  unknown stays visible as unknown, never as success.
- **No wasted work** (bounded, attributable work). Every operation's work has a declared envelope
  (attempts, requests, rows, bytes, time), the envelope holds when things fail too, and a change
  to that work is measured against the same workload before it may claim to be cheaper.

Neither asks for an optimum. "Measured cheaper than the last version, at the same outcome" can be
shown; "the cheapest possible" cannot be, from these repositories, and nothing here claims it.

## Words

- **Obligation:** something the system has accepted and owes an outcome for: a file put to the
  mailbox, a pass the poller has started, a routine run that is due. A schedule creates one before
  anything is submitted: a run that never starts is still owed.
- **Operation family:** the obligations one user-visible promise covers, across every boundary
  they cross ("routine material reaches home" spans the Worker, D1, the poller and home's SQLite).
  The ledger is organised by family, never by function.
- **Acceptance and completion boundary:** the point where the system takes the obligation on
  (the Worker commits the item) and the point where it is discharged (home has a verified copy).
  An HTTP 200 is a boundary only if the family says so.
- **Outcome:** `succeeded`, `rejected`, `cancelled`, `expired` or `failed`, or still unresolved:
  `pending` or `indeterminate` (an effect that may or may not have happened, such as a write whose
  answer was lost). A timeout is `expired`, not `failed`, and not proof the write did not land.
  A caller's cancel is `cancelled`, not `expired`.
- **Envelope:** the bound on a family's work, per attempt and in aggregate, including retries,
  maintenance done while idle, and the work of the accountability itself.
- **Objective:** one requirement a family must meet, with a **claim** in the owner's words, a
  precise **requirement**, an optional numeric **bound**, and a **verdict**. It is a promise in
  the sense of CLAUDE.md ("Two kinds of pull request") that may not hold yet. Its ID shares the
  promise namespace (an area prefix and a number, never reused).
- **Verdict:** `holds` (a proof holds the claim over its whole family), `broken` (evidence
  contradicts it), or `unproven` (no evidence either way). Unknown is never compliant: `unproven`
  is reported, and counted, as not holding.
- **Evidence class:** `measured` (executed, with the numbers), `structural` (read from the code or
  its configuration), `derived` (arithmetic from stated assumptions), `unknown` (needs something
  not available, such as a production meter). A row's conclusion names its strongest class and
  its boundary in the same sentence.
- **Proof:** the test, check, type or lint rule that holds a `holds`, as a path the reader can
  open. A narrative is not a proof, and neither is an agent's agreement with another agent.
- **Watch:** how a running deployment is observed for this objective: `none`, `dashboard` (someone
  has to look) or `alert` (it tells the owner), and the live **checks** that run it, by name from
  the registry (below). A proof says the code holds the claim; a watch says whether anyone would
  learn that the running system stopped holding it. They are separate on purpose.
- **Process family:** one async process the owner relies on, named once in the registry
  (recording on the phone, transcription on home, a mailbox pass), whichever ledger families its
  promises sit in. Organised by what runs; the ledger's families are organised by promise.
- **Segment:** a stretch of a process, split where ownership changes: `ours` (this codebase's
  code), `foreign` (the browser's, Android's, a native plugin's, a container or service someone
  else wrote) or `network` (the hop between two places). Each is checked as cheaply as it allows.
- **Passive signal:** what real use leaves that shows a process working or failing: an outcome
  event (CK2), a row home keeps, a mark on the phone's "How it's running". It closes the gap of
  finding a failure only by walking the exact steps that reach it.
- **Check:** a way to run a process on purpose and see it work, at runtime. Its kinds:
  - **probe:** home runs it end to end with no phone and no person (a known clip transcribed);
  - **phone check:** the phone runs it with no person (the microphone opens and is let go);
  - **guided check:** the phone runs it with its person (say a phrase), the only kind that
    proves the physical chain;
  - **journey:** scripted taps through a flow on a real WebView, on an emulator in CI;
  - **monitor:** a rule the tests check over generated traces, checked again on every real step
    of the shipped app; it reports and never changes behaviour.
- **Trace:** the last events a machine saw before a monitor broke, sent home with the outcome.
  The machines are pure step functions, so a trace replays as a failing test (CK3).
- **Amendment:** a recorded change to what an objective requires. It is the only way an
  objective's requirement, bound or kind changes, a `holds` stops holding, or an objective retires.

## The requirement kinds

Each objective names the kind it instantiates. These are the kinds, from the recon of 2026-10-27 (OA8 added 2026-10-28, AS12, server#546; OA9 added 2026-10-30, AS17, some-ui#2281);
a new kind is added here first.

| Kind | Property          | Requirement                                                                                                                              |
| ---- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| OA1  | No silent failure | Every operation family that crosses a process or a network has an entry; a route or task with none is found by a check.                  |
| OA2  | No silent failure | Every accepted durable obligation is completed, explicitly refused, or recorded as overdue or unknown by its deadline.                   |
| OA3  | No silent failure | No success is shown before the completion evidence exists; a replay makes at most one logical effect, or a stated conflict.              |
| OA4  | No silent failure | Every independent part that fails is reported as itself; a second failure is never hidden behind the first, and partial success is kept. |
| OA5  | No silent failure | A cancel stops new effects at once; work already started is settled or reported as unknown.                                              |
| OA6  | No silent failure | Work that should have happened and did not, and a watcher that stopped watching, each read apart from a quiet, healthy system.           |
| OA7  | No silent failure | A release's evidence is complete: a skipped, empty or timed-out check reads as unproven, never as passed.                                |
| OA8  | No silent failure | Every error is counted, named and reaches the owner, with a bounded, sanitised record; a stated budget reads chronic errors apart.       |
| OA9  | No silent failure | A service the owner relies on is up a stated share of each period, measured from outside it; time no one can measure counts as down.     |
| RE1  | No wasted work    | Every external call's work is attributable to the operation that caused it, with the provider's own counts where it gives them.          |
| RE2  | No wasted work    | Attempts obey one budget per operation; an explicit zero retries means one attempt.                                                      |
| RE3  | No wasted work    | Every family has finite bounds on its requests, bytes, work and time for a whole operation, shared by its parts.                         |
| RE4  | No wasted work    | A page-sized read does work in proportion to the page, not to the history it skips.                                                      |
| RE5  | No wasted work    | On the same workload, deterministic work counts do not rise without an amendment.                                                        |
| RE6  | No wasted work    | A measurement with real noise has an allowed band and a ceiling; an inconclusive result is not a pass.                                   |
| RE7  | No wasted work    | Idle maintenance has its own budget.                                                                                                     |
| RE8  | No wasted work    | Shared quotas (D1's daily rows, say) are budgeted across every caller, with a reserve; unknown quota state defers optional work.         |
| RE9  | No wasted work    | What is kept grows by a stated model (per item, per day), and the record the owner keeps is never traded for space.                      |
| RE10 | No wasted work    | Retries, reconnects, replays and backlogs cannot starve later useful work.                                                               |

## The ledger

`packages/assurance/src/ledger.json` (`schema: "some-ui.assurance-ledger/1"`) is the one record. It is
JSON so the server's CI can read it as well (#2199, AS10). It holds:

- `families`: each with an `id`, a `name` in the owner's words, a `why`, the `paths` it spans
  (`some-ui:` or `server:` prefixed), the server route `modules` it owns, and its `objectives`.
- `synchronous`: every server route module that is not part of an asynchronous family, each with
  the reason. A request whose caller sees the outcome at once owes no later outcome.
- `stores`: every table and store the system keeps a person's data or state in, conveniences such
  as a theme aside (home's tables as `server:`, the mailbox's D1 tables as `mailbox:`, the
  phone's tables and stores as `phone:`), each with its `class` (`record`, `derived`, `cache` or
  `telemetry`), its `growth` (per what it grows, or, starting `bounded:`, the bound that keeps it
  constant), its `horizon` when something deletes from it, and the `family` that answers for its growth (RE9). Where each one is
  discarded or rewritten, with the owner's ruling, is `docs/discard-sites.md`.
- `processes` and `crosscutting`: the registry (below).
- Each objective: `id`, `kind`, `claim`, `requirement`, optional `bound` (`value`, `unit`, and
  which way is `tighter`), `verdict`, `conclusion` (one plain sentence, its boundary included),
  `evidence` (each with its `class`, what it `says` and a `ref`), `proof` (when it holds) or
  `tracked` (the issue that will make it hold), `watch` (`by`, an optional `ref`, and the
  registry's live `checks` that run it), an optional `comparison` (measured
  series, for the before and after), `amendments`, and `retired` once it no longer applies.

## The registry: every process family

The ledger says what is promised and what proves it in the code; the registry says what runs and
how each part of it can be seen working while it runs (CHECKS, #2369; CK1, #2380). It is the
ledger's `processes` section, so one reader and one check hold both, and the page that runs
checks (CK8) reads one row per process from it. A check result is `measured` evidence at
runtime; it never replaces a proof.

Each process has:

- `id`, `name` in the owner's words, and `why`;
- `serves`: the ledger families whose promises it carries, and `witnesses`: the objectives its
  signals and checks show holding, or not;
- `segments`: each with an `id`, a `name` (what happens, and whose it is), an `owner` (`ours`,
  `foreign`, `network`), where it runs, `on` (`phone`, `browser`, `home`, `mailbox`, `outside`
  for a service run by someone else, or `between` for a network hop), and the `paths` where this
  codebase's side of it lives;
- `signals`: each says what it shows and what it misses, and is `live` with a `ref`, or
  `planned` with the issue that builds it;
- `checks`: each with an `id`, a `kind` (`probe`, `phone-check`, `guided`, `journey`,
  `monitor`), a `name`, where it `runs` (`home`, `phone` or `ci`), the `segments` it exercises
  (`<process>/<segment>`, in any process: the guided check runs the phone's take, the send home
  and home's transcription), and `live` with a `ref` or `planned` with its issue.

`crosscutting` lists the ledger families no process carries because they span every one (the
checks themselves, home's errors, what is kept, whether home is up), each with why.

An objective's `watch.checks` names the live checks that run it (`<process>/<check>`), of a
process that witnesses it. A planned check watches nothing yet, so it may not be named.

The seams for the stories after CK1: a process `id` is the family an outcome event names (CK2);
a check's `<process>/<check>` is what a result is recorded against and what a Run button starts
(CK4–CK8); and a check that goes live sets its `ref`, and the objectives it runs name it in
their watch.

The first live check is home's transcription probe (CK4, #2383),
`home-transcription/transcription-probe`. Home runs it daily and when the operator asks
(paulgsc/server `routes::probes`: `GET /probes`, `POST /probes/transcription`, operator only;
`apps/www/src/lib/probes-client` is the client the page uses). A known clip goes through home's
real voice-note path as a probe note, under a subject no account holds, and each run's verdict,
time to transcript and engine are kept on home, append-only (`probe_run`, `probe_result`). The
server names that probe `transcription`. The hosted-speech probe, `hosted-speech/speech-probe`, is
still planned.

## What `pnpm check:assurance` holds

`scripts/check-assurance.ts`, rules in `packages/assurance/src/rules.ts`; in root `pnpm lint` and
pr.yml's `assurance` job, which CI Gate needs.

- **Shape:** every field above is present and of its kind, a list is a list, and a field the
  grammar does not know (a typo such as `retierd`) is an error. IDs are unique, promise-shaped,
  and not an ID an invariant already declares in a markdown file.
- **Proof or issue:** a `holds` names at least one proof, as `<repo>:<file>#<name>`. For
  `some-ui:`, the file is tracked and the name (at least three characters) appears in it. Anything
  else names a `tracked` issue. A `some-ui:` path in evidence, a watch or a family's `paths` exists.
  **A `server:` path is checked by the server, not here:** its `Assurance ledger` job reads this
  ledger from `main` on every server pull request and fails a `holds`' `server:` proof, or a
  `server:` path or ref, that is gone (server#557, objective GC4; the server's `docs/assurance.md`).
  It runs only on server pull requests, where `PR gate` makes a red run stop the merge (GC5), so
  a wrong `server:` path written here first shows on the next server PR.
- **Decisions:** an amendment's `decision` links to a paulgsc issue, pull request or comment.
- **What is kept (RE9):** a store is named `server:`, `mailbox:` or `phone:` and listed once, its
  family exists, and a family that keeps data has a live RE9 objective. Every table the mailbox's
  D1 migrations and the phone's schema (`device-backend/schema`) leave standing is a store, and a
  `mailbox:` store is one of those tables (`tablesLeft`, STORAGE5 #2226; the mailbox's reading is
  checked against SQLite running its migrations). Home's tables are held the same way, both
  directions, by the server's `Assurance ledger` job (server#557).
- **Coverage (OA1):** every module in `packages/contract-harness/routes.server.json` is in exactly
  one family's `modules` or in `synchronous`. A module placed that the server does not serve is a
  warning, not an error, so a module can be placed in its own PR ahead of the route snapshot that
  brings it, and a stale one is visible.
- **The registry:** every ledger family is served by a process or is `crosscutting` (one or
  the other), so a new family cannot land without its process. A process's `serves`, its
  `witnesses` (a live objective), each check's `segments` and each watch's `checks` name
  something that exists; a check exercises at least one segment of its own process; a network
  segment, and only one, runs `between`; a segment of ours does not run `outside`; a `live`
  signal or check names a `ref` and a `planned` one its issue; a `some-ui:` path exists; and a
  watch names only a live check of a process that witnesses the objective. Reported, not failed:
  a process with no signal, one no check runs (its own or another process's), and one that
  witnesses no objective yet. The server's job does not read the registry's `server:` paths yet.
- **The ratchet**, against the base branch's ledger (read leniently, so a change to this grammar
  can land): no objective disappears (it retires instead); a retired one stays retired;
  amendments are only appended. Each of these needs a new amendment on the objective: a `holds`
  that stops holding, a changed claim, requirement, kind or property, a weaker watch (a lower
  `by`, or a check it no longer names), a loosened
  or dropped bound, a retirement. A route module that leaves a family for `synchronous` needs a
  `decision` on its synchronous entry. An agent can still write an amendment, but not silently: it
  is in the diff, in review (`REVIEW.md`), and on the page, under the objective it changes.
- **What it cannot hold**, and review does: whether a conclusion's wording still matches its
  evidence, whether a proof really reaches its requirement, and an objective moved between
  families.

## What `pnpm check:branch-rules` holds

`scripts/check-branch-rules.ts`, rules in `packages/assurance/src/branch-rules.ts`: GC1, that `main`
in each repository still requires the checks that file lists. A repository setting can be switched
off with no diff, so it runs on every pull request (pr.yml's `branch-rules` job, which CI Gate
needs) and daily (`.github/workflows/branch-rules.yml`). It reads GitHub's `rules/branches/main`,
which lists only active rules, so a ruleset turned off reads as nothing required. A 5xx or
lost answer is asked once more, and an answer it still cannot get or read fails it as unknown,
not as broken. It cannot see who may bypass the rules: the probe
pull requests (some-ui#2210, server#529) showed the owner's own account is refused, and a later
bypass grant would show only to someone who looks.

## What `/assurance` shows

The page answers three questions separately, because each can be true while the others are not:

1. **Did it improve?** The before and after, on the same workload and the same contract.
2. **Is that what is running?** Today the page names the commit it was built from. Comparing that
   with what home and the Worker run comes with AS8.
3. **Does it hold now?** Live state from home. Until AS8 lands, the page says it cannot see this,
   and that is an unknown, not a pass.

The first screen is the promises, grouped by what the owner uses, broken first, retired last. A row
gives the claim, its verdict, and where it stands in a sentence. Opening it gives three depths:
what exactly it takes; the evidence with a before-and-after where something was measured (a growth
plot today; an obligation's timeline comes with AS7 and AS8); the receipt (proof and issue links,
who would notice, amendments). The page also says what it does not know: the watches that are
missing, and whether a failing check can block a merge (GC1). It shows counts per verdict,
never one score: "nine of ten" hides the one that matters.

The page's own words follow CLAUDE.md's "State in the person's terms": they live in one table
(`apps/www/src/lib/assurance/words.ts`) that a test holds to that rule. The ledger's claims and
conclusions are about the machinery itself (a mailbox pass, a request budget), so they name it;
they are written for the owner to read, in sentences, and review holds them to that.
