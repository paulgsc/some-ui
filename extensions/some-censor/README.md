# `some-censor`

Browser extension that profiles and mutates a vendor-controlled DOM. Built on
the `@some-extension/transport` kernel.

## Architecture at a glance

The content script runs four stages (Boundary Contract #1433, BC1–BC5):
`src/content/content.ts` → `Controller` (lifecycle: it follows the owner's
settings in `storage.local`, `src/lib/settings/`) →
`runtime/runtime.ts`, which folds every token through Core and hands the
resulting actions to the Actuator. The Layout table and Core are pure; the
Sensor turns the vendor DOM into the tokens Core sees, and the Actuator is the
only writer to it.

Four stages, each owning exactly one concern, in a straight line from
observation to write:

1. **Layout table** (`src/lib/content/layout/`) — a versioned, checked-in
   description of how YouTube's card DOM is shaped on each surface, built by
   crawling real (or fixture) pages rather than hand-written. It carries a
   schema version, so a reader can tell "this table is stale" apart from
   "this table's schema is one I do not understand."
2. **Sensor** (`src/lib/content/sensor/`) — wraps the mutation observer and
   navigation, classifies each observed node against the layout table
   (`layout/lookup.ts`'s `classifyShape`), keeps element ↔ card identity and
   the retry queue, and emits tokens Core consumes. A node the table cannot
   place is observed with `shape: "unknown"` and counted
   (`layout.unknown_shape`), never thrown or skipped.
3. **Core reducer** (`src/lib/content/core/`) — a pure, total
   `reduce(state, event) → { state, actions }`: no DOM, `browser.*`, clock,
   or randomness anywhere under `core/`. A card's view is decided by its
   evidence under the owner's boundary (`fsm.ts`'s `decide`, over the
   maturity estimate): absent, or plated when it is old enough. No gesture is
   an input (#1803); the boundary, set in the popup, is (#1807).
4. **Actuator** (`src/lib/content/actuator/`) — the only writer to the
   vendor DOM. It only executes the actions Core named: the `data-boyo`
   stamp (`absent` is `display: none` in `styles/content.css`) and the veil
   over a plated card.

## Browsers

Firefox is the product. The default `build` is the Firefox build: it is the one
CI checks with `web-ext lint`, and the one an AMO release is built from.

The Chromium build (`build:chromium`, `public/manifest.json`,
`src/lib/platform/*/api.chrome.ts`) exists only so Playwright can run the e2e
suite: Playwright has no supported way to load an unsigned extension into
Firefox and drive it (`tests/e2e/global-setup.ts`). It is never shipped, so a
gap that shows only in Chrome, such as the tab context menu Chrome does not
offer extensions, is not a bug.

The e2e suite (`pnpm test:e2e`) runs locally, not in CI. Its specs wait on real
time (poll timeouts from 4 to 15 s, 8 s by default, and three fixed sleeps),
so they are tuned to a developer machine. A green run covers the code
Firefox shares (the content script, the popup and the stylesheet), not the
Firefox manifest, its platform adapters or how Firefox renders the page. Run it
before pushing a change to the content script, the popup or the stylesheet.

> [!IMPORTANT] > **Story-governed as well as canon-governed — read both before editing this package.**
>
> - [`docs/quarantine-capsule.md`](./docs/quarantine-capsule.md) — _The
>   Quarantine Capsule_ — what the masking is **for**: the hazard model, the
>   temporal-boundary doctrine (`QD1`–`QD17`), the maturity classes
>   (`QM0`–`QM4`), and an honest map of where the implementation currently
>   contradicts them
> - [`docs/absent-plated-heard.md`](./docs/absent-plated-heard.md) — what the
>   extension looks like on youtube.com: every video absent, plated or heard,
>   and the design review that settled it (epic #1799)
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
