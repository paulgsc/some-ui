/**
 * Diagnostics page (`debug.html`) — OBS2 (#1396).
 *
 * some-filter's `debug.html` is the direct model, for the reason #1396 gives:
 * neither extension has a single long-lived background worker to message, so
 * this page cannot query a live thing. State lives per content-script session
 * in `storage.local`, and the page is a *session picker* over it — it reads
 * the capped index OBS1 (#1395) publishes, then that session's bundle.
 *
 * ## Why health is read, not recomputed
 *
 * some-filter's page deliberately *recomputes* its `HealthReport` from the
 * last persisted context, so the page can never become a second place a score
 * drifts. This page deliberately does not, and the difference is not laziness:
 *
 *   - **some-filter's invariants are time-independent.** `CoverageHeld` and
 *     its siblings compare booleans about what is in the DOM. Re-running them
 *     against a stored context yields the same answer whenever you ask.
 *   - **some-censor's are not.** `OccludedCardResolves` asks whether
 *     `now - firstSeenAt` has passed `RESOLVE_BUDGET_MS`, and
 *     `PromotionGuardClears` whether `now - startedAt` has passed
 *     `PROMOTION_STALL_MS`. Re-running those here, against a session that
 *     ended an hour ago, would report every card that happened to be mid-queue
 *     at teardown as permanently stuck — manufacturing violations out of
 *     nothing but elapsed wall-clock.
 *
 * So OBS1 records the verdict *at the moment it was true*, and this page
 * renders that verdict with the age of the reading attached. It is still a
 * pure projection — more strictly one than a recomputation, since there is no
 * second evaluation to disagree. #1396's own acceptance criteria allow this
 * ("match whichever #1395 actually returns").
 *
 * The `queues` snapshot is counts rather than the per-card arrays, for the
 * same reason: those arrays are what a recomputation would need, and a
 * recomputation is the thing that would be wrong.
 *
 * ## What it must not render
 *
 * A diagnostics viewer, not a new disclosure surface (#1382). The bundle
 * carries no title, channel name or thumbnail — OBS1 records none — and this
 * page adds no label of its own beyond what is in the bundle. The one content
 * string it does show is the raw upload-date corpus, which `H2` already treats
 * as nonsemantic and which is the entire reason #1394 precedes QC2 (#1384).
 */

import {
  BOYO_EVENT_KINDS,
  boyoInvariants,
  readIndex,
  sessionStorageKey,
  type IndexEntry,
} from "@censor/lib/content/observability"
import { ext } from "@censor/platform/content"
import type {
  InvariantResult,
  JsonValue,
  ObservabilityEvent,
  PersistedState,
} from "@some-extension/common/observability"

import "./debug.css"

type Bundle = PersistedState

/**
 * The health verdict as OBS1 recorded it — deliberately a re-declaration of
 * the snapshot's shape rather than `HealthReport` itself: what comes back off
 * disk was written by some build of this extension, possibly an older one, so
 * it is validated structurally and never asserted into the live type.
 */
export type RecordedHealth = {
  score: number
  status: string
  recentErrors: number
  generatedAt: number
  invariants: Array<{
    name: string
    status: InvariantResult["status"]
    details: JsonValue
  }>
}

/** Current view filter. Reset whenever the selected session changes. */
type Filter = { kind: string }

let sessions: Array<IndexEntry> = []
let selectedSessionId: string | undefined
let filter: Filter = { kind: "" }
let bundle: Bundle | undefined
/**
 * Which session `bundle` actually came from.
 *
 * Bot-found (#1407's own review): without this the rendered bundle and the
 * picker's selection could disagree across the storage read, and the Export
 * button stayed live throughout — so exporting during that window produced
 * the *previous* session's file while the page named the new one. A
 * mislabelled corpus is the one failure this page must not have, since
 * handing one to QC2 (#1384) is the whole reason it exists.
 */
let loadedSessionId: string | undefined
/** Guards against two loads landing out of order; see {@link load}. */
let loadToken = 0
let loadError: string | undefined

