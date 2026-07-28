// Copyright (c) 2026 paulgsc — MIT License
//
// Diagnostics page (`debug.html`) — a miniature Grafana for one extension.
//
// It answers, without a server and without any data leaving the machine:
//
//   - is the extension healthy right now, and which invariant broke first?
//   - how many suspends has it attempted, landed, and silently failed?
//   - what happened to *this* tab, in order?
//
// The page is a pure projection of worker state (Good-Citizen Charter: a view,
// never a state authority). It holds no state of its own beyond the current
// filter, re-fetches on every refresh, and every action it offers is a message
// to the worker.

import type {
  DiagnosticsBundle,
  InvariantResult,
  JsonValue,
  ObservabilityEvent,
} from "@some-extension/common/observability"
import type { DebugToWorkerMessage } from "@suspender/types/messages"

import "./debug.css"

type Bundle = DiagnosticsBundle

/** Current view filter. The only state this page owns. */
type Filter = { kind: string; subject: string }

let filter: Filter = { kind: "", subject: "" }
let bundle: Bundle | undefined

function send(message: DebugToWorkerMessage): Promise<unknown> {
  return Promise.resolve(browser.runtime.sendMessage(message))
}

function isBundle(value: unknown): value is Bundle {
  return (
    value !== null &&
    typeof value === "object" &&
    Reflect.get(value, "version") === 1 &&
    Array.isArray(Reflect.get(value, "events"))
  )
}

// ── Formatting ───────────────────────────────────────────────────────────────

const pad = (n: number): string => String(n).padStart(2, "0")

