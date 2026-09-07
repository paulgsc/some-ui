// Diagnostics page (`debug.html`) — some-filter's counterpart to
// suspender-ledger's `debug.html` (`extensions/suspender-ledger/src/debug/
// index.ts`), adapted for a workspace with no single background worker to
// message: some-filter's interesting state lives in each tab's content
// script, one recorder per page load (`coverage-observability.ts`'s header
// explains why). This page is a session *picker* over `storage.local`
// instead of a live query to one worker — it reads the index of currently
// known sessions, then that session's persisted bundle, directly.
//
// It answers, without a server and without any data leaving the machine:
//
//   - which tabs does this extension currently have diagnostics for?
//   - for the selected one, does Remark C.1's coverage invariant hold right
//     now, and which of the three checks broke first if not?
//   - what happened in that tab, in order — specifically, what did the
//     coverage watchdog observe around the last `yt-navigate-*` pair?
//
// Health is *recomputed* here from the last persisted `coverage` snapshot
// (a plain `CoverageContext`) rather than read as a separately-persisted
// verdict — coverageInvariants and runInvariants are both pure, so this page
// stays a pure projection of recorded state (never a second place a health
// score could drift from the content script's own) exactly as
// suspender-ledger's own header describes for its page.

import {
  coverageInvariants,
  readIndex,
  sessionStorageKey,
  type CoverageContext,
  type IndexEntry,
  type ScopeCoverageEntry,
} from "@filter/lib/content/coverage-observability"
import type { ScopeCoverageSnapshot } from "@filter/lib/content/coverage-watchdog"
import { ext } from "@filter/platform/content"
import {
  runInvariants,
  scoreHealth,
  type HealthReport,
  type InvariantResult,
  type JsonValue,
  type ObservabilityEvent,
  type PersistedState,
} from "@some-extension/common/observability"

import "./debug.css"

type Bundle = PersistedState

/** Current view filter. Reset whenever the selected session changes. */
type Filter = { kind: string; subject: string }

let sessions: Array<IndexEntry> = []
let selectedSessionId: string | undefined
let filter: Filter = { kind: "", subject: "" }
let bundle: Bundle | undefined
let loadError: string | undefined

function isBundle(value: unknown): value is Bundle {
  return (
    value !== null &&
    typeof value === "object" &&
    Reflect.get(value, "version") === 1 &&
    Array.isArray(Reflect.get(value, "events"))
  )
}

function isCoverageContext(value: unknown): value is CoverageContext {
  if (value === null || typeof value !== "object") return false
  return (
    typeof Reflect.get(value, "now") === "number" &&
    typeof Reflect.get(value, "tabState") === "string" &&
    typeof Reflect.get(value, "veilPresent") === "boolean" &&
    typeof Reflect.get(value, "dirtyClassPresent") === "boolean" &&
    typeof Reflect.get(value, "darkThemeActive") === "boolean" &&
    typeof Reflect.get(value, "darkStyleActive") === "boolean" &&
    typeof Reflect.get(value, "legacyAttrPresent") === "boolean" &&
    typeof Reflect.get(value, "legacyStyleActive") === "boolean"
  )
}

async function loadBundle(sessionId: string): Promise<Bundle | undefined> {
  const key = sessionStorageKey(sessionId)
  const raw: unknown = await ext.storage.local.get(key)
  const value: unknown =
    raw !== null && typeof raw === "object" ? Reflect.get(raw, key) : undefined
  return isBundle(value) ? value : undefined
}

