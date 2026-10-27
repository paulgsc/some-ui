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
  has to look) or `alert` (it tells the owner). A proof says the code holds the claim; a watch says
  whether anyone would learn that the running system stopped holding it. They are separate on
  purpose.
- **Amendment:** a recorded change to what an objective requires. It is the only way an
  objective's requirement, bound or kind changes, a `holds` stops holding, or an objective retires.

## The requirement kinds

Each objective names the kind it instantiates. These are the kinds, from the recon of 2026-10-27;
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
- Each objective: `id`, `kind`, `claim`, `requirement`, optional `bound` (`value`, `unit`, and
  which way is `tighter`), `verdict`, `conclusion` (one plain sentence, its boundary included),
  `evidence` (each with its `class`, what it `says` and a `ref`), `proof` (when it holds) or
  `tracked` (the issue that will make it hold), `watch`, an optional `comparison` (measured
  series, for the before and after), `amendments`, and `retired` once it no longer applies.

## What `pnpm check:assurance` holds

`scripts/check-assurance.ts`, rules in `packages/assurance/src/rules.ts`; in root `pnpm lint` and
pr.yml's `assurance` job, which CI Gate needs.

- **Shape:** every field above is present and of its kind; IDs are unique, promise-shaped, and are
  not an ID an invariant already declares in a markdown file.
- **Proof or issue:** a `holds` names at least one proof; each `some-ui:` proof path exists, and a
  `#name` after it appears in that file. Anything else names a `tracked` issue. (A `server:` path is
  checked by the server's CI, AS10.)
- **Coverage (OA1):** every module in `packages/contract-harness/routes.server.json` is in exactly
  one family's `modules` or in `synchronous`, and nothing there names a module the server no
  longer serves.
- **The ratchet**, against the base branch's ledger: no objective disappears (it retires instead);
  a `holds` stays `holds`; a bound does not loosen; the requirement and kind do not change; a
  retired objective stays retired; and amendments are only ever appended. Each of those changes is
  allowed only with a new amendment on that objective, naming the change, why, and the owner's
  decision (a link). An agent can still write one, but not silently: it is in the diff, in review
  (`REVIEW.md`), and on the page, under the objective it weakens.

## What `/assurance` shows

The page answers three questions separately, because each can be true while the others are not:

1. **Did it improve?** The before and after, on the same workload and the same contract.
2. **Is that what is running?** The commit the page was built from, against what is deployed.
3. **Does it hold now?** Live state from home. Until AS8 lands, the page says it cannot see this,
   and that is an unknown, not a pass.

The first screen is the promises, grouped by what the owner uses, with broken first. A row gives
the claim, its verdict, and the gap or proof in one line. Opening it gives three depths: the
conclusion in plain words; the comparison (a growth plot for work, a timeline for an obligation);
the receipt (commit, evidence and proof links, tracked issue, amendments). The page also says what
it does not know: the watches that are missing, and whether a failing check can block a merge yet
(AS9). It shows counts per verdict, never one score: "nine of ten" hides the one that matters.

Its words follow CLAUDE.md's "State in the person's terms": they live in one table
(`apps/www/src/lib/assurance/words.ts`) that a test holds to that rule.
