// ═══════════════════════════════════════════════════════════════════════════
//  resume.meta.typ — commentary, provenance, and requirements-map analysis
//  behind the rendered résumé. Its exported composition catalogue is imported by
//  résumé pipeline; the surrounding analysis remains meant to be read as source, the same way this repo's docs/canon/*.typ files are: no build
//  step required, the .typ *is* the artifact.
//
//  Why this file exists: the printable résumé has a hard one-page budget. This
//  file preserves the larger evidence bank, the rationale behind each claim,
//  and several coherent one-page compositions so pruning never means erasure.
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

// The printable compositions now live in ../data/resume.typ so this file can stay
// focused on long-form provenance and analysis. Importing the catalogue here
// keeps the evidence notes connected to the same source the renderer consumes.
#import "../data/resume.typ": resume-compositions

#set document(title: "Résumé Meta --- Evidence and Composition Catalogue", author: "Paul Gathondu")
#set page(paper: "a4", margin: 1.35cm, numbering: "1")
#set text(size: 9.2pt, lang: "en")
#set par(justify: true, leading: 0.55em)
#set heading(numbering: "1.1")

= Purpose

This is the durable evidence store behind the printable one-page résumé. The
renderer selects one complete composition --- summary, skills, projects, and
platform close --- and never shuffles isolated bullets. Each composition targets
roughly 95% of a page at readable type while retaining only auditable claims.

The server body of work changes the central claim: `file_host` is authored
backend work, not merely an integration dependency. The catalogue therefore
names the API, persistence, messaging, concurrency, resilience, notification,
observability, testing, and deployment mechanisms implemented across the Rust
server and TypeScript client. It does not invent tenure, production traffic,
Kubernetes, managed-cloud operation, startup employment, or ML infrastructure.

= Server provenance

- The backend spans 24 Rust crates; `file_host` composes Axum/Tower, Tokio,
  SQLx/SQLite, Redis, NATS JetStream, WebSockets, Prometheus, OpenTelemetry, and
  Web Push behind 40+ inventoried method/path routes (47 in
  `packages/contract-harness/routes.server.json` on 2026-09-27, including the
  `GET /ws` upgrade; `scripts/check-claims.mjs` holds the rendered "40+" to
  that file).
- SQLx repositories and paired migrations own sessions, consented subscriptions,
  engagement gates, interventions, tabs, captures, and mood events; Redis
  coalesces concurrent misses and JetStream redelivers retryable typed jobs.
- Admission control, bounded queues/timeouts, cancellation-driven shutdown,
  independent dependency readiness, and typed failure outcomes make overload
  and dependency loss designed states.
- Six falsifiable service states --- unreachable, dependency-down, rejecting,
  saturated, stalled, and observability-blind --- are represented by Prometheus
  metrics and dashboards that render missing data as unknown, never healthy.
- More than 300 Rust test functions, a ratcheted all/pedantic/nursery Clippy
  baseline (`lint.yml` + `scripts/clippy_baseline.json`), cargo-deny, SQLx
  preparation, route-source parity, live contracts, and browser suites cover the
  boundary from durable storage to the real service worker.

= Provenance --- résumé claim to repo evidence

Every claim in `src/data/resume.typ` traces to something that actually ships. None of
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
  `check:headers` (MPL headers on ported files). Releases: see
  *Human-gated extension release pipeline* below.
- *Approved in AMO review* --- the résumé's "approved in Mozilla Add-ons
  (AMO) review" / "passed AMO review". Mozilla's reviewers approved 0.2.1
  (2026-08-26) and 0.3.0 (submitted 2026-10-11, tag
  `suspender-ledger@0.3.0`); the approval itself is on AMO's developer
  dashboard, not in the repository, and the owner confirmed it on
  2026-10-14. `extensions/docs/amo-compliance.md` (A4's *Status*) records
  it; its §1 explains why an unlisted add-on is still reviewed. It is the
  only extension so far with an approval; the others sign manually
  behind `extension-sign-manual.yml`'s compliance checkbox, so the résumé
  claims the approval for the suspender alone.

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
- *Rendering-scope lifecycle* --- `adapter/scope-registry.ts` (the
  HELD/RESOLVING/COMMITTED/EXONERATED_NATIVE/FAILED_HELD/RETIRED custody
  state machine, canon Definition D.5), `adapter/document-scope.ts` (the
  document as root scope `r_0`), and `adapter/shadow-scope-discovery.ts`
  (reactive `MutationObserver` discovery of open shadow roots plus a
  `DISCOVERY_POLL_MS`-bounded poll for a late `attachShadow()`, a
  per-scope `generation` counter that makes `resolveCommitted()` discard a
  stale async completion rather than clobber a newer state, and per-root
  observers that `invalidate()`/re-project on host-page mutation).
  Unit-tested throughout (`__tests__/scope-registry.test.ts`,
  `document-scope.test.ts`, `shadow-scope-discovery.test.ts`).
  Browser-verified in Chromium, per behavior, not as one blanket claim
  (a P2 finding on PR #1286 correctly caught an earlier draft of this
  bullet implying otherwise): late-root discovery and coverage of
  unresolved content by `tests/e2e/specs/issue-1267-sfdc-shadow-custody.spec.ts`
  (frame-oracle proof of zero native-bright frames across all three G0.2
  creation-trace orderings); self-healing after host-page mutation, for
  shadow scopes specifically, by
  `tests/e2e/specs/issue-1268-sfad-shadow-theming.spec.ts` (a mutated
  surface re-themes dark) and, for the generic custody primitive
  underneath both document and shadow scopes, by
  `tests/e2e/specs/scope-registry-self-heal.spec.ts` (adversarial removal
  of the covering artifact) and `scope-registry-handoff.spec.ts` (the
  two-phase install-before-release handoff). The one mechanism with *no*
  browser coverage, checked directly (neither spec file above, nor any
  other under `tests/e2e/specs/`, references "generation" or "stale"):
  the per-scope `generation` counter that makes `resolveCommitted()`
  discard a stale async completion — that claim rests on
  `scope-registry.test.ts`'s two "discards a stale completion superseded
  by a concurrent re-register()/retire()" unit tests alone, which
  `src/data/resume.typ`'s bullet now states explicitly rather than
  folding it into an undifferentiated "browser-tested".
  *Known limitations, disclosed in `adapter/custody-primitive.ts`'s own
  header*: the occlusion hold is `position: fixed`, so it cannot cover
  content promoted to the browser's top layer (a native `<dialog>` via
  `showModal()`, the Popover API, `:fullscreen`) — open, tracked by epic
  #1263, deferred to SF-LG (#1269) rather than claimed closed here; and a
  `transform`/`filter`/`perspective`/`contain`-bearing shadow host or
  ancestor establishes its own containing block, bounding the veil to that
  ancestor's box instead of the viewport — the full fix (mounting the hold
  outside every host's containing-block chain) is routed to a future story,
  not implemented yet.
