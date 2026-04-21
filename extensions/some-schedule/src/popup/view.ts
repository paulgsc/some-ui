/**
 *
 * Pure render function. Takes state, mounts DOM. No internal state.
 * Every call replaces the content of #root entirely.
 *
 * Design: industrial control panel. Monospace data, status lights,
 * hairline borders, amber accent. No rounded corners on structural elements.
 */

import type { TabSummary } from "@schedule/shared/types"

import type { PopupState } from "./fsm"
import type { Action } from "./popup"

type Dispatch = (action: Action) => void

// ── Entry ─────────────────────────────────────────────────────────────────

export function render(state: PopupState, dispatch: Dispatch): void {
  const root = document.getElementById("root")!
  root.innerHTML = ""
  root.appendChild(renderState(state, dispatch))
}

// ── State router ──────────────────────────────────────────────────────────

function renderState(state: PopupState, dispatch: Dispatch): HTMLElement {
  switch (state.kind) {
    case "INIT":
      return renderInit()
    case "IDLE":
      return renderIdle(state, dispatch)
    case "SYNCING":
      return renderSyncing(state)
    case "SYNC_DONE":
      return renderSyncDone(state, dispatch)
    case "SYNC_FAILED":
      return renderSyncFailed(state, dispatch)
    case "RECONCILING":
      return renderWorking("reconciling with db")
    case "RECONCILE_REVIEW":
      return renderReconcileReview(state, dispatch)
    case "RECONCILE_DELETING":
      return renderWorking(`deleting ${state.tab_ids.length} tab records`)
    case "TRIGGERING_PIPELINE":
      return renderWorking("publishing to nats")
    case "PIPELINE_QUEUED":
      return renderPipelineQueued(state, dispatch)
    case "PIPELINE_TRIGGER_FAILED":
      return renderPipelineFailed(state, dispatch)
    case "PRUNING":
      return renderWorking("pruning stale records")
    case "PRUNE_DONE":
      return renderPruneDone(state, dispatch)
    case "ERROR":
      return renderError(state, dispatch)
  }
}

// ── Layout primitives ──────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  children: Array<HTMLElement | string> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  for (const child of children) {
    if (typeof child === "string")
      node.appendChild(document.createTextNode(child))
    else node.appendChild(child)
  }
  return node
}

function btn(
  label: string,
  cls: string,
  onClick: () => void
): HTMLButtonElement {
  const b = el("button", cls, [label])
  b.addEventListener("click", onClick)
  return b
}

// Status light: dot that signals health/state
function statusLight(
  variant: "active" | "warn" | "error" | "dim"
): HTMLElement {
  return el("span", `light light--${variant}`)
}

// Metric block: label over value in monospace
function metric(
  label: string,
  value: string | number,
  variant = ""
): HTMLElement {
  const wrap = el("div", `metric${variant ? ` metric--${variant}` : ""}`)
  const lbl = el("div", "metric__label", [String(label)])
  const val = el("div", "metric__value", [String(value)])
  wrap.appendChild(lbl)
  wrap.appendChild(val)
  return wrap
}

function divider(): HTMLElement {
  return el("div", "divider")
}

function errorBox(msg: string): HTMLElement {
  const box = el("div", "error-box")
  const pre = el("pre", "error-box__text", [msg])
  box.appendChild(pre)
  return box
}

function header(
  label: string,
  light?: ReturnType<typeof statusLight>
): HTMLElement {
  const h = el("div", "panel-header")
  const span = el("span", "panel-header__label", [label])
  h.appendChild(span)
  if (light) h.appendChild(light)
  return h
}

// ── State renderers ────────────────────────────────────────────────────────

function renderInit(): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched", statusLight("dim")))
  const body = el("div", "panel-body panel-body--center")
  const spinner = el("div", "spinner")
  const lbl = el("div", "loading-label", ["initialising"])
  body.appendChild(spinner)
  body.appendChild(lbl)
  panel.appendChild(body)
  return panel
}

