// ═══════════════════════════════════════════════════════════════════════════
//  resume.typ — Paul Gathondu's résumé.
//
//  Grammar: STAR, told project-first. Each entry opens with the premise the
//  project exists to answer (situation + task, one italic line), then bullets
//  carrying the engineering action and the result it produced. The premise is
//  the point — these projects are not features, they are positions about how
//  software should behave — but this is a *technical* résumé, so every
//  premise is immediately cashed out in the mechanism that implements it:
//  the state machine, the invariant, the build constraint, the test corpus.
//
//  A compact capabilities line makes backend qualifications legible to both
//  humans and application parsers; every term there is still backed by the
//  project evidence and provenance map below.
//
//  Every line traces to something that ships from `some-ui` — a crate, a
//  package, a workflow file, a signed extension. See resume.meta.typ (same
//  directory) for the provenance map and the rationale behind the format.
// ═══════════════════════════════════════════════════════════════════════════

#set document(title: "Paul Gathondu — Résumé", author: "Paul Gathondu")
#set page(paper: "us-letter", margin: (x: 1.7cm, y: 1.5cm))
#set text(font: "Libertinus Serif", size: 9.9pt, lang: "en")
#set par(justify: true, leading: 0.64em)
#show heading: set text(font: "New Computer Modern")

#set list(indent: 0.2em, spacing: 0.62em, marker: [•])

#let tagline(body) = text(size: 9.5pt, fill: rgb("#4a4a4a"))[#body]

// `sticky` keeps a section rule glued to the content beneath it, so a heading
// can never be stranded alone at the foot of a page.
#let sectionhead(title) = [
  #v(0.6em)
  #block(below: 0.45em, sticky: true)[
    #text(size: 11pt, weight: "bold", tracking: 0.4pt)[#upper(title)]
    #line(length: 100%, stroke: 0.5pt + rgb("#bbbbbb"))
  ]
]

// A project entry: name + what it is, then the premise it answers. The
// premise line is the "situation/task" half of STAR; the bullets that follow
// are "action/result". The whole header is one unbreakable, sticky block —
// a project's name and its premise travel together, and travel with the
// first bullet of the evidence that backs them.
#let project(name, kind, premise) = block(
  breakable: false,
  sticky: true,
  above: 1.15em,
  below: 0.42em,
)[
  #block(below: 0.34em)[
    #text(size: 10.4pt, weight: "bold")[#name]
    #h(0.45em)
    #text(size: 9pt, fill: rgb("#5a5a5a"))[#kind]
  ]
  #block(
    inset: (left: 0.55em),
    stroke: (left: 1.2pt + rgb("#c8c8c8")),
  )[
    #pad(left: 0.5em)[
      #text(size: 9.4pt, style: "italic", fill: rgb("#3c3c3c"))[#premise]
    ]
  ]
]

// ── Header ───────────────────────────────────────────────────────────────

#align(center)[
  #text(size: 19pt, weight: "bold")[Paul Gathondu]
  #v(0.12em)
  #tagline[
    Software Engineer --- browser and systems infrastructure in Rust,
    WebAssembly, and TypeScript
  ]
  #v(0.22em)
  #text(size: 8.8pt)[
    paulgathondudev\@gmail.com
    #h(0.55em) · #h(0.55em)
    github.com/paulgsc
    #h(0.55em) · #h(0.55em)
    paulgsc.github.io/some-ui
    #h(0.55em) · #h(0.55em)
    github.com/paulgsc/some-ui
  ]
]

#sectionhead[Summary]

Software engineer who builds the infrastructure he depends on instead of
renting it: a virtual-memory layer for a browser used as an operating system,
an attention firewall that makes exposure opt-in rather than default, a
rendering layer that treats visual comfort as a measurable property, and an
instruction engine that estimates what a learner knows instead of marching
them through a fixed curriculum. The work ships from `some-ui` --- a 52-package TypeScript and Rust monorepo
--- alongside production API integrations, asynchronous service workers, and
the CI/CD, container, release, and signing pipelines behind them. Sole
engineer, from architecture through production operations.

