import { execFileSync, spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import { resolve } from "node:path"
import type {
  Browser,
  BrowserContext,
  Page,
  Request,
  Response,
} from "@playwright/test"
import { chromium } from "@playwright/test"

function originFromEnvironment(name: string, fallback: string): URL {
  const configured = process.env[name]?.trim() || fallback
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(configured)
    ? configured
    : `http://${configured}`
  const origin = new URL(withScheme)
  if (origin.protocol !== "http:") {
    throw new Error(`${name} must use http://; the trace servers are HTTP-only`)
  }
  if (origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error(`${name} must be an origin without a path: ${configured}`)
  }
  return origin
}

const APP_URL = originFromEnvironment(
  "NETWORK_TRACE_APP_ORIGIN",
  "http://127.0.0.1:4173"
)
const API_URL = originFromEnvironment(
  "NETWORK_TRACE_API_ORIGIN",
  "http://127.0.0.1:4180"
)
const APP_ORIGIN = APP_URL.origin
const API_ORIGIN = API_URL.origin
const BASELINE_DIR = resolve("tests/network-trace/baseline")
const baselineMode = process.argv.includes("--baseline")
const checkMode = process.argv.includes("--check")
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim()

type Session = ReturnType<typeof sessionFixture>
type WireMetric = {
  requestCount: number
  maxSerialDepth: number
  totalBytes: number
  timeToReadyMs: number
}
type Snapshot = {
  metadata: { capturedAt: string; commitSha: string }
  metrics: WireMetric
}
type WireEvent = { start: number; end?: number; bytes: number }

function sessionFixture(
  id: string,
  activityId = "honeycomb"
): {
  id: string
  name: string
  status: "active" | "draft"
  activities: Array<{ activityId: string; config: Record<string, unknown> }>
  scenes: Array<{
    scene_name: string
    start_time: number
    duration: number
    ui: Array<{
      panels: Record<string, { registry_key: string; children: Array<never> }>
    }>
  }>
  layoutMode: "advanced"
  totalDurationMs: number
  createdAt: string
  updatedAt: string
} {
  const component = activityId === "topik" ? "topik" : "hangul"
  return {
    id,
    name: `${activityId} trace fixture`,
    status: "active",
    activities: [{ activityId, config: {} }],
    scenes: [
      {
        scene_name: `${activityId}-scene`,
        start_time: 0,
        duration: 60_000,
        ui: [
          {
            panels: {
              mainContent: { registry_key: component, children: [] },
            },
          },
        ],
      },
    ],
    layoutMode: "advanced",
    totalDurationMs: 60_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

const remoteSessions = new Map<string, Session>([
  ["honeycomb-direct", sessionFixture("honeycomb-direct")],
  ["topik-direct", sessionFixture("topik-direct", "topik")],
  ["scene-library", sessionFixture("scene-library")],
])
let createdId = 0
let sessionListDelayMs = 0
let sessionListFails = false

const api = createServer((request, response) => {
  void handleApiRequest(request, response)
})

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  response.setHeader("access-control-allow-origin", APP_ORIGIN)
  response.setHeader("access-control-allow-headers", "content-type")
  response.setHeader(
    "access-control-allow-methods",
    "GET,POST,PATCH,DELETE,OPTIONS"
  )
  response.setHeader("content-type", "application/json")
  if (request.method === "OPTIONS") {
    response.end()
    return
  }

  await new Promise((done) => setTimeout(done, 8))
  const url = new URL(request.url ?? "/", API_ORIGIN)
  if (request.method === "GET" && url.pathname === "/api/v1/sessions") {
    await new Promise((done) => setTimeout(done, sessionListDelayMs))
    if (sessionListFails) {
      response.statusCode = 503
      response.end(JSON.stringify({ error: "trace fixture failure" }))
      return
    }
    response.end(JSON.stringify([...remoteSessions.values()]))
    return
  }
  const match = /^\/api\/v1\/sessions\/([^/]+)$/.exec(url.pathname)
  if (request.method === "GET" && match) {
    const item = remoteSessions.get(decodeURIComponent(match[1]))
    response.statusCode = item ? 200 : 404
    response.end(JSON.stringify(item ?? { error: "not found" }))
    return
  }
  if (request.method === "POST" && url.pathname === "/api/v1/sessions") {
    await drainBody(request)
    const item: Session = {
      ...sessionFixture(`migrated-${createdId++}`),
      id: `migrated-${createdId}`,
      status: "draft",
    }
    remoteSessions.set(item.id, item)
    response.statusCode = 201
    response.end(JSON.stringify(item))
    return
  }
  if (request.method === "PATCH" && match) {
    const id = decodeURIComponent(match[1])
    const existing = remoteSessions.get(id)
    await drainBody(request)
    const item = existing ?? sessionFixture(id)
    remoteSessions.set(id, item)
    response.end(JSON.stringify(item))
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: "unhandled trace request" }))
}