function renderIdle(
  state: Extract<PopupState, { kind: "IDLE" }>,
  dispatch: Dispatch
): HTMLElement {
  const panel = el("div", "panel")

  panel.appendChild(header("tabsched", statusLight("active")))

  const metrics = el("div", "metrics-row")
  metrics.appendChild(metric("browser tabs", state.tab_count))
  metrics.appendChild(metric("db records", state.db_count))
  panel.appendChild(metrics)

  const syncedAt = el("div", "sync-timestamp")
  syncedAt.textContent = state.last_synced_at
    ? `last sync  ${formatRelative(state.last_synced_at)}`
    : "never synced"
  panel.appendChild(syncedAt)

  panel.appendChild(divider())

  // Primary action
  const syncBtn = btn("sync tabs →", "btn btn--primary", () =>
    dispatch({ type: "SYNC" })
  )
  panel.appendChild(syncBtn)

  // Secondary actions row
  const secondary = el("div", "action-row")
  secondary.appendChild(
    btn("reconcile", "btn btn--secondary", () =>
      dispatch({ type: "RECONCILE" })
    )
  )
  secondary.appendChild(
    btn("prune stale", "btn btn--secondary", () => dispatch({ type: "PRUNE" }))
  )
  panel.appendChild(secondary)

  panel.appendChild(divider())

  // Pipeline trigger — always available in IDLE
  const pipelineSection = el("div", "pipeline-section")
  const pipelineLabel = el("div", "section-label", ["pipeline"])
  pipelineSection.appendChild(pipelineLabel)
  pipelineSection.appendChild(
    btn("trigger →", "btn btn--pipeline", () =>
      dispatch({ type: "TRIGGER_PIPELINE" })
    )
  )
  panel.appendChild(pipelineSection)

  return panel
}

function renderSyncing(
  state: Extract<PopupState, { kind: "SYNCING" }>
): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched · syncing", statusLight("warn")))

  const body = el("div", "panel-body")

  if (state.total > 0) {
    const pct = Math.round((state.completed / state.total) * 100)
    const prog = el("div", "progress-block")
    const bar = el("div", "progress-bar")
    const fill = el("div", "progress-bar__fill")
    fill.style.width = `${pct}%`
    bar.appendChild(fill)
    prog.appendChild(bar)

    const counts = el("div", "progress-counts")
    counts.textContent = `${state.completed} / ${state.total}`
    prog.appendChild(counts)

    body.appendChild(prog)
  } else {
    body.appendChild(el("div", "loading-label", ["querying tabs"]))
  }

  panel.appendChild(body)
  return panel
}

function renderSyncDone(
  state: Extract<PopupState, { kind: "SYNC_DONE" }>,
  dispatch: Dispatch
): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched · sync complete", statusLight("active")))

  const metrics = el("div", "metrics-row")
  metrics.appendChild(metric("upserted", state.result.upserted, "ok"))
  metrics.appendChild(
    metric("failed", state.result.failed, state.result.failed > 0 ? "warn" : "")
  )
  metrics.appendChild(metric("db total", state.db_count))
  panel.appendChild(metrics)

  if (state.result.failed > 0) {
    const failList = el("div", "fail-list")
    const failLabel = el("div", "section-label", ["extraction errors"])
    failList.appendChild(failLabel)
    for (const id of state.result.error_tab_ids.slice(0, 5)) {
      failList.appendChild(el("div", "fail-item", [`tab ${id}`]))
    }
    if (state.result.error_tab_ids.length > 5) {
      failList.appendChild(
        el("div", "fail-item fail-item--more", [
          `+${state.result.error_tab_ids.length - 5} more`,
        ])
      )
    }
    panel.appendChild(failList)
  }

  panel.appendChild(divider())

  const actions = el("div", "action-row")
  actions.appendChild(
    btn("trigger pipeline →", "btn btn--pipeline", () =>
      dispatch({ type: "TRIGGER_PIPELINE" })
    )
  )
  actions.appendChild(
    btn("done", "btn btn--ghost", () => dispatch({ type: "DISMISS" }))
  )
  panel.appendChild(actions)

  return panel
}

function renderSyncFailed(
  state: Extract<PopupState, { kind: "SYNC_FAILED" }>,
  dispatch: Dispatch
): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched · sync failed", statusLight("error")))

  if (state.completed_before_failure > 0) {
    const partial = el("div", "partial-note")
    partial.textContent = `${state.completed_before_failure} tabs extracted before failure`
    panel.appendChild(partial)
  }

  panel.appendChild(errorBox(state.error))
  panel.appendChild(divider())

  const actions = el("div", "action-row")
  actions.appendChild(
    btn("retry", "btn btn--primary", () => dispatch({ type: "SYNC" }))
  )
  actions.appendChild(
    btn("dismiss", "btn btn--ghost", () => dispatch({ type: "DISMISS" }))
  )
  panel.appendChild(actions)

  return panel
}

function renderWorking(label: string): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched", statusLight("warn")))
  const body = el("div", "panel-body panel-body--center")
  const spinner = el("div", "spinner")
  const lbl = el("div", "loading-label", [label])
  body.appendChild(spinner)
  body.appendChild(lbl)
  panel.appendChild(body)
  return panel
}

