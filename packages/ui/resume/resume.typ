// ═══════════════════════════════════════════════════════════════════════════
//  resume.typ — Paul Gathondu's résumé. Conventional grammar, on purpose:
//  deliverables and technologies, not motivation or methodology. This file
//  is meant to be a generic drop-in for any application flow (upload, ATS
//  parse, print) — nothing posting-specific lives here.
//
//  Every line still traces to something that actually ships from `some-ui`
//  (a package, a workflow file, a shipped extension) — see
//  packages/ui/resume/resume.meta.typ (same directory) for the full
//  provenance map, the "why" behind each decision, and any posting-specific
//  requirements analysis. That file is commentary; this one is the résumé.
// ═══════════════════════════════════════════════════════════════════════════

#set document(title: "Paul Gathondu — Résumé", author: "Paul Gathondu")
#set page(paper: "us-letter", margin: (x: 1.9cm, y: 1.6cm))
#set text(font: "Libertinus Serif", size: 10pt, lang: "en")
#set par(justify: true, leading: 0.62em)
#show heading: set text(font: "New Computer Modern")

#let tagline(body) = text(size: 9.6pt, fill: rgb("#4a4a4a"))[#body]
#let sectionhead(title) = [
  #v(0.5em)
  #block(below: 0.35em)[
    #text(size: 11.5pt, weight: "bold", tracking: 0.4pt)[#upper(title)]
    #line(length: 100%, stroke: 0.5pt + rgb("#bbbbbb"))
  ]
]

// ── Header ───────────────────────────────────────────────────────────────

#align(center)[
  #text(size: 20pt, weight: "bold")[Paul Gathondu]
  #v(0.15em)
  #tagline[Software Engineer — Rust/WebAssembly, TypeScript/React, CI/CD]
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

Software engineer who designs, builds, and operates production systems end
to end — a Rust/WebAssembly engine, a React/TypeScript application, and the
CI/CD and release infrastructure behind them. Sole maintainer of `some-ui`,
a 61-package monorepo shipping an adaptive language-learning platform and
15+ browser extensions.

#sectionhead[Sole Engineer --- some-ui (2024 --- Present)]

Design, build, and maintain a production-scale monorepo (61 TypeScript and
Rust packages) powering an adaptive language-learning platform and a suite
of browser extensions, alone, from architecture through release.

*Highlights*

- Developed a Rust/WebAssembly game engine (`hangul-game-core`) and a React
  hex-grid study interface (`honeycomb`) for an adaptive Hangul-learning
  platform.
- Built a TOPIK exam-prep module and a typing-drill engine on the same
  curriculum platform.
- Authored architecture decision records ahead of curriculum-model changes,
  including generalizing the engine from single-character to multi-word
  exercises, backed by a typed `Stimulus`/`Answer` content schema.
- Built a Turborepo + pnpm CI/CD pipeline on GitHub Actions that scopes
  lint, type-check, and test runs to changed packages and their
  dependents behind a required merge check, plus a full-repo sweep and a
  standalone Rust CI job (clippy, cargo-deny).
- Built a release pipeline with Changesets (versioned publishing,
  changelogs), GitHub Actions (Storybook and design-system deploys,
  Docker/GHCR builds), and signed browser-extension releases.
- Developed a browser-extension architecture (`some-filter`) that isolates
  extension UI from host-page DOM mutations, preventing style leakage on
  arbitrary third-party sites; shipped alongside 14 other extensions on
  shared internal packages.
- Built a Tailwind CSS design system (`some-styles`) documented in
  Storybook, and a labeled test corpus (`filter-classifier`) for a DOM
  theme/comfort classifier.

#sectionhead[Technical Skills]

#text(size: 9.3pt)[
  TypeScript · React · Rust · WebAssembly · Tailwind CSS · Storybook ·
  Turborepo · pnpm · Vite · Docker · GitHub Actions · Git · Zod ·
  Changesets · Typst
]

#v(0.6em)
#align(center)[
  #text(size: 7.7pt, fill: rgb("#8a8a8a"), style: "italic")[
    Set in Typst from `packages/ui/resume/resume.typ` in this repository —
    compiled to PDF as part of its own build pipeline.
  ]
]