function isBundle(value: unknown): value is Bundle {
  return (
    value !== null &&
    typeof value === "object" &&
    Reflect.get(value, "version") === 1 &&
    Array.isArray(Reflect.get(value, "events"))
  )
}

function isRecordedInvariant(
  value: unknown
): value is RecordedHealth["invariants"][number] {
  if (value === null || typeof value !== "object") return false
  const status: unknown = Reflect.get(value, "status")
  return (
    typeof Reflect.get(value, "name") === "string" &&
    (status === "ok" || status === "violated" || status === "unknown")
  )
}

/**
 * Validated down to the individual check, not just the envelope: this came off
 * disk and may have been written by an older build of the extension, so the
 * page renders it only if it is actually the shape it claims. A half-valid
 * verdict is discarded rather than rendered with holes in it.
 */
function isRecordedHealth(value: unknown): value is RecordedHealth {
  if (value === null || typeof value !== "object") return false
  const invariants: unknown = Reflect.get(value, "invariants")
  return (
    typeof Reflect.get(value, "score") === "number" &&
    typeof Reflect.get(value, "status") === "string" &&
    typeof Reflect.get(value, "recentErrors") === "number" &&
    typeof Reflect.get(value, "generatedAt") === "number" &&
    Array.isArray(invariants) &&
    invariants.every(isRecordedInvariant)
  )
}

/** OBS1's recorded verdict, or undefined when no health sample has landed. */
function recordedHealth(b: Bundle): RecordedHealth | undefined {
  const raw = b.snapshots["health"]
  return isRecordedHealth(raw) ? raw : undefined
}

async function loadBundle(sessionId: string): Promise<Bundle | undefined> {
  const key = sessionStorageKey(sessionId)
  const raw: unknown = await ext.storage.local.get(key)
  const value: unknown =
    raw !== null && typeof raw === "object" ? Reflect.get(raw, key) : undefined
  return isBundle(value) ? value : undefined
}

// ── The date corpus ──────────────────────────────────────────────────────────

const DATES_PREFIX = "dates."

/** One surface's observed raw date forms, as OBS1 banked them. */
export type CorpusEntry = { surface: string; forms: Array<string> }

/**
 * Pull the `dates.<surface>` snapshots out of a bundle.
 *
 * Exported and pure so the shape QC2 (#1384) consumes is testable without a
 * DOM. A snapshot that is not an array of strings is skipped rather than
 * coerced: OBS1 sizes `maxDetailBytes` so a full corpus fits, but a bundle
 * written by an older build could have been clamped to a truncated string,
 * and showing that as if it were a corpus would be worse than omitting it.
 */
export function corpusOf(b: Bundle): Array<CorpusEntry> {
  const out: Array<CorpusEntry> = []
  for (const [key, value] of Object.entries(b.snapshots)) {
    if (!key.startsWith(DATES_PREFIX)) continue
    if (!Array.isArray(value)) continue
    const forms = value.filter((v): v is string => typeof v === "string")
    if (forms.length === 0) continue
    out.push({ surface: key.slice(DATES_PREFIX.length), forms })
  }
  return out.sort((a, b2) => a.surface.localeCompare(b2.surface))
}

// ── Formatting ───────────────────────────────────────────────────────────────

const pad = (n: number): string => String(n).padStart(2, "0")

