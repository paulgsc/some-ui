// ═══════════════════════════════════════════════════════════════════════════
//  resume.meta.typ — commentary, provenance, and requirements-map analysis
//  behind resume.typ. Not the résumé; not built by the résumé pipeline
//  (see README.md — pnpm build only compiles resume.typ). Meant to be read
//  as source, the same way this repo's docs/canon/*.typ files are: no build
//  step required, the .typ *is* the artifact.
//
//  Why this file exists: an earlier draft of resume.typ carried this
//  material inline — the motivation behind each engineering decision, and
//  a table scoring the repo against a specific job posting's requirements.
//  A résumé should not do its reader's evaluative work for them, so the
//  posting-specific scoring moved here (§4) instead of being deleted, on
//  the same principle docs/canon/README.md states for source vs. rationale:
//  the code is disposable and re-derivable, the reasoning is the durable
//  object worth keeping.
//
//  Note that the *motivation* did not stay here. v3 stripped it out on the
//  theory that a résumé is a pure evidence index; v4 put it back, because
//  a deliverables-only index turned out to describe artifacts nobody could
//  tell apart from ordinary feature work. See §5 for that reversal and the
//  reasoning behind it — the distinction v4 rests on is that a premise is
//  résumé content when it is immediately cashed out in a mechanism, and
//  self-indulgence when it is not.
// ═══════════════════════════════════════════════════════════════════════════

#set document(title: "some-ui — Résumé Meta", author: "Paul Gathondu")
#set page(paper: "a4", margin: 2.2cm, numbering: "1")
#set text(size: 10pt, lang: "en")
#set par(justify: true, leading: 0.62em)
#set heading(numbering: "1.1")

= What this is

`resume.typ` is the résumé: four projects in STAR grammar, each opening with
the premise it answers and then cashing that premise out in the mechanism
that implements it. This file is the apparatus around it — the provenance
for each claim (§2), the production method (§3), a requirements-map analysis
against a specific posting (§4) — the kind of scoring a résumé shouldn't do
to its reader but that's genuinely useful for deciding *whether and how to
apply* — and a revision log (§5) that is mostly a record of getting the
format wrong twice.

= Provenance --- résumé claim to repo evidence

Every claim in `resume.typ` traces to something that actually ships. None of
it is aspirational; if a line here stops being true, the résumé claim it
backs should be cut, not kept and re-justified.

== Suspender Ledger

- *The extension* --- `extensions/suspender-ledger`, a Firefox MV3 tab
  suspender. A TypeScript port of `auto-tab-discard` v3 rebuilt for the MV3
  background-script model; the résumé says "built", and the port lineage is
  stated plainly in that package's README rather than hidden.
- *Suspension is virtualization* --- the extension drives the browser's
  native discard, so the tab keeps its strip position and history entry and
  transparently reloads on activation. Stated as a README invariant and
  enforced by there being no `tabs.remove()` in the source at all.
- *Typed boundaries, resilient storage* --- `src/types/messages.ts` (the
  validated popup ↔ worker ↔ content protocol, original work rather than
  ported) and `src/worker/core/prefs`, which falls back to defaults on a
  missing or corrupt read.
- *Flat worker bundle* --- `vite.config.ts` sets `manualChunks: () => {}`
  because Firefox MV3 background scripts cannot be code-split;
  `src/lib/platform/firefox.ts` is the platform shim.
- *Signed release gate* --- `sign:firefox` (`web-ext`, AMO unlisted
  channel), behind `typecheck`, `test` (Vitest), `lint:js`, `lint:ext`, and
  `check:headers` (MPL headers on ported files).

== some-censor

- *The FSM and its invariants* --- `src/lib/content/fsm.ts` states F1–F4
  directly: every state carries a `SessionId`, transition functions are
  overloaded so illegal transitions are compile errors, `project()` is an
  exhaustive switch, and `applyReset()` is the only function that can mint
  a new session. The résumé's "compile error rather than a silent no-op"
  is quoting F2 nearly verbatim.
- *Progressive disclosure states* --- `src/types/states.ts`: `ViewState =
  Masked | MetaState | TitleState | Revealed | Whitelisted`.
- *Click gate* --- `src/lib/content/click-gate.ts`, `DBLCLICK_WINDOW_MS =
  300`, documented as "onCommit fires exactly once per logical interaction".
- *Resolver lifecycle* --- `src/types/states.ts`: `NodeState = Unresolved |
  Resolved | Failed`, with `failed` carrying a reason
  (`missing-video-id` / `missing-channel-id`); `src/lib/content/observer.ts`
  is the MutationObserver driving it.

== some-filter