function clockTime(t: number): string {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function relative(t: number, now: number): string {
  const seconds = Math.round((now - t) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}

function compact(value: JsonValue | undefined): string {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value !== "object" || value === null) return String(value)
  if (Array.isArray(value)) return value.map((v) => compact(v)).join(" ")
  return Object.entries(value)
    .filter(([, v]) => v !== null && v !== "")
    .map(([k, v]) =>
      typeof v === "object" && v !== null
        ? `${k}=${compact(v)}`
        : `${k}=${String(v)}`
    )
    .join(" ")
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: { class?: string; text?: string } = {},
  children: Array<Node> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (attrs.class !== undefined) node.className = attrs.class
  if (attrs.text !== undefined) node.textContent = attrs.text
  for (const child of children) node.appendChild(child)
  return node
}

// ── Sections ─────────────────────────────────────────────────────────────────

function severityClass(status: InvariantResult["status"]): string {
  return status === "ok" ? "ok" : status === "violated" ? "bad" : "muted"
}

function healthSection(b: Bundle): HTMLElement {
  const { health } = b
  const cls =
    health.status === "healthy"
      ? "ok"
      : health.status === "degraded"
        ? "warn"
        : "bad"

  const score = el("div", { class: `sl-score ${cls}` })
  score.append(
    document.createTextNode(String(health.score)),
    el("small", { text: ` / 100 · ${health.status}` })
  )

  const checks = el("ul", { class: "sl-checks" })
  for (const inv of health.invariants) {
    const mark =
      inv.status === "ok" ? "✓" : inv.status === "violated" ? "✕" : "–"
    const body = el("div")
    body.append(
      el("div", { text: inv.name }),
      el("div", { class: "sl-desc", text: inv.description })
    )
    if (inv.details !== undefined) {
      body.appendChild(
        el("div", { class: "sl-desc bad", text: compact(inv.details) })
      )
    }
    checks.appendChild(
      el("li", {}, [
        el("span", { class: severityClass(inv.status), text: mark }),
        body,
      ])
    )
  }

  const section = el("section")
  section.append(
    el("h2", { text: "Health" }),
    score,
    el("div", {
      class: "sl-sub",
      text:
        health.recentErrors === 0
          ? "No errors in the retained window."
          : `${health.recentErrors} error event(s) in the retained window.`,
    }),
    checks
  )
  return section
}

/** Counters worth reading first, in the order a reliability question asks them. */
const COUNTER_ORDER = [
  "worker_starts",
  "alarm_installs",
  "alarm_kept",
  "alarm_fires",
  "alarm_missed",
  "alarm_repairs",
  "checks_run",
  "checks_skipped",
  "check_errors",
  "tabs_scanned",
  "tabs_skipped",
  "tabs_selected",
  "suspend_attempts",
  "suspend_succeeded",
  "suspend_noop",
  "suspend_failed",
  "suspend_rolled_back",
  "suspend_queued",
  "meta_errors",
  "fsm_violations",
  "reconcile_repairs",
]

function metricsSection(b: Bundle): HTMLElement {
  const grid = el("div", { class: "sl-grid" })
  const counters = b.metrics.counters
  const names = [
    ...COUNTER_ORDER.filter((n) => n in counters),
    ...Object.keys(counters).filter((n) => !COUNTER_ORDER.includes(n)),
  ]
  for (const name of names) {
    const row = el("div", { class: "sl-metric" })
    row.append(
      el("span", { class: "k", text: name }),
      el("span", { text: String(counters[name] ?? 0) })
    )
    grid.appendChild(row)
  }
  if (names.length === 0) {
    grid.appendChild(el("div", { class: "sl-empty", text: "No counters yet." }))
  }

  const aggregates = el("div", { class: "sl-grid" })
  for (const [name, agg] of Object.entries(b.metrics.aggregates)) {
    const mean = agg.count > 0 ? Math.round(agg.sum / agg.count) : 0
    const row = el("div", { class: "sl-metric" })
    row.append(
      el("span", { class: "k", text: name }),
      el("span", {
        text: `avg ${mean} · min ${Math.round(agg.min)} · max ${Math.round(agg.max)} · n=${agg.count}`,
      })
    )
    aggregates.appendChild(row)
  }

  const section = el("section")
  section.append(el("h2", { text: "Metrics" }), grid)
  if (aggregates.childElementCount > 0) {
    section.append(el("h2", { text: "Timings (ms)" }), aggregates)
  }
  return section
}

function stateSection(b: Bundle): HTMLElement {
  const now = b.generatedAt
  const grid = el("div", { class: "sl-grid" })
  const entries = Object.entries(b.snapshots)
  for (const [key, value] of entries) {
    const row = el("div", { class: "sl-metric" })
    const rendered =
      typeof value === "number" && key.includes("check")
        ? `${clockTime(value)} (${relative(value, now)})`
        : compact(value)
    row.append(
      el("span", { class: "k", text: key }),
      el("span", { text: rendered })
    )
    grid.appendChild(row)
  }
  if (entries.length === 0) {
    grid.appendChild(
      el("div", { class: "sl-empty", text: "No state recorded yet." })
    )
  }
  const section = el("section")
  section.append(
    el("h2", { text: "Current beliefs" }),
    el("div", {
      class: "sl-sub",
      text: "Events say what happened; these say what the extension currently thinks is true.",
    }),
    grid
  )
  return section
}

function matches(event: ObservabilityEvent, f: Filter): boolean {
  if (f.kind && !event.kind.startsWith(f.kind)) return false
  if (f.subject && String(event.subject ?? "") !== f.subject) return false
  return true
}

function timelineSection(b: Bundle, rerender: () => void): HTMLElement {
  const kinds = [...new Set(b.events.map((e) => e.kind))].sort()

  const kindSelect = el("select")
  kindSelect.appendChild(new Option("all events", ""))
  for (const k of kinds) kindSelect.appendChild(new Option(k, k))
  kindSelect.value = filter.kind
  kindSelect.addEventListener("change", () => {
    filter = { ...filter, kind: kindSelect.value }
    rerender()
  })

  const subjectInput = el("input")
  subjectInput.placeholder = "tab id"
  subjectInput.value = filter.subject
  subjectInput.addEventListener("change", () => {
    filter = { ...filter, subject: subjectInput.value.trim() }
    rerender()
  })

  const controls = el("div", { class: "sl-filter" }, [kindSelect, subjectInput])

  const table = el("table", { class: "sl-events" })
  const head = el("tr")
  for (const label of ["time", "kind", "subject", "detail"]) {
    head.appendChild(el("th", { text: label }))
  }
  table.appendChild(el("thead", {}, [head]))

  const body = el("tbody")
  // Newest first: when something just broke, the last few lines are the ones
  // being read, and scrolling to the bottom of 500 rows to find them is hostile.
  const shown = b.events.filter((e) => matches(e, filter)).reverse()
  for (const event of shown) {
    const row = el("tr")
    row.append(
      el("td", { class: "muted", text: clockTime(event.t) }),
      el("td", {
        class:
          event.severity === "error"
            ? "bad"
            : event.severity === "warn"
              ? "warn"
              : "",
        text: event.kind,
      }),
      el("td", { class: "muted", text: String(event.subject ?? "") }),
      el("td", { class: "detail", text: compact(event.detail) })
    )
    body.appendChild(row)
  }
  table.appendChild(body)

  const section = el("section")
  section.append(
    el("h2", { text: `Timeline (${shown.length} of ${b.events.length})` }),
    controls
  )
  if (shown.length === 0) {
    section.appendChild(
      el("div", { class: "sl-empty", text: "No events match this filter." })
    )
  } else {
    section.appendChild(el("div", { class: "sl-scroll" }, [table]))
  }
  if (b.dropped > 0) {
    section.appendChild(
      el("div", {
        class: "sl-sub",
        text: `${b.dropped} older event(s) have rolled out of the ring buffer.`,
      })
    )
  }
  return section
}

// ── Actions ──────────────────────────────────────────────────────────────────

function downloadBundle(b: Bundle): void {
  // Export is a deliberate, user-initiated act — the only way anything here
  // ever leaves the machine, and it leaves via the user's own download folder.
  const blob = new Blob([JSON.stringify(b, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = el("a")
  anchor.href = url
  anchor.download = `suspender-ledger-diagnostics-${new Date(b.generatedAt)
    .toISOString()
    .replace(/[:.]/g, "-")}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

// ── Render ───────────────────────────────────────────────────────────────────

function header(b: Bundle | undefined, busy: boolean): HTMLElement {
  const title = el("div")
  title.append(
    el("h1", { text: "Suspender Ledger — Diagnostics" }),
    el("div", {
      class: "sl-sub",
      text: b
        ? `${b.extension.name} ${b.extension.version} · generated ${clockTime(b.generatedAt)}`
        : "Waiting for the background worker…",
    })
  )

  const refresh = el("button", { text: busy ? "Refreshing…" : "Refresh" })
  refresh.disabled = busy
  refresh.addEventListener("click", () => void load())

  const actions = el("div", { class: "sl-actions" }, [refresh])

  if (b) {
    const exportBtn = el("button", { text: "Export JSON" })
    exportBtn.addEventListener("click", () => downloadBundle(b))

    const clearBtn = el("button", { text: "Clear" })
    clearBtn.addEventListener("click", () => {
      void send({ method: "observability", cmd: "clear" }).then(() => load())
    })
    actions.append(exportBtn, clearBtn)
  }

  return el("div", { class: "sl-head" }, [title, actions])
}

function render(busy = false, error?: string): void {
  const root = document.getElementById("app")
  if (!root) return
  root.replaceChildren()
  root.appendChild(header(bundle, busy))

  if (error !== undefined) {
    const section = el("section")
    section.append(
      el("h2", { text: "Unavailable" }),
      el("div", { class: "sl-empty bad", text: error }),
      el("div", {
        class: "sl-sub",
        text: "The background worker did not answer. Open the extension's popup or reload the extension, then refresh.",
      })
    )
    root.appendChild(section)
    return
  }

  if (!bundle) {
    root.appendChild(
      el("div", { class: "sl-empty", text: "Loading diagnostics…" })
    )
    return
  }

  root.append(
    healthSection(bundle),
    metricsSection(bundle),
    stateSection(bundle),
    timelineSection(bundle, () => render())
  )
}

async function load(): Promise<void> {
  render(true)
  try {
    const reply: unknown = await send({
      method: "observability",
      cmd: "export",
    })
    if (!isBundle(reply)) {
      const message = Reflect.get(reply ?? {}, "error")
      render(false, typeof message === "string" ? message : "Malformed reply.")
      return
    }
    bundle = reply
    render()
  } catch (e) {
    render(false, e instanceof Error ? e.message : String(e))
  }
}

void load()