async function computeHealth(b: Bundle): Promise<HealthReport> {
  const rawCtx = b.snapshots["coverage"]
  const now = Date.now()
  if (!isCoverageContext(rawCtx)) {
    // No coverage check has landed yet for this session — every invariant
    // reports unknown rather than a fabricated "healthy", per this
    // package's own "an unknown must never be reported as a failure" rule
    // (and, symmetrically, never as a clean bill of health either).
    const results = await runInvariants(coverageInvariants, undefined, now)
    const { score, status } = scoreHealth(results, 0)
    return {
      score,
      status,
      invariants: results,
      recentErrors: 0,
      generatedAt: now,
    }
  }
  const results = await runInvariants(coverageInvariants, rawCtx, now)
  const recentErrors = b.events.filter((e) => e.severity === "error").length
  const { score, status } = scoreHealth(results, recentErrors)
  return { score, status, invariants: results, recentErrors, generatedAt: now }
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

function pickerSection(): HTMLElement {
  const select = el("select")
  if (sessions.length === 0) {
    select.appendChild(new Option("no open sessions", ""))
    select.disabled = true
  } else {
    for (const s of sessions) {
      const label = `${s.origin} — ${s.title || "(untitled)"} [${s.tabState}]`
      select.appendChild(new Option(label, s.sessionId))
    }
    select.value = selectedSessionId ?? sessions[0]?.sessionId ?? ""
  }
  select.addEventListener("change", () => {
    selectedSessionId = select.value || undefined
    filter = { kind: "", subject: "" }
    void load()
  })

  const refresh = el("button", { text: "Refresh sessions" })
  refresh.addEventListener("click", () => void loadSessions(true))

  const section = el("section")
  section.append(
    el("h2", { text: "Session" }),
    el("div", {
      class: "sf-sub",
      text: "One recorder per tab (a shared log across tabs would race) — pick which one to inspect.",
    }),
    el("div", { class: "sf-picker" }, [select, refresh])
  )
  return section
}

function severityClass(status: InvariantResult["status"]): string {
  return status === "ok" ? "ok" : status === "violated" ? "bad" : "muted"
}

function healthSection(health: HealthReport): HTMLElement {
  const cls =
    health.status === "healthy"
      ? "ok"
      : health.status === "degraded"
        ? "warn"
        : "bad"

  const score = el("div", { class: `sf-score ${cls}` })
  score.append(
    document.createTextNode(String(health.score)),
    el("small", { text: ` / 100 · ${health.status}` })
  )

  const checks = el("ul", { class: "sf-checks" })
  for (const inv of health.invariants) {
    const mark =
      inv.status === "ok" ? "✓" : inv.status === "violated" ? "✕" : "–"
    const body = el("div")
    body.append(
      el("div", { text: inv.name }),
      el("div", { class: "sf-desc", text: inv.description })
    )
    if (inv.details !== undefined) {
      body.appendChild(
        el("div", { class: "sf-desc bad", text: compact(inv.details) })
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
      class: "sf-sub",
      text:
        health.recentErrors === 0
          ? "No errors in the retained window."
          : `${health.recentErrors} error event(s) in the retained window.`,
    }),
    checks
  )
  return section
}

const COUNTER_ORDER = [
  "sessions_started",
  "state_changes",
  "nav_starts",
  "nav_finishes",
  "coverage_checks",
  "coverage_violations",
  "legacy_signal_mismatches",
  "dark_signal_mismatches",
  "veil_color_mismatches",
]

function metricsSection(b: Bundle): HTMLElement {
  const grid = el("div", { class: "sf-grid" })
  const counters = b.metrics.counters
  const names = [
    ...COUNTER_ORDER.filter((n) => n in counters),
    ...Object.keys(counters).filter((n) => !COUNTER_ORDER.includes(n)),
  ]
  for (const name of names) {
    const row = el("div", { class: "sf-metric" })
    row.append(
      el("span", { class: "k", text: name }),
      el("span", { text: String(counters[name] ?? 0) })
    )
    grid.appendChild(row)
  }
  if (names.length === 0) {
    grid.appendChild(el("div", { class: "sf-empty", text: "No counters yet." }))
  }

  const aggregates = el("div", { class: "sf-grid" })
  for (const [name, agg] of Object.entries(b.metrics.aggregates)) {
    const mean = agg.count > 0 ? Math.round(agg.sum / agg.count) : 0
    const row = el("div", { class: "sf-metric" })
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

function checkedAt(value: JsonValue): number | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const checked = value["now"]
  return typeof checked === "number" ? checked : undefined
}

function stateSection(b: Bundle): HTMLElement {
  const now = Date.now()
  const grid = el("div", { class: "sf-grid" })
  const entries = Object.entries(b.snapshots)
  for (const [key, value] of entries) {
    const row = el("div", { class: "sf-metric" })
    const checkedT = key === "coverage" ? checkedAt(value) : undefined
    const staleness =
      checkedT !== undefined ? ` (${relative(checkedT, now)})` : ""
    row.append(
      el("span", { class: "k", text: key }),
      el("span", { text: compact(value) + staleness })
    )
    grid.appendChild(row)
  }
  if (entries.length === 0) {
    grid.appendChild(
      el("div", { class: "sf-empty", text: "No state recorded yet." })
    )
  }
  const section = el("section")
  section.append(
    el("h2", { text: "Current beliefs" }),
    el("div", {
      class: "sf-sub",
      text: `Events say what happened; these say what the watchdog's last check (${b.snapshots["coverage"] !== undefined ? "above" : "none yet"}) found. As of ${clockTime(now)}.`,
    }),
    grid
  )
  return section
}

// SF-OB (#1270): a dedicated per-scope breakdown, alongside the existing
// per-check list above — the generic stateSection below would otherwise
// flatten this into one unreadable compact() line, the same way it already
// does for "coverage".

function isScopeCoverageEntry(value: unknown): value is ScopeCoverageEntry {
  if (value === null || typeof value !== "object") return false
  return (
    typeof Reflect.get(value, "id") === "string" &&
    typeof Reflect.get(value, "kind") === "string"
  )
}

function isScopeCoverageSnapshot(
  value: unknown
): value is ScopeCoverageSnapshot {
  if (value === null || typeof value !== "object") return false
  const scopes = Reflect.get(value, "scopes")
  return (
    typeof Reflect.get(value, "now") === "number" &&
    typeof Reflect.get(value, "totalScopes") === "number" &&
    Reflect.get(value, "byState") !== null &&
    typeof Reflect.get(value, "byState") === "object" &&
    Array.isArray(scopes) &&
    scopes.every(isScopeCoverageEntry)
  )
}

function scopesSection(b: Bundle): HTMLElement | undefined {
  const raw = b.snapshots["scopes"]
  if (!isScopeCoverageSnapshot(raw)) return undefined

  const byState = el("div", { class: "sf-grid" })
  for (const [kind, count] of Object.entries(raw.byState)) {
    const row = el("div", { class: "sf-metric" })
    row.append(
      el("span", { class: "k", text: kind }),
      el("span", {
        class: kind === "DISCOVERED_UNHELD" && count > 0 ? "bad" : "",
        text: String(count),
      })
    )
    byState.appendChild(row)
  }

  const table = el("table", { class: "sf-scopes" })
  const head = el("tr")
  for (const label of ["id", "state", "parent", "artifact"]) {
    head.appendChild(el("th", { text: label }))
  }
  table.appendChild(el("thead", {}, [head]))

  const body = el("tbody")
  for (const scope of raw.scopes) {
    const row = el("tr")
    const artifactText =
      scope.artifactPresent === null ? "—" : scope.artifactPresent ? "✓" : "✕"
    row.append(
      el("td", { text: scope.id }),
      el("td", { text: scope.kind }),
      el("td", { class: "muted", text: scope.parent ?? "(root)" }),
      el("td", {
        class: scope.artifactPresent === false ? "bad" : "muted",
        text: artifactText,
      })
    )
    body.appendChild(row)
  }
  table.appendChild(body)

  const section = el("section")
  section.append(
    el("h2", { text: "Live scopes" }),
    el("div", {
      class: "sf-sub",
      text: `${raw.totalScopes} registered scope(s), as of ${clockTime(raw.now)} (SF-RG's registry, quantified per SF-OB).`,
    }),
    byState
  )
  if (raw.scopes.length === 0) {
    section.appendChild(
      el("div", {
        class: "sf-empty",
        text: "No scopes registered — the document itself registers only once auto mode starts.",
      })
    )
  } else {
    section.appendChild(el("div", { class: "sf-scroll" }, [table]))
  }
  if (raw.truncated === true) {
    section.appendChild(
      el("div", {
        class: "sf-sub",
        text: `Showing ${raw.scopes.length} of ${raw.totalScopes} scopes — byState above still counts every one; itemizing more here would exceed this snapshot's own size budget.`,
      })
    )
  }
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

  const controls = el("div", { class: "sf-filter" }, [kindSelect])

  const table = el("table", { class: "sf-events" })
  const head = el("tr")
  for (const label of ["time", "kind", "severity", "detail"]) {
    head.appendChild(el("th", { text: label }))
  }
  table.appendChild(el("thead", {}, [head]))

  const body = el("tbody")
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
      el("td", { class: "muted", text: event.severity }),
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
      el("div", { class: "sf-empty", text: "No events match this filter." })
    )
  } else {
    section.appendChild(el("div", { class: "sf-scroll" }, [table]))
  }
  if (b.dropped > 0) {
    section.appendChild(
      el("div", {
        class: "sf-sub",
        text: `${b.dropped} older event(s) have rolled out of the ring buffer.`,
      })
    )
  }
  return section
}