- *Structural isolation* --- `extensions/some-filter` README, Layer Model
  and Invariants table: `__sw_overlay_root` is never a descendant of
  `__sw_page_layer`, and theme CSS is scoped to `#__sw_page_layer`.
  Governed by `docs/canon/dom-state-estimation-canon.typ`.
- *Comfort metric* --- `adapter/swatches.ts` (`comfortReport` /
  `satisfiesComfort` / `sampleBodyComfort`), generalized from a registry
  `Swatch`'s static hex tokens to any observed `(bg, text)` pair so it can
  run against live `getComputedStyle`. Kept separate from `theme-detector.ts`
  (`classifyPage` / `detect`, luminance-only) — the two verdicts disagreeing
  is the point of issue #722.
- *Test corpus* --- `extensions/filter-classifier`: a standalone Playwright
  workspace whose harness (`tests/e2e/harness/entry.ts`) imports the real
  shipped modules from `@some-extension/filter` and bundles them with
  esbuild. No extension build, no `--load-extension`, no reimplementation.

== Study-session and notification platform

- *Production API integration* --- `apps/www/src/lib/tenant/http-sessions-repository.ts`
  implements the versioned session client; `apps/www/src/lib/study-nudge/signals.ts`
  emits lifecycle-derived events to `POST /api/v1/signals`; and
  `apps/www/src/lib/study-nudge/service-worker.ts` manages Web Push subscriptions.
  The backing Rust `file_host` is a separate repository, so the résumé says
  "integrated" rather than claiming this tree implemented the server.
- *Typed contracts and data models* --- `packages/contract-harness` declares
  TypeScript/Zod request and response contracts and checks them against both a
  checked-in server route inventory and live HTTP responses. Its README records
  15 of 52 routes covered and 48 tests, including integration tests that start a
  real HTTP server and exercise concrete schema and route divergence.
- *Event-driven and asynchronous processing* --- `docs/study-nudge.md` records
  the explicit transition-to-signal model, fire-and-forget delivery policy,
  consent-scoped push subscriptions, and division between server engagement
  events and browser service-worker push events. The Playwright service-worker
  spec drives the real worker through Chromium rather than mocking the final hop.
- *Container/cloud delivery* --- `Dockerfile`, `infra/compose/www.yml`, and
  `apps/www/nginx.*.conf` define the Nginx web container, health check, HTTPS and
  same-origin service proxies; `.github/workflows/www-docker-release.yml`
  publishes it to GHCR. This supports Docker/cloud-infrastructure wording, not
  Kubernetes: there are no Kubernetes manifests in this repository.

== Adaptive learning platform

- *Engine + UI* --- `crates/hangul-game-core` (pure Rust, compiled to WASM)
  and `packages/ui/honeycomb` (React hex grid). Both ship in the production
  app; `packages/ui/topik` and the `leetype` family (`crates/leetype_wasm`,
  `packages/ui/leetype`) are the exam-prep and typing-drill modules.
- *Single-glyph → multi-token generalization* --- derived in
  `docs/canon/hangul-progression-canon.typ` ("The Single-Glyph Ceiling")
  before the corresponding source change landed. The `Stimulus`/`Answer`
  split is a real type boundary in the curriculum model, not résumé framing.
- *The canon and its negative result* --- `docs/canon/adaptive-learning-canon.typ`
  ("The Unobservable Learner"), ~2,100 lines, sections for the domain, the
  latent learner, the observation channel, the exercise, the estimator, the
  policy, the persistence budget, the semantic boundary, and falsifiers.
  The impossibility result the résumé cites is Prop. 2.2 / Thm. 6.1: a
  `HashSet` of completed identities plus one shared difficulty scalar cannot
  become adaptive. That it is a proof about *the code that currently ships*
  is the part worth keeping in the bullet.

== Platform, release, and reuse

- *Scoped CI gate* --- root `turbo.json` plus `.github/workflows`; the
  required gate (`pr.yml`, `_detect-changes.yml`) scopes lint/typecheck/test
  to changed packages and transitive dependents, backed by `trunk.yml`
  (full-repo sweep) and `_rust-ci.yml` (clippy, cargo-deny).
- *Release path* --- Changesets and `.changeset/` drive versioning and
  changelogs across the workspace; `release.yml`, `www-docker-release.yml`
  (Docker/GHCR), `pages.yml` (GitHub Pages + Storybook), `wasm-release.yml`,
  and `extension-sign*.yml` / `_extension-verify.yml` cover the rest.
- *Hoisted contract, not a shared runtime* --- `extensions/common`
  (`GOOD_CITIZEN.md` and the "two mandates": disjointness vs. no
  reinvention) with idioms enforced by `packages/eslint`
  (`@some-ui/eslint-kit`).
