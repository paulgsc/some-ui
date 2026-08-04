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

= Requirements map --- E-Logic / Sacramento County, "Web Application Developer"

#text(style: "italic", size: 9pt)[
  Pulled from Indeed, 2026-07-26. This is an application-planning artifact,
  not résumé content: it exists to help decide whether applying is worth
  the effort and, if so, what a cover letter should lead with. It is
  deliberately evaluative and posting-specific — exactly what a résumé
  should not be, and exactly what belongs in a private note instead of on
  the page a recruiter reads in six seconds.
]

#table(
  columns: (24%, 12%, 1fr),
  stroke: (x, y) => if y == 0 { (bottom: 0.6pt + rgb("#999999")) } else { none },
  inset: (x: 4pt, y: 4pt),
  align: (left + horizon, left + horizon, left + horizon),
  [*Posting requires*], [*Status*], [*What's actually true*],

  [JavaScript], [Match],
  [Primary language (as TypeScript, strict) across all 61 workspace packages.],

  [CSS], [Match],
  [Tailwind CSS v4 + a hand-built, Storybook-documented design system (`some-styles`).],

  [GIT mastery], [Match],
  [PR-gated trunk behind a required `ci-gate` check; Changesets-driven release branching.],

  [CI/CD products \& functions], [Match],
  [Turborepo dependency-graph pipeline (scoped + full-sweep) on GitHub Actions; Docker/GHCR builds; signed extension releases.],

  [Communication skills], [Match (structural)],
  [Written ADRs and 2,000+ line "canon" theory docs with amendment protocols gate every architecture change --- evidenced, not asserted.],

  [AI model training / AI front end], [Adjacent],
  [No model training. Provider-agnostic TTS front end (ElevenLabs/OpenAI/Google/Azure) + a heuristic DOM classifier calibrated against a human-labeled corpus (`filter-classifier`) --- applied classification, not the neural-net sense the posting likely means.],

  [Java], [Gap],
  [No JVM code in the repo; the systems language here is Rust, compiled to WASM.],

  [Angular], [Gap],
  [React is the only front-end framework used, repo-wide.],

  [Bootstrap], [Gap],
  [No Bootstrap dependency; the custom Tailwind-based system substitutes for it.],

  [AEM / Jackrabbit Oak], [Gap],
  [No CMS or content-repository integration of any kind; everything here is built, not composed atop a vendor platform.],

  [SOLR / SOLR API], [Gap],
  [No search-engine integration exists in the repo.],

  [AWS], [Gap],
  [Deploys run on GitHub Actions to Docker/GHCR; no AWS usage anywhere in the repo.],
)

*Tally:* 5 direct matches, 1 adjacent-but-different, 6 gaps out of 12.
An earlier revision made this point by citing `some-schedule`'s
`TECH_TERMS` keyword list, which tracked rust, typescript, aws, kubernetes,
ml, llm, systems and compiler but not AEM, SOLR, Angular or Bootstrap — the
gap wasn't just in this analysis, it was in what the maintainer's own
tooling considered relevant. That extension was deleted on 2026-08-04, so
the citation is gone; the observation it supported is unchanged, but it now
rests on the requirements map above rather than on a file in the tree.

*So what, for this posting specifically:* this is a government-subcontract
staff-aug role embedded in an existing AEM/SOLR stack, not a from-scratch
product build — a different role shape than what this repo demonstrates,
independent of the tech-stack gaps. If applying anyway, a cover letter
should lead with the Git/CI/CD matches and the applied-classifier work
(closest true analog to "AI front-end development"), name the AEM/SOLR/
Angular/Java gaps plainly rather than let an interviewer discover them, and
not claim AWS or model-training experience that isn't backed by the repo.

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

- *v5 (current)* --- no argument changed; the tree underneath it did. Six
  graveyard workspaces (`some-tab-meta`, `tab-tracker`, `some-schedule`,
  `some-cycle`, `some-prompt`, `some-streak`) were deleted as defunct, so
  the counts were re-derived by the §2 method: 58 → 52 packages, 12 → 6
  extensions. Two citations pointed into the deleted trees and were dealt
  with rather than left dangling — the *Method* section's analogy now uses
  `some-filter`'s `classifyPage`, and the requirements-map aside that leaned
  on `some-schedule`'s `TECH_TERMS` is marked as historical. A résumé whose
  numbers are derived from the repo has to move when the repo does,
  including downward.
