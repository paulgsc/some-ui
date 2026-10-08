// Granular résumé content only. Keep presentation and page-layout decisions in
// the templates under src/templates so the same evidence can be rendered by
// any of them.
//
// Everything here is distilled from paulgsc/some-ui and paulgsc/server, and
// every claim traces to code — src/canon/resume.meta.typ records the trace,
// and each claim's `evidence` below names the paths it rests on.
// Facts that live outside those repositories (degrees, spoken languages,
// certifications, non-engineering roles) belong in src/data/personal.typ.

#import "personal.typ": personal

#let resume-profile = (
  name: "Paul Gathondu",
  title: "Software Engineer",
  email: "paulgathondudev@gmail.com",
  github: "github.com/paulgsc",
  portfolio: "paulgsc.github.io/some-ui",
  location: personal.location,
  // Set `photo` to an image path when binary assets can be distributed.
  photo: none,
  photo-placeholder: "PG",
)

// Where a claim's evidence lives: a path in one of the two repositories it is
// distilled from, linked on that repository's default branch. Every project
// bullet and practice line is `(text: ..., evidence: (...))`, so a reader (or
// an agent reading the published resume-*.json/.md) can open the source a
// claim rests on instead of taking it on trust. If a path stops supporting
// its claim, cut or fix the claim, as for any other evidence.
//
// scripts/export-data.mjs fails the build when a some-ui path does not exist.
// paulgsc/server is not checked out in CI, so its paths are checked only when
// RESUME_SERVER_CHECKOUT points at a clone (see that script).
#let ui(path) = (repo: "paulgsc/some-ui", path: path)
#let server(path) = (repo: "paulgsc/server", path: path)