- *`transport` kernel independence* --- `extensions/transport`: an
  observe/estimate/plan/act kernel whose unit and Playwright conformance
  suites pass against `adapter/null-adapter.ts` alone (Theorem D.2), with no
  domain logic anywhere in the tree.

== Counts

*52 workspace packages, 6 browser extensions* --- counted 2026-08-04.
`pnpm -r list --depth -1` reports 53 workspace projects including the repo
root, hence 52. The extension count is directories under `extensions/` that
declare a `manifest_version`, which deliberately excludes the shared
packages (`common`, `transport`, `docs`, `scripts`) and the
`filter-classifier` test corpus: `some-censor`, `some-conveyor`,
`some-drama`, `some-filter`, `some-mujik`, `suspender-ledger`. Re-derive
both before reusing them if meaningful time has passed --- an earlier
revision of this résumé claimed "61 packages" and "15+ extensions", and
neither survived a recount.

Both numbers dropped on 2026-08-04, when six graveyard workspaces
(`some-tab-meta`, `tab-tracker`, `some-schedule`, `some-cycle`,
`some-prompt`, `some-streak`) were deleted as defunct. That is the honest
direction for this document to move: the earlier figures counted work that
was abandoned, and a smaller number of extensions that actually ship is a
stronger claim than a larger one padded with dead trees.

= Method

The repository is the dataset: résumé claims are derived from what's
actually in the tree (a workflow file, a package, a shipped extension), the
way `some-filter`'s own `classifyPage`
(`extensions/some-filter/src/lib/content/theme-detector.ts`) derives a
structured verdict — theme, a comfort report, a pass or fail against a
threshold — from a page's raw rendered styles rather than from whatever the
page claims about itself. Same instinct, pointed inward instead of outward.
See
`packages/ui/resume/README.md` for the build pipeline itself
(`resume.typ` → `dist/resume.pdf` via `scripts/compile.mjs`) and what's
deliberately out of scope for the MVP cut.

= Requirements map --- backend software engineer screening gap

#text(style: "italic", size: 9pt)[
  Derived from the qualification feedback supplied with the 2026-08-17 resume
  revision. This is an application-planning artifact, not résumé copy. "Match"
  means the repository contains direct evidence; "Adjacent" names relevant work
  without inflating it into experience the tree cannot prove; "Gap" stays a gap.
]

#table(
  columns: (28%, 12%, 1fr),
  stroke: (x, y) => if y == 0 { (bottom: 0.6pt + rgb("#999999")) } else { none },
  inset: (x: 4pt, y: 4pt),
  align: (left + horizon, left + horizon, left + horizon),
  [*Qualification*], [*Status*], [*Repository evidence / honest boundary*],

  [4+ years backend engineering], [Gap],
  [The dated body of work supports 2024--present, not four years. Do not solve a chronology gap with wording.],

  [TypeScript, Python, or Go], [Match],
  [Strict TypeScript spans the monorepo, browser workers, API clients, runtime schemas, contract harness, and test infrastructure.],

  [Production APIs / backend services], [Match (integration)],
  [The React application consumes the production Rust `file_host` API for sessions, signals, subscriptions, and push configuration. The server is a separate repository, so this tree proves API integration and boundary ownership, not sole authorship of that backend.],

  [Distributed systems / async processing], [Adjacent],
  [Event-driven flow crosses client mutation, HTTP service, push provider, and browser service worker; retry, consent, failure isolation, and contract drift are explicit. It is not evidence of operating a large distributed system.],

  [Testing / engineering practice], [Match],
  [Vitest unit tests, Playwright browser and conformance suites, a 48-test HTTP contract harness, strict type checking, linting, Rust clippy/cargo-deny, scoped PR gates, and full-trunk sweeps.],

  [Databases / data modeling], [Match],
  [Typed session, stimulus/answer, FSM, and API contract models; migration semantics and last-write-wins behavior are documented. Database implementation lives in the separate server repository.],

  [Kubernetes / cloud infrastructure], [Adjacent / Gap],
  [Docker Compose, Nginx, health checks, GitHub Actions, GHCR, and GitHub Pages are direct evidence. No Kubernetes manifests or managed-cloud platform are present.],

  [Event-driven architecture], [Match],
  [Lifecycle transitions emit engagement events; Web Push crosses a provider boundary into a browser service worker; MV3 extensions also run in restartable event-driven workers.],

  [Microservices], [Adjacent],
  [The containerized web tier integrates with separately deployed `file_host` and TTS services over explicit HTTP boundaries. Do not relabel this as production microservice ownership without operational evidence.],

  [High-volume transactions], [Gap],
  [No throughput, latency, transaction-volume, or load-test evidence exists in this repository.],

  [AI/ML infrastructure], [Adjacent],
  [The adaptive-learning work formalizes state estimation and policy over latent knowledge, but no model training, serving, feature store, or ML platform is implemented.],

  [Startup / scale-up], [Gap],
  [Sole-engineer product ownership shows ambiguity and end-to-end execution, but repository evidence cannot establish an employer's company stage.],
)

