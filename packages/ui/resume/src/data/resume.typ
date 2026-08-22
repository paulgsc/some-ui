// Granular résumé content only. Keep presentation and page-layout decisions in
// the templates under src/templates so the same evidence can be rendered by
// any of them.
//
// Everything here is distilled from paulgsc/some-ui and paulgsc/server, and
// every claim traces to code — src/canon/resume.meta.typ records the trace.
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

#let resume-compositions = (
  backend: (
    label: "Backend & event-driven systems",
    tagline: "Software Engineer — production Rust services, event-driven systems, and resilient APIs",
    summary: "Software engineer building production backend services in Rust and TypeScript: versioned HTTP APIs, WebSockets, asynchronous workers, SQL data models, message-broker pipelines, caching, observability, and container delivery. Sole engineer across a 24-crate Rust workspace and a 52-package client platform, owning contracts from browser mutation to durable storage and background actuation.",
    skills: "Rust; TypeScript; Axum; Tokio; SQLx/SQLite; Redis; NATS JetStream; WebSockets; production HTTP/JSON APIs; data modeling; distributed and event-driven systems; asynchronous processing; Docker/cloud infrastructure; Prometheus; Grafana; OpenTelemetry; unit, integration, contract, and Playwright testing; CI/CD",
    projects: (
      (name: "file_host production service", kind: "Rust, Axum, Tokio, SQLx, Redis, NATS JetStream", premise: "A backend boundary is production-ready only when overload, dependency failure, contract drift, and shutdown are designed states rather than surprises.", bullets: (
        "Authored a Rust/Axum service exposing 39 inventoried HTTP operations plus WebSocket transport for sessions, engagement signals, push subscriptions, mood events, tab state, media metadata, and asynchronous processing.",
        "Modeled sessions, consent, engagement gates, interventions, tabs, and mood events in SQLite/SQLx repositories with paired migrations, compile-time query validation, WAL mode, bounded pools, and explicit last-write-wins semantics.",
        "Built per-client token buckets, concurrency/body limits, load shedding, timeouts, typed 429/413/503 outcomes, and refusal metrics that distinguish rejected work from successful low latency.",
        "Connected Redis caching and in-flight coalescing to NATS/JetStream jobs; retryable worker failures are NAKed for redelivery while cache invalidation follows database mutations.",
        "Implemented restart-aware WebSockets with permits, heartbeat/staleness, broadcast isolation, presence, cancellation, and bounded shutdown of SQLite, NATS, sockets, and OpenTelemetry.",
        "Published a schema-versioned route inventory and source-parity tests so undeclared, stale, duplicated, or unaudited Axum routes fail before client contracts drift.",
      )),
      (name: "Study-session and notification system", kind: "Rust services, TypeScript/Zod contracts, Web Push", premise: "An intervention should follow learner state and consent, not a clock, and delivery failure must never become load-bearing for study.", bullets: (
        "Separated warrant, admissibility, and actuation across pure Rust policy, file_host constraints, and push_kit VAPID/RFC 8291/8292 delivery behind a testable transport trait.",
        "Represented engagement as a decaying vector, solved threshold crossings per signal, persisted eligible_at, and reduced the asynchronous waker to an indexed due-work query.",
        "Made consent a data-model precondition; malformed or empty grants become silence, while VAPID key mismatch fails at startup instead of invalidating delivery invisibly.",
        "Integrated typed TypeScript clients with a 48-test contract harness covering 15 operations and Playwright coverage of a real Chromium push/service-worker hop.",
        "Classified expiry, payload rejection, authentication, rate limiting, and transport failure; removed expired subscriptions and persisted outcomes so quiet behavior remains explainable.",
      )),
    ),
    platform: (
      "Operate 24 Rust crates with strict all/pedantic/nursery Clippy groups, cargo-deny, migrated SQLx schema preparation, 300+ test functions, and change-scoped GitHub Actions.",
      "Ship distroless Docker images and compose Axum, Redis, NATS, Caddy, Prometheus, Grafana, exporters, and analytics behind explicit health/readiness boundaries.",
      "Define six falsifiable fault states — unreachable, dependency-down, rejecting, saturated, stalled, and observability-blind — in bounded-cardinality metrics and generated dashboards.",
      "Render missing telemetry as unknown rather than healthy; probe SQLite, NATS, and Redis independently under bounded timeouts.",
      "Version invariants, migrations, route contracts, failure conditions, and operational limits beside source and tests rather than as tribal knowledge.",
    ),
  ),
  systems: (
    label: "Distributed systems & infrastructure",
    tagline: "Software Engineer — asynchronous Rust infrastructure, messaging, and observable failure semantics",
    summary: "Software engineer translating operational guarantees into typed Rust components, bounded concurrency, durable messaging, explicit fault predicates, and independently testable state machines. Own a 24-crate service workspace and the browser systems that consume it.",
    skills: "Rust; TypeScript; Tokio; Axum/Tower; NATS JetStream; Redis; WebSockets; SQLx; data modeling; production APIs; distributed systems; event-driven architecture; asynchronous processing; Docker/cloud infrastructure; Prometheus/Grafana/OpenTelemetry; unit, integration, contract, and browser testing",
    projects: (
      (name: "Real-time transport and work pipeline", kind: "Rust, WebSockets, NATS JetStream, Tokio", premise: "A real-time system must make admission, liveness, redelivery, and termination visible at every process boundary.", bullets: (
        "Built file_host's actor-owned WebSocket service with heartbeat/activity semantics, typed events, broadcast fan-out, global/per-client permits, and cancellation-driven cleanup.",
        "Separated ephemeral socket delivery from durable JetStream processing; typed jobs classify retryable failures for NAK/redelivery rather than treating every error as terminal.",
        "Instrumented live/subscribed connections, guard occupancy, frame kinds, end reasons, refusals, and loop progress so quiet, stalled, saturated, and disconnected remain distinct.",
        "Bound connection capacity, request concurrency, task timeout, body size, cache in-flight work, dependency probes, and shutdown with observable rejection paths.",
      )),
      (name: "Study intervention engine", kind: "Pure Rust domain crates, SQLite, Web Push", premise: "Time may constrain an intervention, but the clock should not manufacture its reason.", bullets: (
        "Split study_domain, intervention, repositories, push_kit, and file_host so pure policy has no HTTP, database, async-runtime, or delivery dependencies.",
        "Computed decaying engagement in closed form and solved the next crossing once per event: O(1) work per signal, zero per idle subject, and indexed discovery of due work.",
        "Represented quiet hours, cooldown, active presence, consent, and configuration as suppression reasons with retry instants instead of silent early returns.",
        "Used generic transports where the binary owns one implementation, preserving compile-time composition and network-free tests of VAPID and outcome classification.",
      )),
      (name: "Browser-worker infrastructure", kind: "Firefox MV3, TypeScript, WebAssembly, Playwright", premise: "Restart is normal for an event-driven worker, and browser state must survive it without hidden runtime coupling.", bullets: (
        "Built Suspender Ledger on native discard; startup reconciliation restores tab invariants after termination and bounded queues isolate bulk failures.",
        "Validated popup/worker/content protocols, isolated browser differences, emitted one flat MV3 worker, and gated signed releases on type, unit, lint, web-ext, and license checks.",
        "Encoded progressive disclosure as discriminated-union transitions and reconciled virtualized DOM feeds through MutationObserver; illegal states fail compilation.",
        "Extracted a domain-free observe/estimate/plan/act kernel whose unit and Playwright suites pass against a null adapter.",
      )),
    ),
    platform: (
      "Run strict Rust/TypeScript CI, SQLx checks, route parity, API contracts, browser conformance, and signed release gates.",
      "Compose distroless services with Caddy, Redis, NATS, Prometheus, Grafana, exporters, and service-specific readiness probes.",
      "Generate dashboards from Jsonnet with measured-good, measured-bad, and missing/unknown as irreducible states.",
      "Use bounded-cardinality Prometheus metrics and OpenTelemetry traces for HTTP, dependencies, pools, cache, admission, connections, and loop progress.",
      "Maintain typed shared crates for transport, caching, metrics, connections, events, repositories, and policy rather than copying infrastructure between binaries.",
    ),
  ),
  learning: (
    label: "Adaptive learning & product engineering",
    tagline: "Software Engineer — Rust learning systems from domain model to production actuation",
    summary: "Software engineer building learning software that models knowledge and engagement rather than advancing a fixed schedule. Own pure Rust policy, SQL persistence, production APIs, asynchronous notification delivery, Rust/WASM engines, React experiences, observability, testing, and deployment.",
    skills: "Rust; WebAssembly; TypeScript; React; Axum; SQLx; Web Push; state estimation; data modeling; production APIs; microservice integration; distributed and event-driven systems; asynchronous processing; Docker/cloud infrastructure; unit, integration, contract, Vitest, and Playwright testing",
    projects: (
      (name: "Adaptive learning platform", kind: "Rust/WebAssembly engine, React application", premise: "Learning software should estimate what a learner knows and choose the smallest next concept that produces progress.", bullets: (
        "Built a pure-Rust engine compiled to WebAssembly and consumed by React hex-grid, TOPIK exam-prep, and typing-drill modules on one curriculum platform.",
        "Generalized exercises from single glyphs to typed multi-token Stimulus/Answer models after deriving the prior model's ceiling before implementation.",
        "Authored a formal model of latent state, observation, estimation, policy, persistence, and falsifiers; proved a completed-item set plus one scalar cannot become adaptive.",
        "Kept study_domain independent of storage and transport so lessons, sessions, scores, and curriculum rules test without Axum, SQLx, Tokio, or browser code.",
      )),
      (name: "Production study-session backend", kind: "file_host, Rust, Axum, SQLx, Redis", premise: "Local progress and the server's durable view need an explicit contract, migration path, and failure policy.", bullets: (
        "Authored versioned Rust endpoints for session CRUD, progress sync, engagement signals, push configuration/subscriptions, and test delivery over typed SQL repositories.",
        "Modeled identity, revision, progress, timestamps, consent, engagement classes, and last-write-wins updates instead of hiding distributed assumptions in React.",
        "Published 39 operations as schema-versioned JSON and proved parity with Axum registration sources; the TypeScript client imports it for drift and live-contract checks.",
        "Kept optional notifications from gating study: invalid enabled configuration fails fast, while deliberately disabled push returns typed unavailability and permits boot.",
      )),
      (name: "Event-driven study nudge", kind: "Rust policy crates, Web Push, asynchronous worker", premise: "A reminder is useful only when declining engagement warrants it and consent, presence, cooldown, and local time permit it.", bullets: (
        "Modeled independently decaying presence, momentum, mastery, and freshness; the dominant deficit selects lesson, resume, review, or new-material intervention.",
        "Solved threshold crossings on signals and persisted eligible_at; a cancellation-aware waker queries only due rows and records its last successful pass.",
        "Used recent WebSocket activity for presence so a pinned background tab cannot suppress intervention forever.",
        "Made malformed consent silent, used an explicit IANA time zone, rejected VAPID mismatch at startup, and classified provider outcomes for cleanup and diagnosis.",
        "Tested decay/policy arithmetic, repositories, constraints, payloads, VAPID, live HTTP schemas, and real browser service-worker delivery at natural boundaries.",
      )),
    ),
    platform: (
      "Ship Rust services and web UI in Docker behind Caddy/Nginx with TLS, readiness, Redis, NATS, Prometheus, Grafana, and Docker Hub/GitHub Actions delivery.",
      "Exercise 24 backend crates with 300+ tests, strict Clippy, cargo-deny, SQLx preparation, route parity, and downstream contract/browser suites.",
      "Treat missing telemetry as a fault; dashboards expose unreachable, dependency-down, rejecting, saturated, stalled, and blind states.",
      "Derive architecture from written domain boundaries and falsifiable failures kept beside migrations, source, metrics, and tests.",
      "Own the path from learning-state model through schema, HTTP contract, decision worker, push provider, browser worker, UI, and operational dashboard.",
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
      title: "39-operation service surface",
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
      title: "300+ tests across 24 crates",
      body: "Strict all/pedantic/nursery Clippy, cargo-deny, SQLx preparation, route parity, live contracts, and real-browser coverage.",
    ),
  ),
  systems: (
    (
      title: "Restart-aware real-time transport",
      body: "Actor-owned WebSockets with permits, heartbeat and staleness, broadcast isolation, presence, and cancellation-driven shutdown.",
    ),
    (
      title: "Six falsifiable fault states",
      body: "Unreachable, dependency-down, rejecting, saturated, stalled, and observability-blind, each carried by bounded-cardinality metrics.",
    ),
    (
      title: "Missing telemetry reads as unknown",
      body: "Dashboards never render an absent signal as healthy; SQLite, NATS, and Redis are probed independently under bounded timeouts.",
    ),
    (
      title: "Policy with no infrastructure",
      body: "Pure Rust domain crates carry no HTTP, database, runtime, or delivery dependency, so policy arithmetic tests without a server.",
    ),
  ),
  learning: (
    (
      title: "Rust engine, WebAssembly delivery",
      body: "One pure-Rust learning engine compiled to WASM and consumed by hex-grid, TOPIK exam-prep, and typing-drill modules on a shared platform.",
    ),
    (
      title: "Engagement as a decaying vector",
      body: "Threshold crossings solved once per signal and persisted as eligible_at: O(1) work per event, zero per idle subject.",
    ),
    (
      title: "Consent is a data-model precondition",
      body: "Malformed or empty grants become silence; a VAPID key mismatch fails at startup rather than invalidating delivery invisibly.",
    ),
    (
      title: "48-test contract harness",
      body: "Typed TypeScript clients checked against 15 live operations, plus Playwright coverage of a real Chromium push and service-worker hop.",
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
  systems: (
    (label: "Languages", items: "Rust, TypeScript, SQL"),
    (label: "Concurrency", items: "Tokio, actors, permits, cancellation, backpressure"),
    (label: "Messaging", items: "NATS JetStream, WebSockets, typed jobs"),
    (label: "Data", items: "SQLx, SQLite, Redis, coalesced caching"),
    (label: "Operations", items: "Docker, distroless, Prometheus, Grafana, Jsonnet"),
    (label: "Quality", items: "Clippy, cargo-deny, route parity, contract, browser"),
  ),
  learning: (
    (label: "Languages", items: "Rust, TypeScript, SQL"),
    (label: "Client", items: "React, WebAssembly, Vite, TanStack"),
    (label: "Services", items: "Axum, SQLx, Redis, Web Push"),
    (label: "Modeling", items: "State estimation, decay models, curriculum policy"),
    (label: "Operations", items: "Docker, Caddy, GitHub Actions, Docker Hub"),
    (label: "Quality", items: "Vitest, Playwright, contract harness, 300+ Rust tests"),
  ),
)

// Where the evidence lives. The rail names these because a reader who wants
// to verify a claim should not have to search for the repository it came from.
#let resume-repositories = (
  (
    name: "paulgsc/server",
    body: "24-crate Rust workspace: Axum services, SQLx repositories, NATS JetStream, Redis, Web Push, Prometheus/Grafana.",
  ),
  (
    name: "paulgsc/some-ui",
    body: "52-package TypeScript platform: React apps, Rust/WASM engines, Firefox MV3 extensions, contract and browser suites.",
  ),
)

// The role line under EXPERIENCE. Applicant-tracking parsers look for a
// title/organisation/date triple beneath a standard "Experience" heading; the
// projects below it are the detail, not a substitute for it.
#let resume-engagement = (
  role: "Software Engineer — independent systems work",
  org: "paulgsc/server · paulgsc/some-ui",
  dates: "2024 — Present",
  note: "Sole engineer",
)