#let resume-compositions = (
  backend: (
    label: "Backend & event-driven systems",
    tagline: "Software Engineer — Backend & API Systems",
    summary: "Software engineer building production-oriented web services in Rust and TypeScript: versioned REST/HTTP APIs, WebSockets, asynchronous workers, SQL query and schema design, message-broker pipelines, caching, and container delivery. Independently designed and built across a multi-crate Rust workspace and a TypeScript client platform, owning contracts from browser mutation to durable storage and background actuation.",
    skills: "Rust; TypeScript; Axum; Tokio; SQLx/SQLite; Redis; NATS JetStream; WebSockets; REST APIs; JSON; Node.js; SQL query and schema design; distributed and event-driven systems; asynchronous processing; Docker; Prometheus/Grafana/OpenTelemetry; unit, integration, contract, and Playwright testing; GitHub Actions CI/CD",
    projects: (
      (name: "file_host backend service", kind: "Rust, Axum, Tokio, SQLx, Redis, NATS JetStream", premise: "A backend boundary is production-ready only when overload, dependency failure, contract drift, and shutdown are designed states rather than surprises.", bullets: (
        (text: "Authored a Rust/Axum service exposing 40+ inventoried HTTP operations plus WebSocket transport for sessions, engagement signals, push subscriptions, mood events, tab state, media metadata, and asynchronous processing.", evidence: (server("apps/servers/file_host/src/routes"), server("apps/servers/file_host/src/websocket.rs"), server("apps/servers/file_host/docs/route-inventory.md"),)),
        (text: "Modeled sessions, consent, engagement gates, interventions, tabs, and mood events in SQLite/SQLx repositories with paired migrations, compile-time query validation, WAL mode, bounded pools, and explicit last-write-wins semantics.", evidence: (server("crates/db"), server("migrations"), server("apps/servers/file_host/src/main.rs"),)),
        (text: "Built per-client token buckets, concurrency/body limits, load shedding, timeouts, typed 429/413/503 outcomes, and refusal metrics that distinguish rejected work from successful low latency.", evidence: (server("apps/servers/file_host/src/rate_limiter/token_bucket.rs"), server("apps/servers/file_host/src/metrics/refusals.rs"), server("apps/servers/file_host/src/main.rs"),)),
        (text: "Connected Redis caching and in-flight coalescing to NATS/JetStream jobs; retryable worker failures are NAKed for redelivery while cache invalidation follows database mutations.", evidence: (server("crates/some-cache/src/dedup.rs"), server("crates/some-transport/src/nats/jetstream.rs"), server("apps/servers/file_host/src/handlers/db/tab.rs"),)),
        (text: "Implemented restart-aware WebSockets with permits, heartbeat/staleness, broadcast isolation, presence, cancellation, and bounded shutdown of SQLite, NATS, sockets, and OpenTelemetry.", evidence: (server("apps/servers/file_host/src/websocket"), server("apps/servers/file_host/src/websocket/shutdown.rs"), server("apps/servers/file_host/src/websocket/heartbeat.rs"),)),
        (text: "Published a schema-versioned route inventory and source-parity tests so undeclared, stale, duplicated, or unaudited Axum routes fail before client contracts drift.", evidence: (server("apps/servers/file_host/src/routes/inventory.rs"), server("apps/servers/file_host/src/bin/dump_routes.rs"), ui("packages/contract-harness/routes.server.json"),)),
      )),
      (name: "Study-session and notification system", kind: "Rust services, TypeScript/Zod contracts, Web Push", premise: "An intervention should follow learner state and consent, not a clock, and delivery failure must never become load-bearing for study.", bullets: (
        (text: "Separated warrant, admissibility, and actuation across pure Rust policy, file_host constraints, and push_kit VAPID/RFC 8291/8292 delivery behind a testable transport trait.", evidence: (server("crates/intervention"), server("apps/servers/file_host/src/nudge/constraints.rs"), server("crates/push_kit/src/transport.rs"),)),
        (text: "Represented engagement as a decaying vector, solved threshold crossings per signal, persisted eligible_at, and reduced the asynchronous waker to an indexed due-work query.", evidence: (server("crates/intervention/src/charge.rs"), server("apps/servers/file_host/src/nudge/waker.rs"), server("migrations/20260924001000_index_intervention_log_decided_at.up.sql"),)),
        (text: "Made consent a data-model precondition; malformed or empty grants become silence, while VAPID key mismatch fails at startup instead of invalidating delivery invisibly.", evidence: (server("crates/db/push/src/repository/subscription.rs"), server("apps/servers/file_host/src/nudge.rs"),)),
        (text: "Integrated typed TypeScript/Zod clients checked by a contract harness that diffs every contract against the server's generated route inventory, plus Playwright coverage of a real Chromium push/service-worker hop.", evidence: (ui("packages/contract-harness"), ui("apps/www/tests/study-nudge/service-worker.spec.ts"), ui("apps/www/src/lib/study-nudge/service-worker.ts"),)),
        (text: "Classified expiry, payload rejection, authentication, rate limiting, and transport failure; removed expired subscriptions and persisted outcomes so quiet behavior remains explainable.", evidence: (server("crates/push_kit/src/outcome.rs"), server("crates/push_kit/src/sender.rs"), server("crates/db/engagement/src/repository.rs"),)),
      )),
    ),
    platform: (
      (text: "Maintain a multi-crate Rust workspace under a ratcheted all/pedantic/nursery Clippy baseline that blocks new findings, cargo-deny, migrated SQLx schema preparation, 300+ test functions, and change-scoped GitHub Actions.", evidence: (server("Cargo.toml"), server(".github/workflows/lint.yml"), server("scripts/clippy_baseline.json"), server("deny.toml"), server(".github/workflows/test.yml"),)),
      (text: "Ship distroless Docker images and compose Axum, Redis, NATS, Caddy, Prometheus, Grafana, exporters, and analytics behind explicit health/readiness boundaries.", evidence: (server("infra/docker"), server("infra/compose"), server("infra/Caddyfile"),)),
      (text: "Define six falsifiable fault states — unreachable, dependency-down, rejecting, saturated, stalled, and observability-blind — in bounded-cardinality metrics and generated dashboards.", evidence: (server("docs/fault-conditions.md"), server("infra/grafana/dashboards"),)),
      (text: "Render missing telemetry as unknown rather than healthy; probe SQLite, NATS, and Redis independently under bounded timeouts.", evidence: (server("docs/dashboard-honesty.md"), server("apps/servers/file_host/src/handlers/readiness.rs"),)),
      (text: "Version invariants, migrations, route contracts, failure conditions, and operational limits beside source and tests rather than as tribal knowledge.", evidence: (server("docs"), server("migrations"), server("apps/servers/file_host/docs/route-inventory.md"),)),
    ),
  ),
  platform: (
    label: "Developer platform & release engineering",
    tagline: "Software Engineer — Web Platform & Developer Tools",
    summary: "Software engineer building developer-platform tooling across a large TypeScript/Rust monorepo: change-scoped CI/CD pipeline automation, cross-repo contract and route-parity checks, containerized release delivery, and signed browser-extension releases. Work is verified by unit, contract, and browser test suites that gate every release rather than by hand.",
    skills: "TypeScript; Rust; Node.js; GitHub Actions; Turbo and Cargo dependency graphs; Docker; DevOps automation; CI/CD pipeline automation; contract and route-parity testing; SQLx schema preparation; Changesets release automation; Playwright; Prometheus/Grafana; observability",
    projects: (
      (name: "Cross-repo contract and route parity", kind: "TypeScript, Zod, generated route inventories", premise: "A client and server repository that each describe the same API independently will drift unless something proves they still agree.", bullets: (
        (text: "Authored a TypeScript/Zod contract harness checked against a schema-versioned server route inventory and live HTTP responses across two independently deployed repositories.", evidence: (ui("packages/contract-harness"), ui("packages/contract-harness/routes.server.json"),)),
        (text: "Gated server pull requests on the client's contracts so a route change that breaks one fails before merge, with integration tests that start a real HTTP server and assert concrete schema and route divergence.", evidence: (server(".github/workflows/routes.yml"), ui("scripts/sync-server-routes.sh"), ui("packages/contract-harness/tests/probe.integration.test.ts"),)),
        (text: "Distinguished contract-breaking drift from informative slack — an undeclared field the server added, or a declared-optional field it never sends — instead of collapsing both into one failure.", evidence: (ui("packages/contract-harness/src"), ui("packages/contract-harness/README.md"),)),
      )),
      (name: "CI/CD and release automation", kind: "GitHub Actions, Turbo, Docker, Changesets, web-ext", premise: "A monorepo's CI should scope to what a change actually touches, and a release should be reproducible from source rather than assembled by hand.", bullets: (
        (text: "Implemented change-scoped GitHub Actions on Turbo/Cargo dependency graphs so lint, typecheck, and test run only against changed packages and their transitive dependents, backed by a full-repo nightly sweep.", evidence: (ui(".github/workflows/pr.yml"), ui(".github/workflows/_detect-changes.yml"), ui(".github/workflows/trunk.yml"), ui("turbo.json"),)),
        (text: "Built Docker image build/publish pipelines for the web and server images, SQLx offline-query preparation, and Changesets-driven versioning across the workspace.", evidence: (ui(".github/workflows/www-docker-release.yml"), ui("apps/www/Dockerfile"), server(".github/workflows/build-image.yml"), ui(".changeset"),)),
        (text: "Built a human-gated extension release pipeline that derives AMO notes from versioned changelogs, validates reviewer metadata and field limits, synchronizes manifest/package versions, and blocks signing when source and artifact versions drift.", evidence: (ui(".github/workflows/extension-release.yml"), ui("extensions/scripts/build-amo-metadata.mjs"), ui("extensions/scripts/sync-manifest-version.mjs"), ui(".github/workflows/_extension-sign.yml"),)),
      )),
    ),
    platform: (
      (text: "Run Rust/TypeScript CI with a ratcheted Clippy baseline, SQLx checks, route parity, API contracts, browser conformance, and signed release gates.", evidence: (server(".github/workflows/lint.yml"), server("scripts/check_clippy_baseline.py"), server(".github/workflows/routes.yml"), ui(".github/workflows/pr.yml"),)),
      (text: "Compose distroless services with Caddy, Redis, NATS, Prometheus, Grafana, exporters, and service-specific readiness probes.", evidence: (server("infra/compose"), server("infra/Caddyfile"), server("infra/docker"),)),
      (text: "Generate dashboards from Jsonnet with measured-good, measured-bad, and missing/unknown as irreducible states.", evidence: (server("infra/grafana/dashboards"), server("docs/dashboard-honesty.md"),)),
      (text: "Use bounded-cardinality Prometheus metrics and OpenTelemetry traces for HTTP, dependencies, pools, cache, admission, connections, and loop progress.", evidence: (server("apps/servers/file_host/src/metrics"), server("apps/servers/file_host/src/trace.rs"),)),
      (text: "Maintain typed shared crates for transport, caching, metrics, connections, events, repositories, and policy rather than copying infrastructure between binaries.", evidence: (server("crates"),)),
    ),
  ),
  fullstack: (
    label: "Full-stack web & product engineering",
    tagline: "Full-Stack Software Engineer | TypeScript, React, Rust",
    summary: "Full-stack software engineer building TypeScript/React web applications, reusable frontend components, browser extensions, and Rust/WebAssembly engines backed by versioned REST APIs. Owns features from domain modeling and UI implementation through persistence, automated testing, container builds, and release workflows.",
    skills: "TypeScript; React; Rust/WebAssembly; reusable React components; REST API contracts; browser extensions; MV3 service workers; responsive web UI; cross-browser Playwright testing; Node.js; Vite; TanStack; Vitest; GitHub Actions CI/CD",
    projects: (
      (name: "Adaptive learning platform", kind: "Rust/WebAssembly engine, React application", premise: "Learning software should estimate what a learner knows and choose the smallest next concept that produces progress.", bullets: (
        (text: "Built a pure-Rust engine compiled to WebAssembly and consumed by React hex-grid, TOPIK exam-prep, and typing-drill web applications on one curriculum platform.", evidence: (ui("crates/hangul-game-core"), ui("packages/ui/honeycomb"), ui("packages/ui/topik"), ui("crates/leetype_wasm"),)),
        (text: "Implemented reusable React components generalized from single-glyph to typed multi-token Stimulus/Answer models after deriving the prior model's ceiling before implementation.", evidence: (ui("docs/canon/hangul-progression-canon.typ"), ui("crates/hangul-game-core"),)),
        (text: "Authored a formal model of latent state, observation, estimation, policy, persistence, and falsifiers; proved a completed-item set plus one scalar cannot become adaptive.", evidence: (ui("docs/canon/adaptive-learning-canon.typ"),)),
        (text: "Kept study_domain independent of storage and transport so lessons, sessions, scores, and curriculum rules test without Axum, SQLx, Tokio, or browser code.", evidence: (server("crates/study_domain"),)),
      )),
      (name: "Browser extension platform", kind: "TypeScript, Firefox/Chromium MV3, Playwright, WebAssembly", premise: "A browser is host to code it did not author, so an extension's own UI and state must stay provably isolated from the page around it.", bullets: (
        (text: "Built typed popup/worker/content protocols and MV3 service-worker bundles across five shipped Firefox/Chromium extensions, with platform shims isolating browser-specific APIs.", evidence: (ui("extensions/suspender-ledger/src/types/messages.ts"), ui("extensions/suspender-ledger/src/lib/platform/firefox.ts"), ui("extensions/common/GOOD_CITIZEN.md"),)),
        (text: "Modeled UI and resolver states as exhaustive discriminated unions so illegal transitions fail at compile time rather than at runtime.", evidence: (ui("extensions/some-censor/src/lib/content/fsm.ts"), ui("extensions/some-censor/src/types/states.ts"),)),
        (text: "Built a post-actuation contrast-closure pass that remeasures computed foreground/background colors against WCAG AA's 4.5:1 floor, selects a hue-preserving foreground repair, realizes it across document and open Shadow DOM scopes, and rechecks hover/focus color changes after interaction settles.", evidence: (ui("extensions/some-filter/src/adapter/legibility-audit.ts"), ui("extensions/some-filter/src/adapter/foreground-repair.ts"), ui("extensions/some-filter/src/adapter/shadow-scope-theming.ts"), ui("extensions/some-filter/tests/e2e/specs/issue-1341-sfrc2-foreground-repair.spec.ts"),)),
        (text: "Built a typed lifecycle for document and open-Shadow-DOM scopes, browser-verified in Chromium for late-root discovery, coverage of unresolved content, and self-healing after host-page mutation, plus a per-scope generation counter, unit-tested, that rejects stale asynchronous completions.", evidence: (ui("extensions/some-filter/src/adapter/scope-registry.ts"), ui("extensions/some-filter/src/adapter/shadow-scope-discovery.ts"), ui("extensions/some-filter/tests/e2e/specs/issue-1267-sfdc-shadow-custody.spec.ts"), ui("extensions/some-filter/src/adapter/__tests__/scope-registry.test.ts"),)),
      )),
    ),
    platform: (
      (text: "Ship Rust services and web UI in Docker behind Caddy/Nginx with TLS, readiness, Redis, NATS, Prometheus, Grafana, and Docker Hub/GitHub Actions delivery.", evidence: (server("infra/compose"), ui("apps/www/Dockerfile"), ui(".github/workflows/www-docker-release.yml"),)),
      (text: "Exercise a multi-crate Rust workspace with 300+ tests, a ratcheted Clippy baseline, cargo-deny, SQLx preparation, route parity, and downstream contract/browser suites.", evidence: (server(".github/workflows/test.yml"), server("scripts/clippy_baseline.json"), server("deny.toml"), ui("packages/contract-harness"),)),
      (text: "Treat missing telemetry as a fault; dashboards expose unreachable, dependency-down, rejecting, saturated, stalled, and blind states.", evidence: (server("docs/fault-conditions.md"), server("docs/dashboard-honesty.md"),)),
      (text: "Derive architecture from written domain boundaries and falsifiable failures kept beside migrations, source, metrics, and tests.", evidence: (server("docs"), ui("docs/canon"),)),
      (text: "Own the path from learning-state model through schema, HTTP contract, decision worker, push provider, browser worker, UI, and operational dashboard.", evidence: (server("crates/intervention"), server("apps/servers/file_host/src/nudge"), ui("apps/www/src/lib/study-nudge"), server("infra/grafana/dashboards"),)),
    ),
  ),
)

