// Granular résumé content only. Keep presentation and page-layout decisions in
// resume.typ so the same evidence can be rendered by another template.

#let resume-profile = (
  name: "Paul Gathondu",
  title: "Software Engineer",
  email: "paulgathondudev@gmail.com",
  github: "github.com/paulgsc",
  portfolio: "paulgsc.github.io/some-ui",
  location: "Nairobi, Kenya",
  // Set `photo` to an image path when binary assets can be distributed.
  photo: none,
  photo-placeholder: "PG",
  languages: (
    (name: "English", level: "Fluent"),
    (name: "Swahili", level: "Native"),
  ),
  achievements: (
    (title: "Production API ownership", detail: "Designed 39 versioned operations spanning persistence, real-time transport, caching, and background work."),
    (title: "End-to-end engineering", detail: "Owns the path from typed domain models to browser UI, delivery infrastructure, and operational dashboards."),
    (title: "Reliability by design", detail: "Turns overload, dependency failure, restarts, and missing telemetry into explicit, tested system states."),
  ),
  interests: (
    (title: "Adaptive learning", detail: "Modeling knowledge and engagement to choose useful next actions."),
    (title: "Resilient systems", detail: "Making asynchronous software bounded, observable, and explainable."),
  ),
)

#let resume-compositions = (
  backend: (
    label: "Backend & event-driven systems",
    tagline: "Software Engineer --- production Rust services, event-driven systems, and resilient APIs",
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
      "Define six falsifiable fault states --- unreachable, dependency-down, rejecting, saturated, stalled, and observability-blind --- in bounded-cardinality metrics and generated dashboards.",
      "Render missing telemetry as unknown rather than healthy; probe SQLite, NATS, and Redis independently under bounded timeouts.",
      "Version invariants, migrations, route contracts, failure conditions, and operational limits beside source and tests rather than as tribal knowledge.",
    ),
  ),
  systems: (
    label: "Distributed systems & infrastructure",
    tagline: "Software Engineer --- asynchronous Rust infrastructure, messaging, and observable failure semantics",
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
    tagline: "Software Engineer --- Rust learning systems from domain model to production actuation",
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