function clockTime(t: number): string {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function relative(t: number, now: number): string {
  const seconds = Math.round((now - t) / 1000)
  if (seconds < 60) return `${String(seconds)}s ago`
  if (seconds < 3600) return `${String(Math.round(seconds / 60))}m ago`
  if (seconds < 86400) return `${String(Math.round(seconds / 3600))}h ago`
  return `${String(Math.round(seconds / 86400))}d ago`
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

/**
 * The session picker.
 *
 * Labelled by origin, surface and session ordinal — never the page title,
 * which on YouTube is the video title and so the one field this extension
 * exists to withhold (#1382). OBS1's `IndexEntry` carries no title for that
 * reason; some-filter's does, which is fine for a general-purpose theming
 * extension and would not be here.
 */
function pickerSection(): HTMLElement {
  const select = el("select")
  if (sessions.length === 0) {
    select.appendChild(new Option("no recorded sessions", ""))
    select.disabled = true
  } else {
    const now = Date.now()
    for (const s of sessions) {
      const label = `${s.origin} — ${s.surface} · session ${String(
        s.sessionOrdinal
      )} · ${relative(s.updatedAt, now)}`
      select.appendChild(new Option(label, s.sessionId))
    }
    select.value = selectedSessionId ?? sessions[0]?.sessionId ?? ""
  }
  select.addEventListener("change", () => {
    selectedSessionId = select.value || undefined
    filter = { kind: "" }
    // Drop the old session's bundle before the read starts, not after it
    // finishes: the handler that creates the divergence is the one that has
    // to resolve it. Rendering here immediately takes the Export button out
    // with it, so there is no window in which it would write the wrong file.
    clearLoadedBundle()
    render()
    void load()
  })

  const refresh = el("button", { text: "Refresh sessions" })
  // Bot-found (#1407's own review): this used to call loadSessions() alone,
  // which mutates module state and renders nothing — so a recording created
  // after the page opened stayed invisible however often it was clicked.
  refresh.addEventListener("click", () => void load(true))

  const section = el("section")
  section.append(
    el("h2", { text: "Session" }),
    el("div", {
      class: "bc-sub",
      text: "One recorder per page load (a key shared across tabs would race) — pick which one to inspect.",
    }),
    el("div", { class: "bc-picker" }, [select, refresh])
  )
  return section
}

function severityClass(status: InvariantResult["status"]): string {
  return status === "ok" ? "ok" : status === "violated" ? "bad" : "muted"
}

/**
 * The recorded health verdict, with the age of the reading attached.
 *
 * The age is not decoration: this is a reading taken at a moment, not a live
 * check (see this module's header), so a score with no indication of when it
 * was taken would invite exactly the misreading the design avoids.
 */
function healthSection(health: RecordedHealth): HTMLElement {
  const cls =
    health.status === "healthy"
      ? "ok"
      : health.status === "degraded"
        ? "warn"
        : "bad"

  const score = el("div", { class: `bc-score ${cls}` })
  score.append(
    document.createTextNode(String(health.score)),
    el("small", { text: ` / 100 · ${health.status}` })
  )

  const checks = el("ul", { class: "bc-checks" })
  for (const inv of health.invariants) {
    const mark =
      inv.status === "ok" ? "✓" : inv.status === "violated" ? "✕" : "–"
    const body = el("div")
    body.append(el("div", { text: inv.name }))
    // OBS1's health snapshot records name/status/details but not the
    // description — it would cost a copy of this prose in every persisted
    // bundle for no benefit, since the text is a constant of the build. Look
    // it up from the live adapter instead. A bundle naming an invariant this
    // build no longer has simply renders without one, rather than breaking.
    const described = boyoInvariants.find((i) => i.name === inv.name)
    if (described) {
      body.append(el("div", { class: "bc-desc", text: described.description }))
    }
    if (inv.details !== null) {
      body.appendChild(
        el("div", { class: "bc-desc bad", text: compact(inv.details) })
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
      class: "bc-sub",
      text: `As recorded ${relative(health.generatedAt, Date.now())} — a reading taken in the page, not a live check. ${
        health.recentErrors === 0
          ? "No errors in the retained window."
          : `${String(health.recentErrors)} error event(s) in the retained window.`
      }`,
    }),
    checks
  )
  return section
}

/** Health is absent until the first sample lands; say so rather than imply healthy. */
function noHealthSection(): HTMLElement {
  const section = el("section")
  section.append(
    el("h2", { text: "Health" }),
    el("div", {
      class: "bc-empty",
      text: "No health sample has landed for this session yet. Nothing is claimed either way — an un-evaluated check is not a clean bill of health.",
    })
  )
  return section
}

/**
 * The observed date corpus — the reason this epic precedes QC2 (#1384).
 *
 * Rendered first among the data sections because it is what a user hands over,
 * and because seeing it is how they know whether a surface still needs
 * visiting before the corpus is worth exporting.
 */
function corpusSection(b: Bundle): HTMLElement {
  const entries = corpusOf(b)
  const total = entries.reduce((n, e) => n + e.forms.length, 0)

  const section = el("section")
  section.append(el("h2", { text: "Observed date forms" }))

  if (entries.length === 0) {
    section.append(
      el("div", {
        class: "bc-empty",
        text: "No date forms recorded in this session yet. Browsing a feed, a search page or a watch page is what fills this.",
      })
    )
    return section
  }

  const table = el("table", { class: "bc-corpus" })
  const head = el("tr")
  for (const label of ["surface", "n", "forms"]) {
    head.appendChild(el("th", { text: label }))
  }
  table.appendChild(el("thead", {}, [head]))

  const body = el("tbody")
  for (const entry of entries) {
    const row = el("tr")
    row.append(
      el("td", { text: entry.surface }),
      el("td", { class: "muted", text: String(entry.forms.length) }),
      el("td", { class: "detail", text: entry.forms.join(" · ") })
    )
    body.appendChild(row)
  }
  table.appendChild(body)

  section.append(
    el("div", {
      class: "bc-sub",
      text: `${String(total)} distinct raw form(s) across ${String(
        entries.length
      )} surface(s). Recorded verbatim — an upload date is the one field this extension treats as nonsemantic (H2).`,
    }),
    el("div", { class: "bc-scroll" }, [table])
  )
  return section
}

const COUNTER_ORDER = [
  "sessions_started",
  "navigations",
  "mutation_batches",
  "mounts_resolved",
  "mounts_provisional",
  "cards_queued_unresolved",
  "cards_rejected",
  "stale_promotions_discarded",
  "channels_backfilled",
  "channels_abandoned",
  "dates_observed",
  "dates_absent",
  "invariant_violations",
]

function metricsSection(b: Bundle): HTMLElement {
  const grid = el("div", { class: "bc-grid" })
  const counters = b.metrics.counters
  const names = [
    ...COUNTER_ORDER.filter((n) => n in counters),
    ...Object.keys(counters).filter((n) => !COUNTER_ORDER.includes(n)),
  ]
  for (const name of names) {
    const row = el("div", { class: "bc-metric" })
    row.append(
      el("span", { class: "k", text: name }),
      el("span", { text: String(counters[name] ?? 0) })
    )
    grid.appendChild(row)
  }
  if (names.length === 0) {
    grid.appendChild(el("div", { class: "bc-empty", text: "No counters yet." }))
  }

  const aggregates = el("div", { class: "bc-grid" })
  for (const [name, agg] of Object.entries(b.metrics.aggregates)) {
    const mean = agg.count > 0 ? Math.round(agg.sum / agg.count) : 0
    const row = el("div", { class: "bc-metric" })
    row.append(
      el("span", { class: "k", text: name }),
      el("span", {
        text: `avg ${String(mean)} · min ${String(
          Math.round(agg.min)
        )} · max ${String(Math.round(agg.max))} · n=${String(agg.count)}`,
      })
    )
    aggregates.appendChild(row)
  }

  const section = el("section")
  section.append(el("h2", { text: "Metrics" }), grid)
  if (aggregates.childElementCount > 0) {
    section.append(el("h2", { text: "Distributions" }), aggregates)
  }
  return section
}

/** Snapshots other than the two rendered by their own sections above. */
function stateSection(b: Bundle): HTMLElement {
  const grid = el("div", { class: "bc-grid" })
  const entries = Object.entries(b.snapshots).filter(
    ([key]) => key !== "health" && !key.startsWith(DATES_PREFIX)
  )
  for (const [key, value] of entries) {
    const row = el("div", { class: "bc-metric" })
    row.append(
      el("span", { class: "k", text: key }),
      el("span", { text: compact(value) })
    )
    grid.appendChild(row)
  }
  if (entries.length === 0) {
    grid.appendChild(
      el("div", { class: "bc-empty", text: "No state recorded yet." })
    )
  }
  const section = el("section")
  section.append(el("h2", { text: "Current beliefs" }), grid)
  return section
}

function matches(event: ObservabilityEvent, f: Filter): boolean {
  return !f.kind || event.kind.startsWith(f.kind)
}

function timelineSection(b: Bundle, rerender: () => void): HTMLElement {
  // Offered in the adapter's declared order, not the order this bundle
  // happens to contain — a kind that is absent is itself worth being able
  // to look for, and OBS1 exports the vocabulary so this page need not
  // restate it.
  const present = new Set(b.events.map((e) => e.kind))
  const kindSelect = el("select")
  kindSelect.appendChild(new Option("all events", ""))
  for (const k of BOYO_EVENT_KINDS) {
    kindSelect.appendChild(new Option(present.has(k) ? k : `${k} (none)`, k))
  }
  kindSelect.value = filter.kind
  kindSelect.addEventListener("change", () => {
    filter = { kind: kindSelect.value }
    rerender()
  })

  const table = el("table", { class: "bc-events" })
  const head = el("tr")
  for (const label of ["time", "kind", "severity", "subject", "detail"]) {
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
      el("td", { class: "muted", text: String(event.subject ?? "") }),
      el("td", { class: "detail", text: compact(event.detail) })
    )
    body.appendChild(row)
  }
  table.appendChild(body)

  const section = el("section")
  section.append(
    el("h2", {
      text: `Timeline (${String(shown.length)} of ${String(b.events.length)})`,
    }),
    el("div", { class: "bc-filter" }, [kindSelect])
  )
  if (shown.length === 0) {
    section.appendChild(
      el("div", { class: "bc-empty", text: "No events match this filter." })
    )
  } else {
    section.appendChild(el("div", { class: "bc-scroll" }, [table]))
  }
  if (b.dropped > 0) {
    section.appendChild(
      el("div", {
        class: "bc-sub",
        text: `${String(
          b.dropped
        )} older event(s) have rolled out of the ring buffer. The date corpus above is unaffected — it is a snapshot, which the byte budget never sheds.`,
      })
    )
  }
  return section
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * The exported bundle: the whole `PersistedState` plus the recorded health
 * verdict lifted to the top level.
 *
 * `health` is lifted rather than left only inside `snapshots` because that is
 * the shape #1396 names, and because whoever consumes this — QC2 (#1384) for
 * the corpus, a bug report for everything else — should not have to know that
 * a verdict happens to be stored as a snapshot. It is a copy, not a second
 * source: `snapshots.health` stays exactly as recorded.
 */
export function exportShape(
  b: Bundle
): Bundle & { health: RecordedHealth | undefined } {
  return { ...b, health: recordedHealth(b) }
}

export function diagnosticsFilename(now: Date): string {
  return `some-censor-diagnostics-${now.toISOString().replace(/[:.]/g, "-")}.json`
}

function downloadBundle(b: Bundle): void {
  const blob = new Blob([JSON.stringify(exportShape(b), null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = el("a")
  anchor.href = url
  anchor.download = diagnosticsFilename(new Date())
  anchor.click()
  URL.revokeObjectURL(url)
}

// ── Render ───────────────────────────────────────────────────────────────────

function header(b: Bundle | undefined): HTMLElement {
  const title = el("div")
  title.append(
    el("h1", { text: "BOYO — Diagnostics" }),
    el("div", {
      class: "bc-sub",
      text: b
        ? `${b.namespace} · ${String(b.events.length)} event(s) retained`
        : sessions.length === 0
          ? "No sessions recorded yet — open YouTube with the extension active, then refresh."
          : "Pick a session above.",
    })
  )

  const refresh = el("button", { text: "Refresh" })
  refresh.addEventListener("click", () => void load())
  const actions = el("div", { class: "bc-actions" }, [refresh])

  if (b) {
    const exportBtn = el("button", { text: "Export JSON" })
    exportBtn.addEventListener("click", () => downloadBundle(b))
    actions.appendChild(exportBtn)
  }

  return el("div", { class: "bc-head" }, [title, actions])
}

function render(): void {
  const root = document.getElementById("app")
  if (!root) return
  root.replaceChildren()

  root.appendChild(header(bundle))
  root.appendChild(pickerSection())

  if (loadError !== undefined) {
    const section = el("section")
    section.append(
      el("h2", { text: "Unavailable" }),
      el("div", { class: "bc-empty bad", text: loadError })
    )
    root.appendChild(section)
    return
  }

  if (!bundle) {
    root.appendChild(
      el("div", {
        class: "bc-empty",
        text:
          sessions.length === 0
            ? "Nothing to show yet."
            : "Loading diagnostics…",
      })
    )
    return
  }

  const health = recordedHealth(bundle)
  root.append(
    health ? healthSection(health) : noHealthSection(),
    corpusSection(bundle),
    metricsSection(bundle),
    stateSection(bundle),
    timelineSection(bundle, render)
  )
}

function clearLoadedBundle(): void {
  bundle = undefined
  loadedSessionId = undefined
}

/**
 * Which session to show, given a freshly read index. Pure, and that is the
 * point.
 *
 * Bot-found (#1407's own review, round 2): this used to be an async
 * `loadSessions()` that assigned `sessions` and `selectedSessionId` itself —
 * *before* {@link load}'s token check could discard a superseded run. So a
 * slow "Refresh sessions" that the user overtook by picking another session
 * still reset the selection when it finally resolved, leaving
 * `selectedSessionId` naming one session while `bundle` held another. The
 * next render that does not reload — a timeline filter change is enough —
 * then drew the picker on the stale selection with the other session's bundle
 * still exported behind it: the same mislabelled-export failure round 1 was
 * about, re-entered through the guard meant to prevent it.
 *
 * Computing the candidate and committing it only after the guard is what
 * makes that structurally impossible rather than ordered-correctly-for-now.
 */
function nextSelection(
  index: ReadonlyArray<IndexEntry>,
  pickMostRecent: boolean,
  current: string | undefined
): string | undefined {
  if (
    pickMostRecent ||
    current === undefined ||
    !index.some((s) => s.sessionId === current)
  ) {
    return index[0]?.sessionId
  }
  return current
}

/**
 * Refresh the session list and the selected session's bundle.
 *
 * `pickMostRecent` forces the newest recording to be selected, which is what
 * "Refresh sessions" means; the header's own "Refresh" leaves the selection
 * alone.
 *
 * Two loads can be in flight at once — a fast double-change of the picker is
 * enough — and their storage reads are not obliged to settle in the order
 * they started. So `loadToken` gates not just every render but **every write
 * to module state**: a superseded load must leave `sessions`,
 * `selectedSessionId`, `bundle` and `loadError` exactly as it found them. The
 * rule this function keeps is that nothing module-scoped is assigned between
 * an `await` and the token check that follows it.
 */
async function load(pickMostRecent = false): Promise<void> {
  const token = ++loadToken
  // Bot-found (#1407's own review, round 3): clearing the error without
  // painting it away left the "Unavailable" panel on screen for the whole
  // retry — and render() returns early while loadError is set, so nothing
  // else in this function would have repainted it either when the selection
  // has not changed (the ordinary header-Refresh case). A retry that looks
  // like it never started is one a user hits again, and again.
  //
  // Conditional rather than an unconditional render at the top: on the far
  // more common no-error path there is nothing to repaint, and a render there
  // would flash the whole page on every refresh.
  const hadError = loadError !== undefined
  loadError = undefined
  if (hadError) render()
  try {
    const index = await readIndex()
    if (token !== loadToken) return
    sessions = index
    selectedSessionId = nextSelection(index, pickMostRecent, selectedSessionId)
    if (selectedSessionId !== loadedSessionId) {
      clearLoadedBundle()
      render()
    }
    const next = selectedSessionId
      ? await loadBundle(selectedSessionId)
      : undefined
    if (token !== loadToken) return
    bundle = next
    loadedSessionId = selectedSessionId
    render()
  } catch (e) {
    if (token !== loadToken) return
    loadError = e instanceof Error ? e.message : String(e)
    render()
  }
}

void load()