*Practical reading:* the revised résumé now makes five previously hidden direct
matches machine-readable --- TypeScript, production API integration,
event-driven processing, testing practice, and Docker/cloud delivery --- while
preserving the real gaps. The strongest application story is backend-adjacent
systems ownership across typed boundaries, asynchronous workers, contracts, and
release operations. It should not claim four years, Kubernetes, high-volume
transactions, or ML infrastructure unless evidence outside this repository can
substantiate those claims.

= Revision log

- *v1* --- STAR-method résumé distilled from the repo; summary and bullets
  carried the engineering rationale (why decisions were made) alongside
  what shipped.
- *v2* --- added an inline "Requirements Map" section scoring the résumé
  against this posting, on the theory that legible divergence was more
  honest than tailored-sounding copy.
- *v3* --- external review argued a résumé is an evidence index, not a
  design review: motivation, proof-of-correctness language, and self-scoring
  all cost reader attention without helping a hiring decision, and the
  requirements map in particular does the reader's evaluative work for them.
  Pivoted `resume.typ` to conventional grammar (deliverables, technologies,
  one page, reusable across applications) and moved the "why" and the
  posting-specific analysis here rather than deleting them.

- *v4* --- v3 was over-corrected, and reading it against the
  actual user stories behind the projects made the failure obvious. Stripped
  to deliverables, the work read like ordinary feature output: "developed a
  browser-extension architecture that isolates extension UI from host-page
  DOM mutations" describes what was built and none of what makes it
  interesting, and a reader has no way to distinguish it from a ticket
  someone was handed. The projects in this repo are *positions* --- a
  browser is an operating system and tabs are processes; attention is a
  finite resource and exposure should be opt-in; visual comfort is
  measurable rather than aesthetic; a curriculum should adapt to the learner
  rather than the reverse --- and a résumé that omits the position has
  deleted the reason the artifact exists.

  So v4 restores motivation, but under a constraint that answers v3's
  objection rather than ignoring it: *a premise earns its place only if the
  next line cashes it out in a mechanism.* "Suspension is virtualization,
  not cleanup" is followed immediately by the native-discard behaviour and
  the absent `tabs.remove()`. "Nothing earns attention by default" is
  followed by the `masked → meta → title → revealed` state machine and the
  overloads that make an illegal transition a compile error. Motivation
  without mechanism is the self-indulgence v3 correctly cut; motivation
  *with* mechanism is the difference between a feature list and an
  engineering position, and it is what this résumé is for.

  Two further changes, both housekeeping:

  - *Dropped the "Technical Skills" enumeration.* A comma-separated list of
    languages and tools communicates nothing verifiable --- it is closer to
    listing the applications one has opened than to evidencing expertise.
    Every tool that was in that list still appears in the résumé, attached
    to the thing it was used to build, where it carries information a reader
    can check. Expertise is communicated through artifacts, not inventory.
  - *Dropped the "Set in Typst from `packages/ui/resume/resume.typ`..."*
    colophon. It was a note about this document's own build pipeline, on a
    page whose entire job is to be about the candidate; the pipeline is
    genuinely interesting and it is documented in `README.md`, which is
    where someone who cares can find it.

  Also corrected the workspace counts (61 → 58 packages, "15+" → 12
  extensions); see §2's *Counts* note for how both are derived.

- *v5* --- no argument changed; the tree underneath it did. Six
  graveyard workspaces (`some-tab-meta`, `tab-tracker`, `some-schedule`,
  `some-cycle`, `some-prompt`, `some-streak`) were deleted as defunct, so
  the counts were re-derived by the §2 method: 58 → 52 packages, 12 → 6
  extensions. Two citations pointed into the deleted trees and were dealt
  with rather than left dangling — the *Method* section's analogy now uses
  `some-filter`'s `classifyPage`, and the requirements-map aside that leaned
  on `some-schedule`'s `TECH_TERMS` is marked as historical. A résumé whose
  numbers are derived from the repo has to move when the repo does,
  including downward.


- *v6 (current, 2026-08-17)* --- responded to backend-screening feedback by
  making already-shipped work explicit rather than manufacturing missing
  experience. Added the study-session/API integration project, a compact
  capabilities line for human and automated readers, and concrete language for
  event-driven service workers, contract/integration testing, Docker, Nginx,
  GHCR, and production operations. Replaced the obsolete posting map with the
  supplied backend qualification map. Four years, Kubernetes, high-volume
  systems, ML infrastructure, and startup-stage experience remain named gaps;
  the repository does not support those claims.
