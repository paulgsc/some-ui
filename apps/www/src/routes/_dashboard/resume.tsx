import type { JSX, MouseEvent } from "react"
import { useEffect, useState } from "react"
import { useTheme } from "@/providers/theme"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"
import { Download, Layers3 } from "lucide-react"

// GitHub Pages serves this app under /<repo>/ (see vite.config.ts's
// VITE_BASE_PATH); a bare "/resume.pdf" would request the domain root
// instead and 404 there. import.meta.env.BASE_URL always ends in "/", so
// this resolves correctly for GitHub Pages, the Docker/nginx build, and
// local dev alike.
const RESUME_COMPOSITIONS = [
  { id: "backend", label: "Backend & event-driven systems" },
  { id: "systems", label: "Systems & browser infrastructure" },
  { id: "learning", label: "Adaptive learning & product engineering" },
] as const
type ResumeComposition = (typeof RESUME_COMPOSITIONS)[number]["id"]
const RESUME_COMPOSITION_KEY = "some-ui:resume-composition"
const MOBILE_PREVIEW_QUERY = "(max-width: 767px)"

const RESUME_TRANSCRIPT = {
  summary:
    "Software engineer building production Rust and TypeScript systems across backend services, browser infrastructure, and adaptive learning products. Sole engineer across a 24-crate Rust workspace and a 52-package client platform, owning contracts from browser mutation to durable storage and background actuation.",
  skills:
    "Rust; TypeScript; React; WebAssembly; Axum; Tokio; SQLx and SQLite; Redis; NATS JetStream; WebSockets; Web Push; HTTP and JSON APIs; data modeling; distributed and event-driven systems; Docker and cloud infrastructure; Prometheus; Grafana; OpenTelemetry; unit, integration, contract, Vitest, and Playwright testing; CI/CD.",
  projects: [
    {
      name: "file_host production service",
      technologies: "Rust, Axum, Tokio, SQLx, Redis, and NATS JetStream",
      bullets: [
        "Authored a Rust and Axum service exposing 39 inventoried HTTP operations plus WebSocket transport for sessions, engagement signals, push subscriptions, mood events, tab state, media metadata, and asynchronous processing.",
        "Modeled sessions, consent, engagement gates, interventions, tabs, and mood events in SQLite and SQLx repositories with paired migrations, compile-time query validation, bounded pools, and explicit last-write-wins semantics.",
        "Built bounded admission controls, typed overload outcomes, Redis caching, JetStream jobs with redelivery, restart-aware WebSockets, and observable shutdown of service dependencies.",
      ],
    },
    {
      name: "Adaptive learning and study intervention platform",
      technologies:
        "Rust, WebAssembly, React, SQLx, Web Push, and TypeScript contracts",
      bullets: [
        "Built a pure-Rust learning engine compiled to WebAssembly and consumed by React curriculum, exam-preparation, and typing-drill experiences.",
        "Separated engagement policy, persistence, and notification delivery; represented consent, quiet hours, cooldown, active presence, and configuration as explicit constraints.",
        "Integrated typed TypeScript clients with contract tests and Playwright coverage of a real Chromium push and service-worker delivery hop.",
      ],
    },
    {
      name: "Browser-worker infrastructure",
      technologies: "Firefox MV3, TypeScript, WebAssembly, and Playwright",
      bullets: [
        "Built Suspender Ledger on native tab discard with startup reconciliation, bounded work queues, validated extension protocols, and signed release gates.",
        "Encoded UI workflows as discriminated-union transitions and extracted a domain-free observe, estimate, plan, and act kernel tested with unit and browser suites.",
      ],
    },
  ],
  practice: [
    "Operate 24 Rust crates with strict Clippy groups, cargo-deny, SQLx schema preparation, more than 300 test functions, and change-scoped GitHub Actions.",
    "Ship distroless Docker images with Caddy, Redis, NATS, Prometheus, Grafana, exporters, analytics, and explicit health and readiness boundaries.",
    "Represent unreachable, dependency-down, rejecting, saturated, stalled, and observability-blind states in bounded-cardinality metrics and generated dashboards.",
  ],
} as const

function isResumeComposition(value: string | null): value is ResumeComposition {
  return RESUME_COMPOSITIONS.some(({ id }) => id === value)
}

function initialComposition(): ResumeComposition {
  if (typeof window === "undefined") return "backend"
  const stored = localStorage.getItem(RESUME_COMPOSITION_KEY)
  return isResumeComposition(stored) ? stored : "backend"
}