// ── Actions ──────────────────────────────────────────────────────────────────

function downloadBundle(b: Bundle, health: HealthReport): void {
  const exportable = { ...b, health }
  const blob = new Blob([JSON.stringify(exportable, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = el("a")
  anchor.href = url
  anchor.download = `some-filter-diagnostics-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

// ── Render ───────────────────────────────────────────────────────────────────

function header(
  b: Bundle | undefined,
  health: HealthReport | undefined
): HTMLElement {
  const title = el("div")
  title.append(
    el("h1", { text: "Ergonomic Page Filter — Diagnostics" }),
    el("div", {
      class: "sf-sub",
      text: b
        ? `${b.namespace} · ${b.events.length} event(s) retained`
        : sessions.length === 0
          ? "No sessions recorded yet — open a page with the extension active, then refresh."
          : "Pick a session above.",
    })
  )

  const refresh = el("button", { text: "Refresh" })
  refresh.addEventListener("click", () => void load())
  const actions = el("div", { class: "sf-actions" }, [refresh])

  if (b && health) {
    const exportBtn = el("button", { text: "Export JSON" })
    exportBtn.addEventListener("click", () => downloadBundle(b, health))
    actions.appendChild(exportBtn)
  }

  return el("div", { class: "sf-head" }, [title, actions])
}

async function render(): Promise<void> {
  const root = document.getElementById("app")
  if (!root) return
  root.replaceChildren()

  const health = bundle ? await computeHealth(bundle) : undefined
  root.appendChild(header(bundle, health))
  root.appendChild(pickerSection())

  if (loadError !== undefined) {
    const section = el("section")
    section.append(
      el("h2", { text: "Unavailable" }),
      el("div", { class: "sf-empty bad", text: loadError })
    )
    root.appendChild(section)
    return
  }

  if (!bundle || !health) {
    root.appendChild(
      el("div", {
        class: "sf-empty",
        text:
          sessions.length === 0
            ? "Nothing to show yet."
            : "Loading diagnostics…",
      })
    )
    return
  }

  root.append(healthSection(health), metricsSection(bundle))
  const scopes = scopesSection(bundle)
  if (scopes !== undefined) root.appendChild(scopes)
  root.append(
    stateSection(bundle),
    timelineSection(bundle, () => void render())
  )
}

async function loadSessions(pickMostRecent: boolean): Promise<void> {
  sessions = await readIndex()
  if (pickMostRecent || selectedSessionId === undefined) {
    selectedSessionId = sessions[0]?.sessionId
  } else if (!sessions.some((s) => s.sessionId === selectedSessionId)) {
    selectedSessionId = sessions[0]?.sessionId
  }
}

async function load(): Promise<void> {
  loadError = undefined
  try {
    await loadSessions(false)
    bundle = selectedSessionId ? await loadBundle(selectedSessionId) : undefined
    await render()
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e)
    await render()
  }
}

void load()