// ── Rail content ───────────────────────────────────────────────────────────
// The reference layout carries a second, scannable column. These are not new
// claims: each one restates evidence already present in the compositions above
// in the shape a skimming reader (and a keyword parser) picks up first.

#let resume-highlights = (
  backend: (
    (
      title: "40+ operation service surface",
      body: "Authored file_host's inventoried HTTP and WebSocket surface, published as schema-versioned JSON and held to source parity by test.",
    ),
    (
      title: "Overload as a designed state",
      body: "Token buckets, concurrency and body limits, load shedding, and typed 429/413/503 outcomes, with refusal metrics kept distinct from fast success.",
    ),
    (
      title: "Durable work, not best effort",
      body: "Redis coalescing in front of NATS JetStream; retryable worker failures are NAKed for redelivery and cache invalidation follows the database mutation.",
    ),
    (
      title: "300+ tests across a multi-crate Rust workspace",
      body: "Ratcheted all/pedantic/nursery Clippy baseline, cargo-deny, SQLx preparation, route parity, live contracts, and real-browser coverage.",
    ),
  ),
  platform: (
    (
      title: "Cross-repo contract parity",
      body: "A TypeScript/Zod contract harness checked against a generated server route inventory and live HTTP responses; a server PR that breaks a client contract fails before merge.",
    ),
    (
      title: "Change-scoped CI",
      body: "Turbo/Cargo dependency graphs scope lint, typecheck, and test to changed packages and their transitive dependents, backed by a full-repo nightly sweep.",
    ),
    (
      title: "Five signed extension releases",
      body: "Every browser-extension release is gated on typecheck, unit tests, lint, and signed web-ext packaging before publish.",
    ),
    (
      title: "Reproducible container delivery",
      body: "Docker image build/publish pipelines, SQLx offline-query preparation, and Changesets-driven versioning across the workspace.",
    ),
  ),
  fullstack: (
    (
      title: "Rust engine, WebAssembly delivery",
      body: "One pure-Rust learning engine compiled to WASM and consumed by hex-grid, TOPIK exam-prep, and typing-drill React web applications on a shared platform.",
    ),
    (
      title: "Five shipped browser extensions",
      body: "Typed popup/worker/content protocols and MV3 service-worker bundles, with a cross-browser Playwright test corpus bundling the real shipped modules.",
    ),
    (
      title: "Illegal states fail to compile",
      body: "UI and resolver states modeled as exhaustive discriminated unions, so an invalid transition is a compile error rather than a runtime bug.",
    ),
    (
      title: "Reusable component and contract layer",
      body: "React components and REST API contracts shared across a curriculum platform and multiple browser extensions rather than copied per surface.",
    ),
  ),
)

