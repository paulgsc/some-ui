// ═══════════════════════════════════════════════════════════════════════════
//  resume.typ — source of truth for Paul Gathondu's résumé.
//
//  MVP note: this is a STAR-method distillation of `some-ui` itself. The
//  repository is the dataset — every claim below traces to something that
//  actually ships from it (a workflow file, a package, a shipped extension),
//  not aspirational copy. See packages/ui/resume/README.md for the build
//  pipeline and what's deliberately out of scope for this first cut.
//
//  Iteration note (requirements map): this pass reads the repo against a
//  specific posting (E-Logic / Sacramento County, "Web Application
//  Developer", Indeed, pulled 2026-07-26) the way `some-schedule`'s own
//  `JobBoardExtractor` would — title, seniority signal, tech-keyword list.
//  The map is deliberately not tuned toward that posting's keywords; it
//  states what's actually true, match or gap, on the theory that a legible
//  divergence is worth more than a padded one. See the requirements-map
//  section below for the method and the full accounting.
// ═══════════════════════════════════════════════════════════════════════════

#set document(title: "Paul Gathondu — Résumé", author: "Paul Gathondu")
#set page(paper: "us-letter", margin: (x: 1.7cm, y: 1.1cm))
#set text(font: "Libertinus Serif", size: 9.3pt, lang: "en")
#set par(justify: true, leading: 0.53em, spacing: 0.6em)
#set block(spacing: 0.55em)
#set list(spacing: 0.42em)
#show heading: set text(font: "New Computer Modern")

#let tagline(body) = text(size: 9.1pt, fill: rgb("#4a4a4a"))[#body]
#let sectionhead(title) = [
  #v(0.32em)
  #block(below: 0.24em)[
    #text(size: 10.6pt, weight: "bold", tracking: 0.4pt)[#upper(title)]
    #line(length: 100%, stroke: 0.5pt + rgb("#bbbbbb"))
  ]
]

#let fit(kind) = {
  let (glyph, color) = if kind == "match" {
    ("MATCH", rgb("#2f7a4f"))
  } else if kind == "adjacent" {
    ("ADJACENT", rgb("#a8760f"))
  } else {
    ("GAP", rgb("#9a4a3f"))
  }
  text(fill: color, weight: "bold", size: 7.6pt, tracking: 0.3pt)[#glyph]
}

// ── Header ───────────────────────────────────────────────────────────────

#align(center)[
  #text(size: 20pt, weight: "bold")[Paul Gathondu]
  #v(0.15em)
  #tagline[Solo Engineer — Adaptive Learning Systems, Rust/WASM, Browser Extensions]
  #v(0.25em)
  #text(size: 9pt)[
    aulgondu\@gmail.com
    #h(0.6em) · #h(0.6em)
    github.com/paulgsc
    #h(0.6em) · #h(0.6em)
    pgdev.maishatu.com
    #h(0.6em) · #h(0.6em)
    github.com/paulgsc/some-ui
  ]
]

#sectionhead[Summary]

I build and ship `some-ui`: a solo-maintained, production-shaped monorepo
whose real deliverable is an adaptive, gamified tutor for Korean and
low-level Rust — measured against a benchmark I can't fake, whether I
actually reach TOPIK-level Korean and genuine Rust systems fluency myself.
Everything else in the repo (the extension suite, the CI/CD, the release
pipeline) exists to make that one product sustainable for a team of one,
on a real budget, without trading engineering taste for velocity.

#sectionhead[some-ui --- Monorepo, Sole Engineer (2024 --- Present)]

*Situation.* One developer, one budget, 61 workspace packages spanning a
React/TypeScript app, a Rust/WASM game engine, and 15+ shipped browser
extensions. No headcount to throw at regression risk and no budget to
route every change through a frontier model — the repo has to defend its
own quality bar structurally, not by brute force.

*What I built and why it holds up:*

- *Adaptive learning core* — designed and shipped `hangul-game-core`
  (Rust/WASM) and `honeycomb` (hex-grid study UI) for Korean acquisition,
  plus a TOPIK prep module and a typing-drill engine. Architecture changes
  to the curriculum model are derived in written ADRs and formal design
  canons *before* implementation — e.g. generalizing the engine from
  single-glyph to multi-token words was proved correct (an equivalence
  theorem, not a hope) before a line of the change landed — because the
  curriculum only gets harder from here and a wrong abstraction compounds.
- *CI/CD as a dependency graph, not a checklist* — Turborepo + pnpm
  workspaces power a PR pipeline that scopes lint/typecheck/test to
  changed packages and their transitive dependents (one required
  `ci-gate` check), backed by a separate full-repo trunk sweep and a
  standalone Rust CI job. Regression enforcement is real: lints, types,
  and Rust's clippy/cargo-deny gate merges, not a suggestion.