const ResumeTranscript = ({ label }: { label: string }): JSX.Element => (
  <section className="sr-only" aria-label={`${label} résumé transcript`}>
    <h2>Paul Gathondu</h2>
    <p>{label}</p>
    <address>
      <a href="mailto:paulgathondudev@gmail.com">paulgathondudev@gmail.com</a>
      {" · "}
      <a href="https://github.com/paulgsc">github.com/paulgsc</a>
      {" · "}
      <a href="https://paulgsc.github.io/some-ui">paulgsc.github.io/some-ui</a>
    </address>
    <h3>Summary</h3>
    <p>{RESUME_TRANSCRIPT.summary}</p>
    <h3>Core capabilities</h3>
    <p>{RESUME_TRANSCRIPT.skills}</p>
    <h3>Selected work — some-ui, sole engineer (2024 — Present)</h3>
    {RESUME_TRANSCRIPT.projects.map((project) => (
      <section key={project.name}>
        <h4>{project.name}</h4>
        <p>{project.technologies}</p>
        <ul>
          {project.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      </section>
    ))}
    <h3>Platform, release, and engineering practice</h3>
    <ul>
      {RESUME_TRANSCRIPT.practice.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </section>
)

const ResumeRoute = (): JSX.Element => {
  const { resolved } = useTheme()
  const darkPreview = resolved.mode === "dark"
  const [composition, setCompositionState] =
    useState<ResumeComposition>(initialComposition)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const pdfPath = `${import.meta.env.BASE_URL}resume-${composition}.pdf`
  const svgPath = `${import.meta.env.BASE_URL}resume-${composition}.svg`
  const [mobilePreview, setMobilePreview] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia(MOBILE_PREVIEW_QUERY).matches
  )
  const label =
    RESUME_COMPOSITIONS.find(({ id }) => id === composition)?.label ??
    RESUME_COMPOSITIONS[0].label

  useEffect(() => {
    const query = window.matchMedia(MOBILE_PREVIEW_QUERY)
    const updatePreview = (): void => setMobilePreview(query.matches)
    updatePreview()
    query.addEventListener("change", updatePreview)
    return (): void => query.removeEventListener("change", updatePreview)
  }, [])

  const selectComposition = (next: ResumeComposition): void => {
    localStorage.setItem(RESUME_COMPOSITION_KEY, next)
    setCompositionState(next)
    setMenu(null)
  }

  const cycleComposition = (): void => {
    const current = RESUME_COMPOSITIONS.findIndex(
      ({ id }) => id === composition
    )
    const next =
      RESUME_COMPOSITIONS[(current + 1) % RESUME_COMPOSITIONS.length] ??
      RESUME_COMPOSITIONS[0]
    selectComposition(next.id)
  }

  const openCompositionMenu = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  return (
    <Card className="flex h-full flex-col" onContextMenu={openCompositionMenu}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Résumé</CardTitle>
          <p className="text-muted-foreground text-xs">{label}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            title="Show the next coherent one-page composition"
            onClick={cycleComposition}
          >
            <Layers3 />
            Next version
          </Button>
          <Button asChild size="sm">
            <a href={pdfPath} download="Paul_Gathondu_Resume.pdf">
              <Download />
              Download PDF
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pb-6">
        <div
          className="relative isolate size-full overflow-auto rounded-md border md:overflow-hidden"
          onContextMenu={openCompositionMenu}
        >
          {mobilePreview ? (
            <div className="relative">
              <img
                key={composition}
                src={svgPath}
                alt=""
                aria-hidden="true"
                className={`aspect-[17/22] h-auto w-full transition-[filter] ${darkPreview ? "invert hue-rotate-180" : ""}`}
              />
              <ResumeTranscript label={label} />
              {darkPreview && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 mix-blend-multiply"
                  style={{ backgroundColor: resolved.swatch.fg }}
                />
              )}
            </div>
          ) : (
            <>
              <iframe
                key={composition}
                src={pdfPath}
                title="Résumé preview"
                // Browser PDF viewers are isolated documents and do not expose a
                // theme API. Filtering the embedded surface keeps the preview in
                // step with the app without changing the downloadable PDF itself.
                className={`size-full transition-[filter] ${darkPreview ? "invert hue-rotate-180" : ""}`}
              />
              {darkPreview && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 mix-blend-multiply"
                  // Inversion alone turns black type into bright white. Tinting
                  // those light pixels with the active theme's foreground token
                  // preserves the repo's no-sun-white text invariant.
                  style={{ backgroundColor: resolved.swatch.fg }}
                />
              )}
            </>
          )}
        </div>
        {menu && (
          <>
            <button
              type="button"
              aria-label="Close résumé composition menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenu(null)}
            />
            <div
              role="menu"
              aria-label="Résumé composition"
              className="bg-popover text-popover-foreground fixed z-50 min-w-64 rounded-md border p-1 shadow-md"
              style={{ left: menu.x, top: menu.y }}
            >
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium">
                One-page composition
              </p>
              {RESUME_COMPOSITIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.id === composition}
                  className="hover:bg-accent hover:text-accent-foreground flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm"
                  onClick={() => selectComposition(option.id)}
                >
                  <span className="mr-2 w-3">
                    {option.id === composition ? "✓" : ""}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute("/_dashboard/resume")({
  component: ResumeRoute,
})