// Grouped capabilities for the rail. Same terms as each composition's `skills`
// line, arranged so a reader can find a stack without reading a paragraph.
#let resume-toolbox = (
  backend: (
    (label: "Languages", items: "Rust, TypeScript, SQL"),
    (label: "Services", items: "Axum, Tower, Tokio, WebSockets, REST/JSON"),
    (label: "Data", items: "SQLx, SQLite, Postgres, Redis, migrations"),
    (label: "Messaging", items: "NATS JetStream, Web Push, async workers"),
    (label: "Operations", items: "Docker, Caddy, Prometheus, Grafana, OpenTelemetry"),
    (label: "Quality", items: "Unit, integration, contract, Playwright, CI/CD"),
  ),
  platform: (
    (label: "Languages", items: "TypeScript, Rust"),
    (label: "CI/CD", items: "GitHub Actions, Turbo/Cargo graphs, change-scoped tests"),
    (label: "Contracts", items: "Zod, route parity, drift detection"),
    (label: "Delivery", items: "Docker, Changesets, signed web-ext releases"),
    (label: "Data", items: "SQLx schema preparation"),
    (label: "Quality", items: "Playwright, Prometheus/Grafana, DevOps automation"),
  ),
  fullstack: (
    (label: "Languages", items: "TypeScript, Rust"),
    (label: "Client", items: "React, WebAssembly, Vite, TanStack"),
    (label: "Web platform", items: "REST API contracts, MV3 service workers, browser APIs"),
    (label: "Modeling", items: "State estimation, decay models, curriculum policy"),
    (label: "Operations", items: "Docker, Caddy, GitHub Actions, Docker Hub"),
    (label: "Quality", items: "Vitest, Playwright, contract harness, 300+ Rust tests"),
  ),
)

// Where the evidence lives. The rail names these because a reader who wants
// to verify a claim should not have to search for the repository it came from.
// Package/crate counts are deliberately not restated here — they drift with
// the workspace and are already tracked, with the derivation method, in
// src/canon/resume.meta.typ's Counts note.
#let resume-repositories = (
  (
    name: "paulgsc/server",
    body: "Multi-crate Rust workspace: Axum services, SQLx repositories, NATS JetStream, Redis, Web Push, Prometheus/Grafana.",
  ),
  (
    name: "paulgsc/some-ui",
    body: "TypeScript monorepo: React apps, Rust/WASM engines, Firefox MV3 extensions, contract and browser test suites.",
  ),
)

// The role line under EXPERIENCE. Applicant-tracking parsers look for a
// title/organisation/date triple beneath a standard "Experience" heading; the
// projects below it are the detail, not a substitute for it.
#let resume-engagement = (
  role: "Software Engineer — independent systems work",
  org: "paulgsc/server · paulgsc/some-ui",
  dates: "2024 — Present",
  // Deliberately not "Sole engineer": that phrase reads as a company-tenure
  // fact (headcount of one), which this is not. This is personal,
  // unpaid, open-source work with no employer and no team.
  note: "Independent open-source project (no employer)",
)