async function drainBody(request: IncomingMessage): Promise<void> {
  for await (const _chunk of request) {
    // Consuming the body keeps the fixture server's connection reusable.
  }
}

const scenarios: ReadonlyArray<{
  name: string
  seed?: number
  run: (page: Page) => Promise<void>
}> = [
  ...[0, 1, 10, 50].map((count) => ({
    name: `migration-${count}-sessions`,
    seed: count,
    run: async (page: Page): Promise<void> => {
      await page.goto(`${APP_ORIGIN}/sessions`)
      await page.getByRole("heading", { name: "Sessions" }).waitFor()
    },
  })),
  {
    name: "direct-honeycomb-session",
    run: async (page: Page): Promise<void> => {
      await page.goto(`${APP_ORIGIN}/sessions/honeycomb-direct`)
      await page.getByText("Press Play to begin").waitFor()
    },
  },
  {
    name: "direct-topik-session",
    run: async (page: Page): Promise<void> => {
      await page.goto(`${APP_ORIGIN}/sessions/topik-direct`)
      await page.getByText("Press Play to begin").waitFor()
    },
  },
  {
    name: "scene-library-picker",
    run: async (page: Page): Promise<void> => {
      await page.goto(`${APP_ORIGIN}/sessions/scene-library`)
      await page.getByText("Press Play to begin").waitFor()
      await page.getByRole("button", { name: /edit layout/i }).click()
      await page.getByRole("button", { name: /add from library/i }).click()
      await page
        .getByText(/scene library/i)
        .first()
        .waitFor()
    },
  },
  {
    name: "dashboard-slow-sessions",
    run: async (page: Page): Promise<void> => {
      sessionListDelayMs = 250
      await page.goto(`${APP_ORIGIN}/app`)
      await page.getByText("Recent sessions").waitFor()
      await page.getByText("honeycomb trace fixture").first().waitFor()
    },
  },
  {
    name: "dashboard-failed-sessions",
    run: async (page: Page): Promise<void> => {
      sessionListFails = true
      await page.goto(`${APP_ORIGIN}/app`)
      await page.getByText("Recent sessions").waitFor()
      await page
        .getByText(/sessions unavailable|couldn't load|no sessions yet/i)
        .first()
        .waitFor()
    },
  },
]

function localSessions(count: number): Array<Session> {
  return Array.from({ length: count }, (_, index) =>
    sessionFixture(`local-${index}`)
  )
}

async function traceScenario(
  browser: Browser,
  scenario: (typeof scenarios)[number]
): Promise<WireMetric> {
  sessionListDelayMs = 0
  sessionListFails = false
  const context: BrowserContext = await browser.newContext()
  await context.addInitScript(
    (sessions) => {
      localStorage.setItem(
        "some-ui.tenant.sessions.v1",
        JSON.stringify(sessions)
      )
      localStorage.removeItem("some-ui.tenant.sessions.migrated.v1")
    },
    localSessions(scenario.seed ?? 0)
  )
  const page = await context.newPage()
  const traffic = new Map<Request, WireEvent>()
  page.on("request", (request) =>
    traffic.set(request, { start: performance.now(), bytes: 0 })
  )
  page.on("response", (response) => void recordResponse(response, traffic))
  const started = performance.now()
  await scenario.run(page)
  const timeToReadyMs = Math.round(performance.now() - started)
  await page.waitForTimeout(25)
  await Promise.allSettled(
    [...traffic.keys()].map(async (request) => {
      const response = await request.response()
      if (response) await recordResponse(response, traffic)
    })
  )
  const events = [...traffic.values()].filter(
    (event) => event.end !== undefined
  )
  await context.close()
  return {
    requestCount: events.length,
    maxSerialDepth: serialDepth(events),
    totalBytes: events.reduce((total, event) => total + event.bytes, 0),
    timeToReadyMs,
  }
}

async function recordResponse(
  response: Response,
  traffic: Map<Request, WireEvent>
): Promise<void> {
  const event = traffic.get(response.request())
  if (!event || event.end !== undefined) return
  event.end = performance.now()
  try {
    event.bytes = (await response.body()).byteLength
  } catch {
    event.bytes = Number(response.headers()["content-length"] ?? 0)
  }
}

function serialDepth(events: Array<WireEvent>): number {
  const ordered = [...events].sort((left, right) => left.start - right.start)
  const depth = ordered.map(() => 1)
  for (let current = 0; current < ordered.length; current += 1) {
    for (let previous = 0; previous < current; previous += 1) {
      if ((ordered[previous].end ?? Infinity) <= ordered[current].start) {
        depth[current] = Math.max(depth[current], depth[previous] + 1)
      }
    }
  }
  return Math.max(0, ...depth)
}

async function waitForServer(
  url: string,
  process: ChildProcess
): Promise<void> {
  let lastFailure = "no response"
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(
        `vite preview exited with code ${process.exitCode} before ${url} became reachable`
      )
    }
    try {
      const response = await fetch(url)
      // Any HTTP response proves the preview server is listening. Route status
      // is a scenario concern, not a process-readiness concern.
      if (response.status > 0) return
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(
    `Timed out waiting for ${url}. Last connection error: ${lastFailure}`
  )
}

async function main(): Promise<void> {
  await mkdir(BASELINE_DIR, { recursive: true })
  const apiPort = Number(API_URL.port || "80")
  await new Promise<void>((done) => api.listen(apiPort, "0.0.0.0", done))
  const preview = spawn(
    "pnpm",
    [
      "exec",
      "vite",
      "preview",
      "--config",
      "tests/network-trace/vite.preview.config.ts",
      "--host",
      "0.0.0.0",
      "--port",
      APP_URL.port || "80",
      "--strictPort",
    ],
    { stdio: "inherit" }
  )
  let browser: Browser | undefined
  try {
    await waitForServer(APP_ORIGIN, preview)
    browser = await chromium.launch(
      process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
        ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
        : {}
    )
    const rows: Array<{
      scenario: string
      current: WireMetric
      baseline?: WireMetric
    }> = []
    for (const scenario of scenarios) {
      const current = await traceScenario(browser, scenario)
      const path = resolve(BASELINE_DIR, `${scenario.name}.json`)
      if (baselineMode) {
        const snapshot: Snapshot = {
          metadata: { capturedAt: new Date().toISOString(), commitSha: sha },
          metrics: current,
        }
        await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`)
      }
      let baseline: WireMetric | undefined
      try {
        baseline = readSnapshotMetrics(await readFile(path, "utf8"))
      } catch {
        /* reported below */
      }
      rows.push({ scenario: scenario.name, current, baseline })
    }
    printTable(rows)
    if (
      checkMode &&
      rows.some(
        ({ current, baseline }) =>
          baseline?.requestCount === undefined ||
          current.requestCount !== baseline.requestCount ||
          current.maxSerialDepth !== baseline.maxSerialDepth
      )
    )
      process.exitCode = 1
  } finally {
    await browser?.close()
    preview.kill("SIGTERM")
    await new Promise<void>((done) => api.close(() => done()))
  }
}

function readSnapshotMetrics(json: string): WireMetric {
  const value: unknown = JSON.parse(json)
  if (typeof value !== "object" || value === null || !("metrics" in value))
    throw new Error("Snapshot has no metrics")
  const metrics = value.metrics
  if (typeof metrics !== "object" || metrics === null)
    throw new Error("Snapshot metrics are invalid")
  const requestCount = "requestCount" in metrics ? metrics.requestCount : null
  const maxSerialDepth =
    "maxSerialDepth" in metrics ? metrics.maxSerialDepth : null
  const totalBytes = "totalBytes" in metrics ? metrics.totalBytes : null
  const timeToReadyMs =
    "timeToReadyMs" in metrics ? metrics.timeToReadyMs : null
  if (
    typeof requestCount !== "number" ||
    typeof maxSerialDepth !== "number" ||
    typeof totalBytes !== "number" ||
    typeof timeToReadyMs !== "number"
  )
    throw new Error("Snapshot metrics must be numbers")
  return { requestCount, maxSerialDepth, totalBytes, timeToReadyMs }
}

function printTable(
  rows: Array<{ scenario: string; current: WireMetric; baseline?: WireMetric }>
): void {
  console.table(
    rows.map(({ scenario, current, baseline }) => ({
      scenario,
      requests: `${current.requestCount} (${delta(current.requestCount, baseline?.requestCount)})`,
      serialDepth: `${current.maxSerialDepth} (${delta(current.maxSerialDepth, baseline?.maxSerialDepth)})`,
      bytes: `${current.totalBytes} (${delta(current.totalBytes, baseline?.totalBytes)})`,
      readyMs: `${current.timeToReadyMs} (${delta(current.timeToReadyMs, baseline?.timeToReadyMs)})`,
    }))
  )
}

function delta(value: number, baseline?: number): string {
  if (baseline === undefined) return "no baseline"
  const difference = value - baseline
  return difference > 0 ? `+${difference}` : String(difference)
}

await main()
