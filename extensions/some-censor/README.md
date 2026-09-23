# `some-censor`

Browser extension that profiles and mutates a vendor-controlled DOM. Built on
the `@some-extension/transport` kernel.

## Architecture at a glance

**Target architecture, landing in stages — not yet the shipped runtime.**
Of the four stages below (Boundary Contract #1433, tracked as #1434–#1437),
three exist today as tested modules under
`src/lib/content/{layout,core,actuator}/`: the Layout table and Core reducer
are pure, and the Actuator is deliberately not (BC4, #1437 — it is the one
module allowed to touch the DOM or call `browser.*`). The Sensor (BC2,
#1435) has not landed; see
[`src/lib/content/layout/README.md`](./src/lib/content/layout/README.md) for
its status. The shipped
entry point (`src/content/content.ts` → `Controller` → `VideoManager`) does
not yet call `classifyShape`, `reduce`, or `createActuator` —
`VideoManager`/`DomHandle` still do the observing and writing this pipeline
is meant to replace.

Four stages, each owning exactly one concern, in a straight line from
observation to write, once wired:

1. **Layout table** (`src/lib/content/layout/`) — a versioned, checked-in
   description of how YouTube's card DOM is shaped on each surface, built by
   crawling real (or fixture) pages rather than hand-written. It carries a
   schema version, so a reader can tell "this table is stale" apart from
   "this table's schema is one I do not understand."
2. **Typed observations** — the not-yet-landed Sensor will classify a freshly
   seen node against the layout table (`layout/lookup.ts`'s `classifyShape`,
   which already exists) and hand the Core a typed `Observation`. A node the
   table cannot place comes back as an explicit `unknown` classification
   rather than an exception.
3. **Core reducer** (`src/lib/content/core/`) — a pure, total
   `reduce(state, event) → { state, actions }`: no DOM, `browser.*`, clock,
   or randomness anywhere under `core/`. Every card's generation (and, where
   the view matters, its version) correlates the async requests it issues; a
   whitelist or title-transform answer that no longer matches is discarded
   and recorded as `stale.discarded`. A superseded reveal timer, or any
   answer for a card that has already unmounted, is discarded silently
   instead — that gap is real, not documentation slack.
4. **Actuator** (`src/lib/content/actuator/`) — the sole module that writes
   to the vendor DOM or calls `browser.*`. It only executes the actions Core
   named; answers to what it does (a whitelist verdict, a title transform, a
   timer, a click) return to Core as inputs, never as calls back into it.

> [!IMPORTANT] > **Story-governed as well as canon-governed — read both before editing this package.**
>
> - [`docs/quarantine-capsule.md`](./docs/quarantine-capsule.md) — _The
>   Quarantine Capsule_ — what the masking is **for**: the hazard model, the
>   temporal-boundary doctrine (`QD1`–`QD10`), the maturity classes
>   (`QM0`–`QM4`), and an honest map of where the implementation currently
>   contradicts them
> - [`docs/decay-rings.md`](./docs/decay-rings.md) — the visual grammar for
>   maturity, and the rule that keeps it from colliding with the disclosure
>   ladder already on screen
>
> The canon below governs how this extension **observes** an unsettled vendor
> DOM; the story governs what it **does** with what it sees. The two answer
> different layers and neither substitutes for the other: a change that is
> sound estimation and a capsule breach is still a bug. A behavioural change
> that contradicts a `QD` number amends the story in the same commit, or does
> not land.

> [!IMPORTANT] > **Canon-governed workspace — read the canon before editing this package.**
>
> - [`docs/canon/dom-state-estimation-canon.typ`](../../docs/canon/dom-state-estimation-canon.typ) — _The Unsettled Surface_ — the observe/estimate/plan/act factorization this extension implements, and the impossibility results (§2) that forbid treating the vendor DOM as settled or fully observed
>
> These are not background reading. They are the documents this package is
> _derived_ from: modules here are checked against a Definition / Axiom /
> Theorem number, not against a feature spec. If a change cannot be traced to
> a canon citation, either it belongs somewhere else or the canon is missing
> an amendment that should land first.
>
> **Human reviewers:** a diff that changes behaviour governed by a canon and
> cites nothing is incomplete — ask for the citation.
> **LLM agents:** read the cited sections before proposing a change, and never
> silently renumber or rewrite a canon result. See
> [`docs/canon/README.md`](../../docs/canon/README.md) for the amendment
> discipline.
