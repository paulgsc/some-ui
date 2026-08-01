# The Shared-Workspace Doctrine

> Canonical reference for anything that wants to live in `some-ui-utils`,
> `@some-ui/shared`, or any future shared workspace.
> Lives in `packages/` because it is shared _judgement_ about shared code,
> not shared code itself — the UI analogue of
> [`extensions/common/GOOD_CITIZEN.md`](../extensions/common/GOOD_CITIZEN.md).

`some-ui-utils` is currently imported by dozens of workspaces across `apps/`,
`extensions/`, and `packages/ui/`. Its exports span roughly a dozen orthogonal
concerns — hooks, a WASM viewport engine, a websocket manager, a speech
queue, a component registry, string/date/array helpers — bundled into one
package. This doctrine exists because that bundling has a real, ongoing
cost, and every epic in milestone 14 (M14) reads this document before
deciding what moves, what stays, and what goes back where it came from.

---

## 0. Sharing is not free — the blast-radius argument

A util imported by _k_ workspaces is not "used in k places for free." It is
a promise, made to _k_ independent parties simultaneously, that any future
change will not break any of them. That promise has to be paid down on
every single edit to the shared code, forever — not just once at authoring
time.

Concretely: a semantic change to a shared export is only provably safe once
it has been checked against the assumptions of all _k_ consumers. Those
consumers were not written in coordination with each other — consumer `A`
may depend on a behavior that consumer `B` never exercises, or a `A` may
rely on precisely the timing/edge-case behavior that `B` would consider a
bug. The change is blocked until it is proven non-breaking against every
consumer, which in the worst case means reasoning about all `C(k, 2) =
k(k-1)/2` pairwise ways two consumers' assumptions could collide through
the shared code.

This is the **n-choose-k blast radius**: the cost of a shared export does
not grow linearly with its consumer count, it grows combinatorially with
the _interactions between_ its consumers. A workspace imported by 22
others isn't "22 times more useful" for free — it is a workspace where 22
independent parties each hold veto power over the next change, and where
verifying safety in the worst case means reasoning about pairwise
interactions between them, not just each one in isolation.

Sharing is a trade: it removes duplication once, and it adds a
verification tax on every change, forever after. The defense test below
exists to make sure that trade is only made when the one-time benefit
actually outweighs the recurring tax.

---

## 1. The defense test

An export must clear **all three** of the following to earn a place in a
shared workspace. Two out of three is not enough — a borderline case that
fails any one prong does not belong here.

1. **≥2 genuine, independent consumers.** "Genuine" means each consumer
   would independently re-derive equivalent logic if the shared code did
   not exist. A second import that is really a copy-pasted fixture, a
   Storybook demo, or a test-only helper does not count — it is not
   independent demand, it is one consumer wearing a second hat.
2. **A stable, rarely-churning contract.** The export's public shape
   (signature, return type, observable behavior) changes on a cadence of
   quarters, not sprints. Sharing amortizes its authoring cost across many
   silent, cost-free consumptions — a contract that churns constantly never
   gets to amortize; it just re-triggers the full blast-radius tax from
   Doctrine §0 on every change.
3. **Orthogonality to the other concerns co-located in the same package.**
   The export must not depend on incidental proximity to its neighbors —
   only on genuine conceptual overlap. `some-ui-utils` today co-locates a
   WASM viewport engine, a websocket manager, and a speech queue purely
   because they all needed "somewhere to live," not because they share a
   concern. That is the failure mode this prong exists to catch.

---

## 2. The de-hoist trigger

**Exactly one genuine consumer ⇒ the code returns to that consumer's
workspace.** No exceptions, no grace period for "it might get a second
consumer later."

Speculative sharing pays the blast-radius tax from Doctrine §0 before a
second consumer ever materializes — and often the second consumer never
does. The moment a change (a refactor, a consumer removal, a migration)
leaves an export with only one genuine consumer, that export moves back to
the sole consumer's workspace **in the same PR**, not as a tracked
follow-up. A de-hoist that is deferred is a de-hoist that never happens.

---

## 3. Decision matrix

Mirrors the risk-scoring style of #494. Score every proposed hoist, every
keep decision under review, and every de-hoist candidate:

| Question                                                                | Score |
| ----------------------------------------------------------------------- | ----: |
| ≥2 genuine, independent consumers today                                 |    +3 |
| Contract has been stable for ≥1 quarter (or since inception)            |    +2 |
| Concern is orthogonal to the other exports co-located in the package    |    +2 |
| Consumers span different apps/extensions, not sibling features of one   |    +1 |
| A consumer needs a divergent variant "just this once"                   |    -2 |
| Contract has churned more than once per sprint over the last quarter    |    -3 |
| Coupling to co-located exports is incidental / file-proximity only      |    -2 |
| Sharing was justified by "future reuse" with no current second consumer |    -4 |
| Only 1 genuine consumer remains                                         |    -5 |

**Interpretation:**

- Score ≥ 5 → keep hoisted.
- Score 0–4 → keep, but flag for re-review at the next census (S2).
- Score < 0, or the "only 1 genuine consumer remains" line fires → de-hoist
  now, per Doctrine §2. This line overrides every other positive score:
  it is not averaged in, it is a mandatory trigger.

### Worked example: a 2-consumer util

`useMeasureRect` is consumed by exactly two workspaces — say `packages/ui/chat`
and `packages/ui/nfl` — each computing rect measurements for unrelated
layout needs.

- ≥2 genuine independent consumers: **+3** (each derives it for a different
  reason; neither is a copy of the other).
- Contract stable since introduction: **+2**.
- Orthogonal to co-located exports (a measure/resize hook doesn't entangle
  with the websocket manager or speech queue living in the same package):
  **+2**.
- Consumers are different apps: **+1**.

Total: **+8** → keep hoisted. If, on inspection, one of the two "consumers"
turns out to be a Storybook fixture rather than production reliance, the
genuine-consumer prong fails outright (Doctrine §1.1) regardless of the
matrix total — the export has one real consumer and Doctrine §2 fires.

---

## 4. Companion policy: #494's characterize-before-refactor posture

This doctrine governs **whether** code should be shared. #494 (the legacy
hooks modernization initiative) governs **how** code that survives the
defense test is safely modified afterward: recover the observable contract
first (Understand), write characterization tests (Characterize), and only
then attempt mechanical, structural, or behavioral changes, in that order
of risk.

The two compose directly: an export that clears the defense test and stays
in a shared workspace is exactly the kind of code where #494's
characterize-before-refactor posture applies — its contract is depended on
by ≥2 parties by construction, so any change to it must follow #494's
process rather than being refactored freehand. An export that fails the
defense test and gets de-hoisted exits shared-workspace review entirely;
#494's process still applies to it, but as an internal concern of its new
single-consumer workspace, not as a shared-workspace obligation.

---

## 5. Applying this doctrine

- **New export proposed for a shared workspace:** run the defense test
  (§1) before merging. Fewer than 2 genuine consumers at proposal time ⇒
  it starts in the sole consumer's workspace; it is only hoisted once a
  second genuine consumer actually exists, never in anticipation of one.
- **Existing export under review (the S2 census):** score it with the
  decision matrix (§3).
- **Workspace scaffolding (S3):** must cite the keep/de-hoist decisions
  produced by applying this doctrine to the S2 census — scaffolding follows
  the decisions, it does not precede them.

---

## Non-goals of this document

This document is doctrine only. It moves no code, defines no workspace
scaffolding, and performs no census — see S2 (census) and S3 (workspace
scaffolding) for those.
