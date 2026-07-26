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
//  External review (kept below, §3) argued a résumé's job is to be an
//  evidence index, not an engineering design review or a self-assessment,
//  and that argument holds. So: resume.typ now states deliverables only,
//  in conventional grammar, reusable as a drop-in for any application. The
//  "why" and the posting-specific analysis moved here instead of being
//  deleted, on the same principle docs/canon/README.md states for source
//  vs. rationale: the code is disposable and re-derivable, the reasoning is
//  the durable object worth keeping.
// ═══════════════════════════════════════════════════════════════════════════

#set document(title: "some-ui — Résumé Meta", author: "Paul Gathondu")
#set page(paper: "a4", margin: 2.2cm, numbering: "1")
#set text(size: 10pt, lang: "en")
#set par(justify: true, leading: 0.62em)
#set heading(numbering: "1.1")

= What this is

`resume.typ` is the résumé — conventional grammar, deliverables and
technologies only, no self-scoring, no engineering philosophy. This file is
everything that got cut to get there: the provenance for each résumé line
(§2), the production method (§3), and a requirements-map analysis against a
specific posting (§4) — the kind of scoring a résumé shouldn't do to its
reader but that's genuinely useful for deciding *whether and how to apply*.
§5 is a short revision log.

= Provenance --- résumé line to repo evidence

Every bullet in `resume.typ`'s Highlights traces to something that actually
ships. None of this is aspirational; if a line here stops being true, the
résumé bullet it backs should be cut, not kept and re-justified.

- *Rust/WebAssembly engine + hex-grid UI* --- `crates/hangul-game-core`
  (Rust, compiled to WASM) and `packages/ui/honeycomb` (React). Both ship
  in the production app.
- *TOPIK prep + typing drill* --- `packages/ui/topik` and the typing-drill
  engine (`leetype` family: `crates/leetype_wasm`, `packages/ui/leetype`).
- *ADRs ahead of curriculum changes* --- the single-glyph → multi-token
  generalization is documented and derived, not just coded, in
  `docs/canon/hangul-progression-canon.typ` ("The Single-Glyph Ceiling")
  before the corresponding source change landed. The `Stimulus`/`Answer`
  content-schema split is a real type boundary in the curriculum model,
  not resume framing.
- *Turborepo/pnpm CI/CD, scoped to changed packages* --- root
  `turbo.json` + `.github/workflows`; the required `ci-gate` check scopes
  lint/typecheck/test to changed packages and transitive dependents, backed
  by a separate full-repo trunk sweep and a standalone Rust CI job running
  clippy and cargo-deny.
- *Release pipeline* --- Changesets config + `.changeset/` drive versioned
  publishing and changelogs across all 61 workspace packages; GitHub
  Actions handle Storybook/design-system deploys, Docker/GHCR builds for
  `apps/www`, and signed extension releases.
- *`some-filter` DOM-isolation architecture* --- `extensions/some-filter`,
  governed by `docs/canon/dom-state-estimation-canon.typ` ("The Unsettled
  Surface"). The invariant is that extension UI can never nest inside the
  patched page's DOM layer; 14 other extensions ship alongside it on shared
  `extensions/common` / `extensions/transport` packages.
- *Design system + classifier corpus* --- `packages/some-styles` (Tailwind
  CSS v4, documented in Storybook) and `extensions/filter-classifier` (a
  Playwright corpus of human-labeled fixtures used to calibrate and verify
  `some-filter`'s DOM comfort/theme classifier).
- *61 packages, 15+ extensions* --- counted directly from the pnpm
  workspace at the time of writing (2026-07-26); re-count via
  `pnpm -r list --depth -1 | wc -l` and `ls extensions | wc -l` before
  reusing these numbers in the résumé if meaningful time has passed.

= Method

The repository is the dataset: résumé claims are derived from what's
actually in the tree (a workflow file, a package, a shipped extension), the
way `some-schedule`'s own `JobBoardExtractor`
(`extensions/some-schedule/src/extractors/job-board.ts`) derives structured
fields — title, seniority signal, a `TECH_TERMS` keyword list — from a job
posting's raw text. Same instinct, pointed inward instead of outward. See
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
Notably, this repo's own job-listing keyword extractor
(`some-schedule`'s `TECH_TERMS` --- rust, typescript, aws, kubernetes, ml,
llm, systems, compiler, `...`) doesn't track AEM, SOLR, Angular, or
Bootstrap either — the gap isn't just this analysis, it's in what the
maintainer's own tooling considers relevant.

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
- *v3 (current)* --- external review argued a résumé is an evidence index,
  not a design review: motivation, proof-of-correctness language, and
  self-scoring all cost reader attention without helping a hiring decision,
  and the requirements map in particular does the reader's evaluative work
  for them. Agreed for `resume.typ` itself. Pivoted `resume.typ` to
  conventional grammar (deliverables, technologies, one page, reusable
  across applications) and moved the "why" and the posting-specific
  analysis here, rather than deleting them.