#text(size: 9.2pt, weight: "bold")[Core capabilities:] TypeScript; Rust; HTTP/JSON
APIs; data modeling and runtime validation; event-driven and asynchronous
processing; Docker and GitHub Actions; Vitest, Playwright, contract, and
integration testing.

#sectionhead[Selected Work --- some-ui, sole engineer (2024 --- Present)]

#project(
  "Suspender Ledger",
  [Firefox MV3 extension · TypeScript, Vite, Vitest],
)[
  A browser used as an operating system holds hundreds of tabs that are
  long-lived workspaces, not pages --- so suspension is virtualization, not
  cleanup. Reclaiming memory must never cost a tab its identity, and that
  guarantee was being rented from a closed-source vendor extension.
]

- Built a tab suspender around the browser's native discard mechanism so a
  suspended tab keeps its strip position and history entry and reloads
  transparently on activation --- the logical tab survives even though its
  memory does not.
- Made irreversibility structurally impossible rather than merely unintended:
  no `tabs.remove()` exists anywhere in the source, every popup ↔ worker ↔
  content message is typed and validated at the boundary, and a corrupt or
  missing preferences read falls back to defaults instead of throwing --- the
  non-happy path cannot strand a tab.
- Solved Firefox MV3's prohibition on code-split background scripts by
  emitting the service worker as a single flat bundle (Vite `manualChunks`),
  with browser-API differences quarantined behind a platform shim rather than
  branching at call sites.
- Ships as a signed, unlisted `.xpi` through AMO, gated by a pipeline that
  must pass `tsc`, Vitest, ESLint, `web-ext lint`, and an MPL-header check
  before a build is eligible to sign.

#project(
  "some-censor",
  [Browser extension · TypeScript, MutationObserver, typed FSM],
)[
  Recommendation surfaces are engineered to maximize exposure. Inverting that
  means nothing earns attention by default: content stays hidden until it is
  deliberately revealed, so searching for something never requires being
  exposed to everything around it.
]

- Implemented progressive disclosure as an explicit finite state machine ---
  `masked → meta → title → revealed`, plus a `whitelisted` escape --- over a
  discriminated-union `ViewState`, so a recommendation surrenders exactly one
  layer of information per deliberate interaction.
- Encoded the machine's invariants in the type system instead of in review
  comments: transition functions are overloaded so an illegal transition is a
  compile error rather than a silent no-op, an exhaustive `project()` switch
  makes adding a state variant fail the build until every branch is handled,
  and every state carries a `SessionId` that only a reset can mint --- so a
  single-page navigation cannot leak reveal state between pages.
- Wrote an async click gate that disambiguates click from double-click within
  a 300 ms window, guaranteeing one commit per logical interaction so a reveal
  step can never be skipped by event ordering.
- Reconciles a virtualized, continuously re-rendered feed to stable video and
  channel identity through a MutationObserver-driven resolver whose output is
  itself a typed lifecycle (`unresolved | resolved | failed`), so extraction
  failures are represented rather than swallowed.

#project(
  "some-filter",
  [Browser extension + Playwright corpus · TypeScript, esbuild],
)[
  Every site ships its own contrast, luminance, and palette, forcing the eye
  to re-adapt on each navigation. Visual comfort is an engineering problem
  with measurable properties, not a theming preference --- which means visual
  regressions should be testable, not arguable.
]

- Designed a structural isolation layer that relocates vendor DOM into a
  dedicated page layer and mounts extension UI as its sibling, holding the
  invariant that the overlay root is never a descendant of the page layer ---
  so theme CSS scoped to that layer is provably incapable of leaking into
  extension UI on an arbitrary third-party site.
- Built a comfort metric over observed background/text pairs sampled from live
  `getComputedStyle`, generalized from static palette tokens so it evaluates
  what a page actually renders, and kept it deliberately separate from the
  page-level light/dark classifier so the two verdicts can disagree ---
  the disagreement is the diagnostic signal.
- Stood up `filter-classifier`, a standalone Playwright corpus of
  human-labeled fixtures that bundles the extension's real shipped modules via
  esbuild rather than reimplementing them, so a fix in the extension is
  exercised by the corpus on the next run with no duplicated logic and no
  extension build step.