function renderReconcileReview(
  state: Extract<PopupState, { kind: "RECONCILE_REVIEW" }>,
  dispatch: Dispatch
): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched · reconcile", statusLight("warn")))

  const { absent_tab_ids, absent_summaries } = state.result

  if (absent_tab_ids.length === 0) {
    const ok = el("div", "panel-body")
    ok.appendChild(el("div", "ok-note", ["db is in sync with browser"]))
    panel.appendChild(ok)
    panel.appendChild(divider())
    panel.appendChild(
      btn("done", "btn btn--ghost btn--full", () =>
        dispatch({ type: "DISMISS" })
      )
    )
    return panel
  }

  const countNote = el("div", "count-note")
  countNote.textContent = `${absent_tab_ids.length} record${absent_tab_ids.length !== 1 ? "s" : ""} not in browser`
  panel.appendChild(countNote)

  if (absent_summaries.length > 0) {
    const list = el("div", "absent-list")
    const shown = absent_summaries.slice(0, 6)
    for (const s of shown) {
      list.appendChild(renderAbsentRow(s))
    }
    if (absent_summaries.length > 6) {
      list.appendChild(
        el("div", "absent-row absent-row--more", [
          `+${absent_summaries.length - 6} more`,
        ])
      )
    }
    panel.appendChild(list)
  } else {
    // Summaries unavailable — show raw ids
    const ids = el("div", "absent-ids")
    ids.textContent = absent_tab_ids.slice(0, 10).join(", ")
    if (absent_tab_ids.length > 10) {
      ids.textContent += ` +${absent_tab_ids.length - 10} more`
    }
    panel.appendChild(ids)
  }

  panel.appendChild(divider())

  const actions = el("div", "action-row")
  actions.appendChild(
    btn("delete absent →", "btn btn--danger", () =>
      dispatch({
        type: "RECONCILE_CONFIRM_DELETE",
        tab_ids: absent_tab_ids,
      })
    )
  )
  actions.appendChild(
    btn("keep all", "btn btn--ghost", () => dispatch({ type: "DISMISS" }))
  )
  panel.appendChild(actions)

  return panel
}

function renderAbsentRow(s: TabSummary): HTMLElement {
  const row = el("div", "absent-row")
  const title = el("div", "absent-row__title", [s.tab_title || s.url])
  const meta = el("div", "absent-row__meta", [
    `${s.domain}  ·  last seen ${formatRelative(s.last_seen_at)}`,
  ])
  row.appendChild(title)
  row.appendChild(meta)
  return row
}

function renderPipelineQueued(
  state: Extract<PopupState, { kind: "PIPELINE_QUEUED" }>,
  dispatch: Dispatch
): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched · pipeline queued", statusLight("active")))

  const body = el("div", "panel-body")
  const note = el("div", "ok-note", ["nats message published"])
  body.appendChild(note)
  body.appendChild(metric("tab records dispatched", state.db_count))
  panel.appendChild(body)
  panel.appendChild(divider())
  panel.appendChild(
    btn("done", "btn btn--ghost btn--full", () => dispatch({ type: "DISMISS" }))
  )
  return panel
}

function renderPipelineFailed(
  state: Extract<PopupState, { kind: "PIPELINE_TRIGGER_FAILED" }>,
  dispatch: Dispatch
): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched · pipeline error", statusLight("error")))
  panel.appendChild(errorBox(state.error))
  panel.appendChild(divider())
  const actions = el("div", "action-row")
  actions.appendChild(
    btn("retry", "btn btn--primary", () =>
      dispatch({ type: "TRIGGER_PIPELINE" })
    )
  )
  actions.appendChild(
    btn("dismiss", "btn btn--ghost", () => dispatch({ type: "DISMISS" }))
  )
  panel.appendChild(actions)
  return panel
}

function renderPruneDone(
  state: Extract<PopupState, { kind: "PRUNE_DONE" }>,
  dispatch: Dispatch
): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched · prune complete", statusLight("active")))
  const metrics = el("div", "metrics-row")
  metrics.appendChild(
    metric("pruned", state.pruned_count, state.pruned_count > 0 ? "warn" : "")
  )
  metrics.appendChild(metric("db remaining", state.db_count))
  panel.appendChild(metrics)
  panel.appendChild(divider())
  panel.appendChild(
    btn("done", "btn btn--ghost btn--full", () => dispatch({ type: "DISMISS" }))
  )
  return panel
}

function renderError(
  state: Extract<PopupState, { kind: "ERROR" }>,
  dispatch: Dispatch
): HTMLElement {
  const panel = el("div", "panel")
  panel.appendChild(header("tabsched · error", statusLight("error")))
  panel.appendChild(errorBox(state.message))
  panel.appendChild(divider())
  panel.appendChild(
    btn("dismiss", "btn btn--ghost btn--full", () =>
      dispatch({ type: "DISMISS" })
    )
  )
  return panel
}

// ── Utilities ─────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