- *Release, for real* — Changesets drives versioned publishing with
  auto-generated changelogs across every workspace package; GitHub Actions
  handle Storybook/design-system deploys, Docker/GHCR builds for the app,
  and signed extension releases, all issue- and milestone-tracked through
  normal PR review rather than direct-to-main commits.
- *Flagship extension: `some-filter`* — a structurally isolated dark-theme
  and invert-filter system for arbitrary third-party pages, built around
  an explicit DOM-layer invariant (extension UI can never nest inside the
  patched page layer, by construction, not by convention) so theming a
  hostile page can never leak into or break the extension's own chrome.
  Shipped alongside 14 other extensions on shared `common`/`transport`
  packages.
- *Judgment over automation-as-default* — the same discipline that keeps
  CI honest shows up inside the product: the learning engine keeps its
  content model typed and explicitly boundaried (a `Stimulus`/`Answer`
  split, not a bag of strings) so *what data belongs where* is a design
  decision made once, deliberately — not something quietly decided by
  whatever an LLM felt like inferring from a prompt.

#sectionhead[Requirements Map --- E-Logic / Sacramento County, "Web Application Developer"]

#text(size: 8.3pt)[
  Read against, not toward: the posting states what a standard AEM/SOLR
  contract role expects; it isn't copy to echo back. Every row below is
  grounded in the repo as it stands.
  #h(1fr) #fit("match") 5 #h(0.35em) #fit("adjacent") 1 #h(0.35em) #fit("gap") 6
]

#set table(inset: (x: 0pt, y: 2.2pt))
#show table.cell: set text(size: 8pt)
#table(
  columns: (21%, 11%, 1fr),
  stroke: (x, y) => if y == 0 { (bottom: 0.6pt + rgb("#999999")) } else { none },
  align: (left + horizon, left + horizon, left + horizon),
  [*Posting requires*], [*Status*], [*What's actually true here*],

  [JavaScript], [#fit("match")],
  [Primary language (as TypeScript, strict) across all 61 workspace packages.],

  [CSS], [#fit("match")],
  [Tailwind CSS v4 + a hand-built, Storybook-documented design system (`some-styles`).],

  [GIT mastery], [#fit("match")],
  [PR-gated trunk behind a required `ci-gate` check; Changesets-driven release branching, 780+ merged PRs.],

  [CI/CD products \& functions], [#fit("match")],
  [Turborepo dependency-graph pipeline (scoped + full-sweep) on GitHub Actions; Docker/GHCR builds; signed extension releases.],

  [Communication skills], [#fit("match")],
  [Structural, not asserted: written ADRs and 2,000+ line "canon" theory docs with amendment protocols gate every architecture change.],

  [AI model training / front end], [#fit("adjacent")],
  [No model training. Provider-agnostic TTS front end (ElevenLabs/OpenAI/Google/Azure) + a heuristic DOM classifier calibrated against a human-labeled corpus (`filter-classifier`) --- applied classification, not the neural-net sense the posting likely means.],

  [Java], [#fit("gap")],
  [No JVM code in the repo; the systems language here is Rust, compiled to WASM.],

  [Angular], [#fit("gap")],
  [React is the only front-end framework used, repo-wide.],

  [Bootstrap], [#fit("gap")],
  [No Bootstrap dependency; a custom Tailwind-based system substitutes for it.],

  [AEM / Jackrabbit Oak], [#fit("gap")],
  [No CMS or content-repository integration of any kind; everything here is built, not composed atop a vendor platform.],

  [SOLR / SOLR API], [#fit("gap")],
  [No search-engine integration exists in the repo.],

  [AWS], [#fit("gap")],
  [Deploys run on GitHub Actions to Docker/GHCR; no AWS usage anywhere in the repo.],
)

#text(size: 7.9pt, style: "italic", fill: rgb("#5a5a5a"))[
  Six gaps out of twelve is a real signal, not a rounding error: this repo's
  own job-listing keyword extractor (`some-schedule`'s `TECH_TERMS` ---
  rust, typescript, aws, kubernetes, ml, llm, systems, compiler, `...`)
  doesn't contain AEM, SOLR, Angular, or Bootstrap either. The five matches
  are load-bearing, not padding; the gaps are a genuine, undisguised
  difference in focus --- enterprise CMS/search integration versus building
  the whole product, including its formal groundwork, from first principles.
]

#sectionhead[Stack]

#text(size: 9.3pt)[
  TypeScript · React · Rust · WebAssembly · Turborepo · pnpm · Vite ·
  GitHub Actions · Zod · Changesets · Typst
]

#v(0.6em)
#align(center)[
  #text(size: 7.7pt, fill: rgb("#8a8a8a"), style: "italic")[
    Set in Typst from `packages/ui/resume/resume.typ` in this repository —
    compiled to PDF as part of its own build pipeline.
  ]
]