#project(
  "Study-session and notification platform",
  [Production API integration · TypeScript, Zod, Web Push, Docker],
)[
  A reminder is useful only when it respects both learner state and explicit
  consent. The static client and server-backed deployment therefore use
  distinct pacing policies, joined by a versioned API contract rather than
  duplicating business logic across processes.
]

- Integrated the React application with a production Rust HTTP/JSON service
  across versioned session, engagement-signal, and Web Push endpoints; modeled
  request and response data with TypeScript and Zod, and centralized same-origin
  proxying so HTTPS clients can reach the service without mixed-content or CORS
  failures.
- Designed event-driven processing around session lifecycle transitions:
  mutations emit fire-and-forget engagement events, while a browser service
  worker consumes push events and manages consent-scoped subscriptions without
  allowing network failure to block a learner from starting a session.
- Built a contract-test harness that checks 15 of 52 server routes for route
  drift and then probes a live service for schema divergence, unknown fields,
  and phantom optionals; its 48-test suite starts a real HTTP server and
  exercises each detector against concrete protocol breakage.
- Closed the last asynchronous hop with Playwright driving a real Chromium
  service worker and delivered push, then containerized the web tier behind
  Nginx with health checks, HTTPS termination, and service-to-service proxies;
  GitHub Actions publishes the image to GHCR.

#project(
  "Adaptive learning platform",
  [Rust → WebAssembly engine + React application],
)[
  Conventional courseware fixes the curriculum and expects every learner to
  adapt to it. Inverting that makes the software responsible for inferring
  what the learner knows, choosing the smallest next concept that produces
  progress, and adapting the modality --- not just the difficulty --- to
  teach it.
]

- Built the game engine as a pure-Rust crate compiled to WebAssembly
  (`hangul-game-core`), consumed by a React hex-grid study interface
  (`honeycomb`), with a TOPIK exam-prep module and a typing-drill engine
  sharing the same curriculum platform.
- Generalized the content model from single-glyph to multi-token exercises
  behind a typed `Stimulus`/`Answer` schema --- a real type boundary in the
  curriculum model --- after deriving the ceiling the previous model had hit,
  rather than discovering it in production.
- Authored *The Unobservable Learner*, a 2,000-line formal treatment of
  adaptive instruction as state estimation over latent learner knowledge:
  observation channel, estimator, policy, and persistence budget, each stated
  as numbered definitions and theorems with stable citation anchors.
- Used it to prove a negative result about the shipping engine --- that a set
  of completed identities plus one shared difficulty scalar is insufficient to
  ever become adaptive --- establishing what the replacement must carry before
  any of it was written.

#sectionhead[Platform, Release, and Reuse]

- Operate a 52-package pnpm and Turborepo monorepo spanning TypeScript and
  Rust. A required merge gate scopes lint, type-check, and test runs to
  changed packages and their transitive dependents, backed by a full-repo
  trunk sweep and a standalone Rust job running `clippy` and `cargo-deny`.
- Own the release path end to end: Changesets-driven versioning and
  changelogs across every workspace package, plus GitHub Actions pipelines for
  Docker/GHCR image builds, GitHub Pages and Storybook deploys, WASM releases,
  and signed browser-extension releases.
- Solved cross-extension coupling by hoisting the *contract* --- shared types,
  typestate, and boundary guards --- into a commons package while enforcing
  the idioms through a custom ESLint plugin rather than a shared runtime, so a
  change in one extension cannot produce a defect in another.
- Extracted `transport`, a property-agnostic observe/estimate/plan/act kernel
  for reasoning about partially-observable DOM, and held it to an independence
  bar: its full unit and Playwright conformance suites pass against a null
  adapter alone, with no domain logic anywhere in the tree.

#sectionhead[Engineering Practice]

Architecture decisions are derived before they are coded. Non-trivial
subsystems in this repository are governed by a *canon* --- a formal document
stating the definitions, axioms, and impossibility results the implementation
must satisfy, carrying stable citation anchors and an explicit amendment
protocol. Modules are reviewed against a theorem number rather than a feature
spec: a diff that changes governed behaviour and cites nothing is treated as
incomplete. The discipline exists to make the reasoning the durable artifact
and the code the disposable one --- which is also why the negative results
above were provable rather than merely suspected.