- *Rendered-contrast closure* --- the claim `src/data/resume.typ`'s full-stack
  composition now makes in place of a generic signed-release bullet (that
  bullet's own evidence survives verbatim in the *platform* composition's
  human-gated release pipeline, so nothing was lost by the swap). It is
  placed *ahead* of the rendering-scope lifecycle bullet above deliberately:
  the templates' `bullet-budget` drops a project to three bullets once
  `lib/fit.typ` solves below scale 0.9, which is every template except
  `compact` and `conventional`, so a fourth bullet is written but not
  printed. Both claims survive in `src/react/generated/data.ts` and
  therefore in the web reading view; on the printed page this one is the
  newer and strictly wider of the two, and the lifecycle work it displaces
  is the scope machinery this pass is realized *through*. Three stories,
  all in `extensions/some-filter`:
  - *Foreground repair* --- SF-RC2 (#1341), commit `5c4ab3b`.
    `adapter/legibility-audit.ts` senses: it re-reads `getComputedStyle`
    after this extension's own actuation, resolves each carrier's effective
    backdrop by walking ancestors, and compares against
    `MIN_CONTRAST_RATIO = 4.5` --- WCAG 2.1 AA's normal-text minimum,
    which is the *only* WCAG quantity in this channel (see the
    non-conformance note below). `adapter/foreground-repair.ts` decides and
    realizes: `repairedForeground` starts at `modifyForegroundColor`'s own
    lift of the authored color (so this channel and the co-located
    `emit-surface-color.textCss` one land on the same value in the common
    case) and climbs its band by `REPAIR_BAND_STEP` to the first hue-,
    saturation- and alpha-preserving candidate that clears the floor ---
    never descending, and capped by `FG_LIGHT_MAX` well short of raw white,
    since canon Definition C.3's kappa-hi treats "bright white text" as its
    own failure mode. When nothing in the band clears the floor the carrier
    keeps its authored color and its `violated` diagnostic tag rather than
    being repainted to something still illegible.
  - *Shadow DOM projection* --- SF-RC3 (#1342), commit `5c47ced`. The same
    repair realized inside open shadow roots via
    `ShadowRoot.adoptedStyleSheets` (`adapter/shadow-actuator.ts`,
    `adapter/shadow-scope-theming.ts`), because a `<style>` in
    `document.head` cannot select across a shadow boundary. Closed shadow
    roots are unreachable by construction, which is why the bullet says
    *open*.
  - *Interaction-state repair* --- SF-RC4 (#1343), commit `6fb84d0`.
    `adapter/pipeline.ts` delegates passive capture-phase
    `pointerover`/`pointerout`/`focusin`/`focusout` listeners on `document`
    and re-runs the channel once `INTERACTION_SETTLE_MS = 120` of quiet has
    passed, so a `:hover`/`:focus` color swap --- a computed-style change
    that emits no mutation record --- is remeasured instead of missed.
  Browser-verified against the real built extension in Chromium:
  `tests/e2e/specs/issue-1341-sfrc2-foreground-repair.spec.ts`,
  `issue-1342-sfrc3-shadow-foreground.spec.ts`, and
  `issue-1343-sfrc4-interaction-states.spec.ts`, alongside the unit suites
  under `src/adapter/__tests__/`.

  *Limitations, disclosed here because the résumé bullet states a mechanism
  and not a guarantee*:
  - *Underdetermined paint is reported, never guessed.* When either channel
    cannot be resolved --- a group-compositing hazard (`opacity`, `filter`,
    `mix-blend-mode`), a generated-pseudo hazard, a positioning or
    occludable-image hazard on an ancestor, an unrecognized color syntax, or
    an `IFRAME` --- the carrier is tagged `"underdetermined"` and
    `decideForegroundRepairs` emits nothing for it. Such a carrier is
    surfaced as unknown rather than repaired on a guessed backdrop.
  - *Iframe contents are not traversed.* An `<iframe>` is registered as its
    own underdetermined carrier; `auditLegibility` deliberately does not
    descend into `contentDocument`, same-origin or not. Content rendered
    inside a frame is outside this channel entirely
    (`docs/legibility-paint-grammar.md`'s `PG-SCOPE-IFRAME-CONTENT` row).
  - *CSS-state coverage is not comprehensive, and the source says so.*
    `pipeline.ts`'s own `INTERACTION_EVENTS` comment enumerates the gaps:
    `:active` (transient --- a repair would routinely land after release),
    `@keyframes` animations and CSS transitions that change color with no
    event at all, media/container-query state,
    `:target`/`:checked`/`:valid`, a
    `:focus-visible` modality flip on an already-focused element (#1416),
    and script mutating CSSOM directly. Two further residuals are recorded
    in `foreground-repair.ts`'s own header: a coincidental color match set
    by a stylesheet rule rather than an inline style is not detected as an
    own declaration, and a violation needing the foreground made *darker*
    is tagged but not repaired (SF-RC5, #1344, owns reporting it).
  - *This is not a WCAG conformance claim.* The channel measures one
    criterion --- 1.4.3's 4.5:1 normal-text ratio --- on carriers it can
    resolve, in the scopes above. It says nothing about large-text ratios,
    non-text contrast, or any other success criterion, and an audited page
    is not thereby conformant. Neither the résumé bullet nor this note
    should be read as claiming otherwise.

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
  publishes it to Docker Hub. This supports Docker/cloud-infrastructure wording, not
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
  (Docker/Docker Hub), `pages.yml` (GitHub Pages), `wasm-release.yml`,
  and `extension-sign*.yml` / `_extension-verify.yml` cover the rest.
- *Human-gated extension release pipeline* --- `extension-release.yml`
  opens a release PR only when the rebuilt extension differs from the last
  release, and only builds+signs once a human merges it;
  `extensions/scripts/amo-release.mjs` checks the AMO "Version Notes" and
  "Notes for Reviewers" (`release/notes.md`) against the build they name,
  the allowed next versions and AMO's 3000-char cap, appends a computed
  permission/content-script/file comparison with the last release, bumps
  `package.json` and `public/manifest.firefox.json` together, and, at sign
  time, refuses any `dist/` that differs from the reviewed build
  (`release/release.json`); the `--check` mode of
  `extensions/scripts/sync-manifest-version.mjs` (wired into
  `_extension-sign.yml`) still fails the sign job on drift between the two
  version fields.
- *Hoisted contract, not a shared runtime* --- `extensions/common`
  (`GOOD_CITIZEN.md` and the "two mandates": disjointness vs. no
  reinvention) with idioms enforced by `packages/eslint`
  (`@some-ui/eslint-kit`).
- *`transport` kernel independence* --- `extensions/transport`: an
  observe/estimate/plan/act kernel whose unit and Playwright conformance
  suites pass against `adapter/null-adapter.ts` alone (Theorem D.2), with no
  domain logic anywhere in the tree.

== Software-adjacent compositions (v14)

`data`, `qa` and `solutions` add no new engineering facts: each bullet is an
existing claim above, re-angled for what its postings screen for, or one of
the non-engineering jobs below. The two lines that are new to the résumé
trace to:

- *Python CI checks over dashboards and scrape inventory* (`data`) ---
  paulgsc/server `scripts/check_metric_contract.py` (reconciles the metric
  names Grafana queries against the `counter!`/`histogram!`/`gauge!` names the
  workspace emits, in both directions, with commented exemptions) and
  `scripts/check_scrape_inventory.py` (reconciles `docker compose config`,
  `infra/prometheus/inventory.yml` and `prometheus.yml`), both run by
  `.github/workflows/test.yml`. Checked against the server's `main` on
  2026-10-18.
- *A typed export of sessions, reflections and stop reasons* (`data`,
  `solutions`) --- `apps/www/src/lib/agent-export`: `shareAgentExport` writes
  one `context.json` (sessions with their reflections, path counts, stops and
  the practice record) and `shareReflections` one file per session, both out
  through the phone's share sheet (`lib/share-files`) for an agent to read.
- *Rendered-output checks* (`qa`) --- this package's own
  `scripts/check-ats.mjs` and `scripts/check-layout.mjs`, which read every
  built PDF back with `pdftotext` and fail on dropped terms, wrong heading
  order or overlapping lines.

Every other `data`, `qa` and `solutions` line restates one already traced in
this section: the metrics, dashboard and fault-state lines (Server
provenance), the SQLx data model and decaying-vector lines (backend), the
contract harness (Study-session and notification platform; Platform,
release, and reuse), the Playwright service-worker and Shadow DOM scope
lines (fullstack, some-filter), the AMO release pipeline and CI gate
(Platform, release, and reuse) and the transport kernel's null-adapter
conformance. Titles are each composition's own (`title`, `role`): "Data
Analyst", "QA Automation Engineer" and "Integration Engineer" describe the
work on the page. The role lines ("Data & Analytics Engineer", "Test
Automation Engineer" and "Integration Engineer", each followed by
"independent systems work") keep the "no employer" note, so none reads as a
job held.

== Counts

*50 workspace packages, 5 browser extensions* --- counted 2026-10-30 by
`scripts/check-claims.mjs`, which walks the globs in `pnpm-workspace.yaml`
(`packages/ui/*`, `apps/*`, `docs/canon`, `extensions/**`, `packages/*`,
`crates/*`) for a `package.json`, the same method `pnpm -r list --depth -1`
uses and the one this section has used since the last recount. The extension
count is directories under `extensions/` that ship a real `manifest.json`
under `public/` (not merely something matching `*manifest*`, which also
catches build scripts): `some-censor`, `some-drama`, `some-filter`,
`some-mujik`, `suspender-ledger`. `common`, `transport`,
`filter-classifier`, `docs`, and `scripts` are excluded — shared code and a
test corpus, not shipped extensions.

The package count is 49 -> 50 on 2026-10-30: `packages/video-render`
(`@some-ui/video-render`, the one renderer for Studio and Game Week Bites: a
cut list in, a video out, the same bytes every time) landed. Before that it
was 48 -> 49 on 2026-10-28: `packages/ui/game-week`
(`@some-ui/game-week`, the game-day bite recorder on the phone: offered
scenarios, say it first, the quiet stop, every bite kept on the phone until
home holds it) landed. Before that it was 47 -> 48 on 2026-10-28: `packages/ui/captions`
(`@some-ui/captions`, our own subtitles for the weekly shorts: a
deterministic frame model, its themes, the SRT export and a web-only
preview page) landed. Before that it was 46 -> 47 on 2026-10-28:
`packages/game-scenarios` (`@some-ui/game-scenarios`, the fixed set of NFL
game-week scenarios a bite is said about, with its icons and words) landed.
Before that it was 45 -> 46 on 2026-10-27: `packages/assurance`
(`@some-ui/assurance`, the ledger of promises about outcomes and work, the
rules `pnpm check:assurance` holds it to, and what `/assurance` shows)
landed. Before that it was 44 -> 45 on 2026-10-22: `apps/mailbox`
(`@some-ui/mailbox`, the Cloudflare Worker and D1 database that carry the
Jobs files between the daily routine and the home server) landed. Before that
it was 43 -> 44 on 2026-10-18: `packages/job-desk`
(`@some-ui/job-desk`, the Jobs wing's Drive contract and the checker its
daily routine runs) landed. Before that it was 44 -> 43 on 2026-10-17: `packages/job-tracker`
(`@some-ui/job-tracker`, the web app's local job queue) was deleted with its
`/jobs` page; the story behind it moved on. Before that it was 43 -> 44 on
2026-10-12, when `packages/ui/playoff-delta`
(`@some-ui/playoff-delta`, the weekly vlog's story stage, a web-only
recording surface over a JSON contract) landed. Before that it was
42 -> 43 on 2026-10-11, when `packages/voice-capture`
(`@some-ui/voice-capture`, the phone's microphone recorder moved out of
`packages/ui/soundbites` so voice reflections could share it) landed. Before
that it was 41 -> 42 on 2026-10-08, when `packages/makjang`
(`@some-ui/makjang`, the scene-tree schema, story audit and engine) landed
(#1715). Before that it was 42 -> 41 on 2026-10-06: `packages/utils`
(`some-ui-utils`) was dissolved into `@some-ui/core-utils`, a new
`packages/react-hooks` and its single consumers, and `packages/ws`, whose
last consumer went with it, was deleted. Before that it was 45 -> 42 on
2026-10-05, and the extension count 6 -> 5:
the `extensions/some-conveyor` extension, `crates/polyhedron` (the wasm crate
only it loaded) and `packages/ui/chat` (no dependents) were deleted. Before
that it was 46 -> 45 the same day: `packages/ui/dice-card` was
deleted; no deployable or other workspace depended on it. Before that it
was 45 -> 46 on 2026-10-03, when `packages/ui/aph` landed (#1659), and
before that 46 -> 45 the same day: `packages/ui/interview` was
deleted; the catalogue retired its mock-interview activity, which had never
worked end to end. Before that it was 51 -> 46 on 2026-10-02: `packages/ui/slideshow`,
`packages/ui/makjang`, `packages/ui/umag`, `packages/ui/neon-sign` and
`packages/ui/assessment` were deleted. www now registers only its four
activities' panels; the composer's scene editor moved from slideshow into
`apps/www`. Before that it was 55 -> 51 the same day: `packages/ui/input`,
`packages/ui/stepper` and the two wasm crates only `input` loaded,
`crates/some-crossword` and `crates/viewport-rotation`, were deleted. Nothing
deployable rendered any of them. Before that it was 59 -> 55 the same day:
`packages/ui/calendar`, `packages/ui/milestones`,
`packages/ui/emoji-animations` and `packages/ui/portfolio-chart` were deleted.
None was imported by any other workspace or by a deployable. Before that it
was 58 -> 59 on 2026-10-01:
`packages/ui/soundbites`, the
Android app's "say why" recorder and the first `apk`-audience workspace.
Before that it was 59 -> 58 the same day: `packages/ui/searchbar`, a
placeholder whose `src/index.ts` had been gutted to `export {}` and which no
deployable imported, was deleted. Before that it was 58 -> 59 on 2026-09-29:
`apps/mobile`, a Capacitor shell that packages the backendless `www` build as a
sideloadable Android APK. Before that it was 57 -> 58 on 2026-09-27:
`packages/ui/lesson-crm`, the operator's lesson CRM and the first
`lan`-audience workspace. Before that it was 52 -> 57 at the 2026-08-29
recount: new additions include
`packages/activity-catalog`, `packages/contract-harness`,
`packages/server-routes`, `packages/intent-kit`, `packages/fetch-kit`,
`packages/job-tracker` (this revision's own addition — see the job-tracker
route below), and several `packages/ui/*` products (`assessment`, `auth`,
`calendar`, `chat`, and others), plus `extensions/transport` and
`extensions/common` becoming real workspace packages. The extension count is
unchanged at 6 — the growth is shared/platform code, not new shipped
extensions. `scripts/check-claims.mjs`
now runs on every `@some-ui/resume` build and fails if `src/data/resume.typ`'s
rendered composition ever hard-codes a workspace count without recomputing
it, which is also why this section states the number rather than the
resume content itself doing so (see the P0 fix below).

Both numbers dropped once before, on 2026-08-04, when six graveyard
workspaces (`some-tab-meta`, `tab-tracker`, `some-schedule`, `some-cycle`,
`some-prompt`, `some-streak`) were deleted as defunct, and an earlier
revision before that had claimed "61 packages" and "15+ extensions" that
did not survive a recount either. The number moving in either direction is
the honest failure mode of deriving it from a live tree instead of
remembering it.

*paulgsc/server: 26 workspace members (3 applications, 23 library crates)*
--- read directly from that repository's root `Cargo.toml` `members` list on
2026-08-29 (up from the "24 crates" this résumé previously stated, which was
already stale). This number is **not** independently verifiable from this
repository's own CI — `paulgsc/server` is a separate repository not checked
out during `some-ui`'s builds — so `src/data/resume.typ` no longer states an
exact crate count at all; every mention was changed to "a multi-crate Rust
workspace". Re-derive this note (not the résumé content) by cloning
`paulgsc/server` read-only and counting `members` in its `Cargo.toml` before
reusing the number anywhere that matters.

= Non-engineering employment history (context, not repo evidence)

Unlike every claim above, nothing in this section traces to `paulgsc/server` or
`paulgsc/some-ui` — it is sourced from the candidate's own separate
non-engineering résumé (`pg_resume_2026`), tracked here so the full history
stays legible. `src/data/personal.typ`'s `additional-experience` holds all
four, and each composition renders only the ones its postings screen for
(below).

- *WIS* --- Inventory Specialist, Sacramento, CA, January 2024 --- Present
  (current). High-volume cycle counting and 10-key data entry at 99.9%+
  accuracy; daily reconciliation of physical counts against system records.
- *CABA Design* --- Data Administrator, Rancho Cordova, CA, August 2020 ---
  December 2023. The entry every composition renders: Tableau
  dashboards on PostgreSQL, Google Workspace API-driven executive-reporting
  automation (10+ hours/week saved), and Python scripts against Odoo's
  XML-RPC API automating record creation and resolving data issues.
- *Natera* --- Clinical Data Operator, San Carlos, CA, January 2019 ---
  August 2020. HIPAA-compliant LIMS sample accessioning at 99.99% accuracy;
  30+ kits/hour, recognized as a top performer for speed and regulatory
  adherence.
- *PayLocity* --- Distribution Assistant, Oakland, CA, January 2017 ---
  January 2019. Weekly inventory audits with zero discrepancies; named "Top
  Performing Employee" for error-free execution.

*Which composition renders which job* (v14): all four now live in
`personal.typ`'s `additional-experience`, each as its own entry with its own
dates and bullets, and each composition names by `org` the ones it renders.
The owner confirmed on 2026-10-17 that all four are true and may render. The
software compositions keep CABA Design alone, as they have since v12; `data`
renders CABA Design and Natera (dashboards, reporting automation, clinical
data accuracy); `qa` renders CABA Design and WIS (reconciliation accuracy,
and continuity to the present); `solutions` renders CABA Design (its API
integrations). PayLocity renders nowhere yet: no composition's postings
screen for what it evidences, and it stays here and in `personal.typ` for
one that does. The earlier failure this section recorded still governs: one
entry per real employer, with its own dates, never a consolidated range
(PR #1286). WIS's "high-volume cycle counting" renders as "cycle counting"
because `check-claims` reserves "high-volume" for traffic claims.

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
(`src/main.typ` → `dist/resume.pdf` via `scripts/compile.mjs`) and what's
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

  [Production APIs / backend services], [Match],
  [`file_host` authorship covers 40+ inventoried HTTP operations, WebSockets, SQL repositories, Redis caching, NATS jobs, admission control, readiness, metrics, and graceful shutdown.],

  [Distributed systems / async processing], [Match],
  [Tokio tasks, HTTP boundaries, Redis, JetStream redelivery, WebSockets, push providers, cancellation, bounded queues, and restartable browser workers. No claim of large-scale operation.],

  [Testing / engineering practice], [Match],
  [300+ Rust test functions, a ratcheted Clippy baseline, cargo-deny, SQLx checks, route parity, live HTTP contract tests, Vitest, Playwright, and signed release gates.],

  [Databases / data modeling], [Match],
  [Typed SQLite/SQLx repositories and migrations cover sessions, engagement, gates, consented subscriptions, interventions, tabs, captures, and mood events.],

  [Kubernetes / cloud infrastructure], [Adjacent / Gap],
  [Docker/Compose, distroless images, Caddy/Nginx, Docker Hub, GitHub Actions, readiness, Prometheus, and Grafana are direct; Kubernetes and managed-cloud operations are not.],

  [Event-driven architecture], [Match],
  [Lifecycle signals, persisted eligibility, an indexed due-work waker, JetStream jobs/redelivery, WebSockets, push providers, and restartable browser workers.],

  [Microservices], [Match],
  [Separately deployable Rust server, web, TTS/ML managers, Redis, NATS, and monitoring components communicate over explicit HTTP and messaging boundaries.],

  [High-volume transactions], [Gap],
  [Backpressure and saturation controls exist, but no traffic, throughput, latency SLO, or load-test result supports a high-volume claim.],

  [AI/ML infrastructure], [Adjacent],
  [The adaptive-learning work formalizes state estimation and policy over latent knowledge, but no model training, serving, feature store, or ML platform is implemented.],

  [Startup / scale-up], [Gap],
  [Sole-engineer product ownership shows ambiguity and end-to-end execution, but repository evidence cannot establish an employer's company stage.],
)

*Practical reading:* the revised résumé makes the authored backend body machine-readable --- TypeScript, Rust services, SQL persistence, production APIs, distributed/event-driven processing, testing, and Docker/cloud delivery --- while
preserving the real gaps. The strongest application story is backend and systems ownership across typed boundaries, asynchronous workers, contracts, and
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


- *v6 (2026-08-17)* --- responded to backend-screening feedback by
  making already-shipped work explicit rather than manufacturing missing
  experience. Added the study-session/API integration project, a compact
  capabilities line for human and automated readers, and concrete language for
  event-driven service workers, contract/integration testing, Docker, Nginx,
  Docker Hub, and production operations. Replaced the obsolete posting map with the
  supplied backend qualification map. Four years, Kubernetes, high-volume
  systems, ML infrastructure, and startup-stage experience remain named gaps;
  the repository does not support those claims.


- *v7 (current, 2026-08-17)* --- made the one-page constraint the architecture
  rather than an aspiration. The long-form meta document now exports three
  coherent compositions (backend, systems, and adaptive learning), while
  `resume.typ` became a small renderer selected by a compile-time `variant`.
  The build emits all three PDFs and rejects any composition whose Typst layout
  reports more than one page. The web viewer persists the chosen composition
  and exposes both a round-robin control and a page context-menu picker. Curation remains
  reversible because omitted evidence stays here; coherence remains mandatory
  because the selectable unit is the whole composition, never a random bullet.


- *v8 (current, 2026-08-17)* --- corrected the opposite failure mode: a
  one-page résumé can still be under-filled and too skeletal for an ATS or a
  technical reader. Expanded every composition with concrete boundary,
  failure-mode, testing, data-model, and delivery evidence; made the common ATS
  qualification seam explicit in all three variants; and restored readable
  type, margins, and spacing so the page budget is used rather than merely not
  exceeded. The Typst assertions now enforce both halves of the contract:
  exactly one laid-out page and the presence of the shared qualification terms.


= Current revision

*v14 (2026-10-18).* Software-adjacent compositions, for the Jobs wing's
second track (some-ui #1881).

- *Titles moved into compositions.* `title` (the line under the name), the
  engagement `role` and the PDF keywords were global and read "Software
  Engineer" on every variant. They are now each composition's own; the
  three software compositions keep exactly the text they had, and their ATS
  transcripts are byte-identical before and after.
- *Three adjacent compositions.* `data` (data analyst, BI, analytics
  engineering), `qa` (test automation, SDET) and `solutions` (integration and
  internal-tools building, with no sales or customer-call claims), each with
  a `track` of "adjacent" against the software three. What each line traces
  to is §"Software-adjacent compositions".
- *All four jobs, chosen per composition.* `personal.typ` holds WIS, CABA
  Design, Natera and PayLocity; each composition's `experience` names which
  render (§"Non-engineering employment history").
- *A latent spacing bug.* Two additional-experience entries had never
  rendered in one document; in `classic` the second entry's title rode up
  into the first's last bullet. The second and later entries now take
  `STACK-GAP` above them, which leaves single-entry documents unchanged.

*v13 (2026-09-27).* Brought three figures back in line with the repositories
they cite, after the server's route snapshot started syncing automatically
(some-ui #1547) and exposed how far the hand-kept numbers had drifted.

- *Route figures.* The rendered résumé said "42 inventoried HTTP operations"
  and "21 of 42 routes with 13 tests"; the synced snapshot has 47 routes and
  `pnpm --filter @some-ui/contract-harness contract:coverage` reports 15 of
  them covered, by 21 contracts. "21" was the contract count, not a route
  count. The operation count is now a floor ("40+"), which a new server route
  cannot falsify, and the coverage fraction is gone from the rendered résumé:
  its denominator moves with every server merge. `scripts/check-claims.mjs`
  now reads `routes.server.json` and, for any "N of M routes" figure, the
  harness's own coverage report, and fails the build when a figure in
  `src/data/resume.typ` or the harness README disagrees with them.
- *Clippy.* "Strict all/pedantic/nursery Clippy groups" read as a clean
  workspace. The server enables those groups but runs them as a ratchet over
  a committed baseline (`lint.yml`, `scripts/check_clippy_baseline.py`): new
  findings fail, existing debt is recorded. Every composition now says
  "ratcheted Clippy baseline" instead of "strict".
- *Skills lines.* An Indeed match against a posting listed Node.js, JSON,
  and GitHub as unmatched though the repositories support all three: the
  build and check tooling and the contract harness are Node.js CLIs, the
  service speaks JSON, and CI is GitHub Actions. The backend line had them
  only fused into "HTTP/JSON" and "CI/CD pipeline automation", which a
  keyword parser does not split. They are now separate terms, and
  `scripts/check-ats.mjs` requires them in the rendered PDFs. PostgreSQL
  was unmatched too although the CABA Design entry already names it, so the
  match reads Indeed's profile skills at least as much as the résumé text;
  it stays out of the engineering skills lines because neither repository
  uses it. AI and debugging are not claimed: neither repository ships an AI
  feature, and "debugging" is not a capability a skills line can evidence.

*v12 (2026-09-05).* Corrected a personal-schema error and applied two
review-suggested bullet replacements, both re-verified against the current
tree before landing rather than taken on the suggestion's word alone.

- *Fixed the additional-experience entry in `src/data/personal.typ`*: `org`
  named three employers ("CABA Design · Natera · WIS") under one date range
  ("2017 — Present"), but only CABA Design belongs in this entry — Natera
  and WIS are separate past/current jobs on the candidate's own
  non-engineering résumé, not this one. Narrowing `org` to "CABA Design"
  while leaving "2017 — Present" untouched was itself a real bug this
  repo's bot reviewer caught on PR #1286 (nine years misattributed to one
  employer); fixed by giving CABA Design its own real dates (August 2020 —
  December 2023, rendered as "2020 — 2023"), title ("Data Administrator"),
  and three bullets describing what was actually done there (Tableau/
  PostgreSQL dashboards, Google Workspace API-driven reporting automation,
  Python/Odoo XML-RPC record automation) rather than the previous
  composite bullet's generic, multi-employer-averaged claim. Also added
  the city/state each entry was missing: "Rancho Cordova, CA" for CABA
  Design, "Merced, CA" for the UC Merced education entry (both rendered
  via the existing `detail` field every template already prints under the
  org/institution line). The other three employers (WIS — current, Natera,
  PayLocity) are recorded with their own real dates/locations/bullets in
  this file's new *Non-engineering employment history* section rather than
  silently dropped, per the candidate's own request to track them for
  context without rendering them in the engineering résumé.
- *Replaced the release-automation bullet* in `platform`'s "CI/CD and
  release automation" project (`src/data/resume.typ`) with the human-gated
  AMO pipeline claim, after reading `extension-release.yml`,
  `build-amo-metadata.mjs`, and `sync-manifest-version.mjs` directly to
  confirm each clause: a human merge gates build+sign, release notes come
  from the versioned changelog, reviewer notes and both fields' length are
  validated, manifest/package versions are synchronized, and `--check`
  mode fails signing on drift. See this file's *Platform, release, and
  reuse* section for the new evidence bullet.
- *Replaced the DOM-isolation bullet* in `fullstack`'s "Browser extension
  platform" project with the scope-lifecycle claim, after reading
  `scope-registry.ts`, `document-scope.ts`, and `shadow-scope-discovery.ts`
  directly: late-root discovery (reactive + `DISCOVERY_POLL_MS` poll),
  coverage of unresolved content (the HELD occlusion hold), rejection of
  stale async completions (the per-scope `generation` counter), and
  self-healing after host-page mutation (per-root observers) are all real.
  Recorded the two known gaps `custody-primitive.ts` itself discloses —
  top-layer content and a transform/filter/contain-established containing
  block — in this file's *some-filter* section rather than only in the
  résumé's omission of them.
- *Follow-up, same PR*: the bot reviewer caught two more real issues in the
  changes above. First, narrowing the additional-experience `org` to "CABA
  Design" while leaving its date range at "2017 — Present" misattributed
  nine years to one employer — fixed with CABA Design's actual dates
  (August 2020 — December 2023, sourced from the candidate's
  `pg_resume_2026`) and bullets describing what was actually done there;
  see the *Non-engineering employment history* section above, added in the
  same follow-up to track the other three employers (WIS, Natera,
  PayLocity) with their own real dates rather than dropping them
  silently — and to retire the unsourced "Rite Aid" mention this file's
  own `personal.typ` comment previously carried, which a repo-wide search
  turned up no evidence for once checked, and which the newly supplied
  résumé's own gapless 2017–present chain across exactly four employers
  leaves no room for anyway. Second, the "browser-tested" scope-lifecycle
  bullet initially cited only `scope-registry-handoff.spec.ts` and
  `scope-registry-self-heal.spec.ts` (neither imports
  `shadow-scope-discovery.ts` or creates a `ShadowRoot`) for a claim that
  included the per-scope `generation`/stale-completion mechanism, which
  those specs never exercise — checked directly (no "generation" or
  "stale" string anywhere under `tests/e2e/specs/`) and confirmed
  unit-tested only. Reworded the bullet so "browser-verified" attaches
  only to what actually is (late-root discovery and coverage, now
  correctly cited to `issue-1267-sfdc-shadow-custody.spec.ts`; self-healing
  after mutation, to `issue-1268-sfad-shadow-theming.spec.ts` and the two
  specs originally cited), with the generation counter named separately as
  unit-tested.

*v11 (2026-08-29).* Responded to an external ATS/positioning review
(`docs/canon` sibling review, 2026-08-29) that read the rendered PDFs, the
public `/resume` route, and both repositories the way an applicant-tracking
system and a hiring reader would. Its diagnosis: the résumé's ATS problem was
never a broken PDF, it was a structurally incomplete and occasionally
overstated candidate profile.

- *Filled real personal-schema gaps* in `src/data/personal.typ` rather than
  leaving them empty by policy default: location, a submission-only phone
  number (deliberately excluded from the public `<resume-export>` metadata —
  see that file's comment), a real STEM degree (B.S. Mechanical Engineering,
  UC Merced), work-authorization status (recorded but not rendered by any
  template yet — see personal.typ), and one consolidated non-engineering
  employment entry proving continuity without re-litigating a separate
  career in engineering-résumé space. Every value traces to the candidate's
  own non-engineering résumé, not to inference.
- *Removed every unqualified workspace-count claim* from the rendered
  résumé content. "24-crate" and "52-package" were both stale (see the
  Counts note above) and, per the review, shouldn't have been hard-coded
  numbers in résumé prose to begin with — repetition of a topology count
  spends space that outcomes should occupy. `scripts/check-claims.mjs` now
  fails the build if a bare crate/package count or a forbidden unqualified
  term (`production` used without a qualifier, `users`, `traffic`, `uptime`,
  `on-call`, `SLO`, `Kubernetes`, `Entity Framework`, ...) appears in
  `src/data/resume.typ`.
- *Replaced "Sole engineer"* (`resume-engagement.note`) with wording that
  cannot be misread as company tenure: this is unpaid, independent,
  no-employer work, not a headcount-of-one team.
- *Retired `systems` and `learning` as primary compositions*, per the
  review's read of the current early-career job market: `systems`
  (distributed-systems infrastructure) overlapped heavily with `backend`'s
  own project evidence, and `learning` under-sold real full-stack/web-platform
  work by filing it under "adaptive learning" specifically. Replaced with:
  - `platform` — developer-platform tooling: the cross-repo contract/route
    parity harness (`packages/contract-harness`, now cited with a freshly
    counted 21-of-42-routes/13-tests figure rather than the stale
    15-of-52/48 this document previously recorded) and CI/CD & release
    automation (change-scoped Actions, Docker, Changesets, signed extension
    releases) — targets the Developer Tools / Web Platform Engineer lanes.
  - `fullstack` — TypeScript/React web applications, reusable components,
    and the browser-extension platform (six shipped extensions --- five,
    and one AMO-approved, as of 2026-10-14 --- typed
    protocols, MV3 service workers, cross-browser Playwright coverage),
    with the adaptive-learning engine kept as one of its two projects rather
    than the composition's sole premise.
  Nothing was deleted: the retired compositions' evidence (real-time
  transport/JetStream pipeline, the study intervention engine) remains
  traceable through the *Server provenance* and *Study-session and
  notification platform* sections above; only the one-page rendered
  selection changed.
- *Added three ATS-safe print templates* — `vanilla`, `safe`, and
  `conventional` — alongside `rail`/`classic`/`compact`, per the review's P0
  "ship a plain single-column submission artifact" recommendation. See
  `README.md`'s Templates section for what differs structurally between
  them (section order, presence of a rule under headings, whether the
  italicized project premise renders at all).
- Left named gaps named: four years of tenure, Kubernetes, managed cloud,
  high-volume traffic, and ML infrastructure are still not claimed anywhere,
  because the repositories still do not support those claims.

*v10 (2026-08-17).* Promoted `file_host` from an integration dependency to
its accurate role as authored production backend work. Added the 39-operation
API, SQLx persistence, Redis coalescing, NATS/JetStream redelivery, WebSocket
lifecycle, admission controls, intervention engine, fault taxonomy,
observability, tests, and container delivery across every composition. Each
variant now carries enough concrete evidence to target approximately 95% page
utilization without claiming unsupported tenure, traffic scale, Kubernetes,
managed cloud, startup employment, or ML infrastructure.
