/**
 * Pure DOM renderer. The only file allowed to touch the DOM.
 */

import type { CaptureSummary } from "@schedule/shared/types"

import type { PopupState, SessionsState } from "./fsm"

// ── Types ──────────────────────────────────────────────────────────────────

type BindReturn = {
  headerBadge: HTMLSpanElement
  tabBtns: Array<HTMLButtonElement>
  tabCapture: HTMLDivElement
  tabSessions: HTMLDivElement
  statusLabel: HTMLParagraphElement
  statusSub: HTMLParagraphElement
  progressSection: HTMLElement
  progressFill: HTMLDivElement
  progressLabel: HTMLSpanElement
  actionsSection: HTMLElement
  btnAll: HTMLButtonElement
  btnActive: HTMLButtonElement
  resultSection: HTMLElement
  resultRows: HTMLTableSectionElement
  resultStatus: HTMLParagraphElement
  btnTriggerPipeline: HTMLButtonElement
  btnAgain: HTMLButtonElement
  errorSection: HTMLElement
  errorMessage: HTMLPreElement
  btnDismiss: HTMLButtonElement
  sessionsToolbar: HTMLElement
  btnRefresh: HTMLButtonElement
  btnTriggerAll: HTMLButtonElement
  sessionsLoading: HTMLElement
  sessionsEmpty: HTMLElement
  sessionsList: HTMLElement
  sessionsError: HTMLElement
  sessionsErrorMsg: HTMLParagraphElement
  btnSessionsRetry: HTMLButtonElement
}

// ── Internal State ─────────────────────────────────────────────────────────

let elements: BindReturn | null = null

/**
 * Idiomatic getter that enforces the 'init' contract and
 * satisfies TypeScript's null-check (Error 18047).
 */
function getEl(): BindReturn {
  if (!elements)
    throw new Error(
      "[tabsched view] View not initialized. Call init(root) first."
    )
  return elements
}

function bind(root: HTMLElement): BindReturn {
  // Helper to query and throw if missing
  const q = <T extends HTMLElement>(sel: string): T => {
    const node = root.querySelector<T>(sel)
    if (!node) throw new Error(`[tabsched view] missing element: ${sel}`)
    return node
  }

  return {
    headerBadge: q<HTMLSpanElement>("#header-badge"),
    tabBtns: Array.from(root.querySelectorAll<HTMLButtonElement>(".tab-btn")),
    tabCapture: q<HTMLDivElement>("#tab-capture"),
    tabSessions: q<HTMLDivElement>("#tab-sessions"),
    statusLabel: q<HTMLParagraphElement>("#status-label"),
    statusSub: q<HTMLParagraphElement>("#status-sub"),
    progressSection: q<HTMLElement>("#progress-section"),
    progressFill: q<HTMLDivElement>("#progress-fill"),
    progressLabel: q<HTMLSpanElement>("#progress-label"),
    actionsSection: q<HTMLElement>("#actions-section"),
    btnAll: q<HTMLButtonElement>("#btn-capture-all"),
    btnActive: q<HTMLButtonElement>("#btn-capture-active"),
    resultSection: q<HTMLElement>("#result-section"),
    resultRows: q<HTMLTableSectionElement>("#result-rows"),
    resultStatus: q<HTMLParagraphElement>("#result-status"),
    btnTriggerPipeline: q<HTMLButtonElement>("#btn-trigger-pipeline"),
    btnAgain: q<HTMLButtonElement>("#btn-again"),
    errorSection: q<HTMLElement>("#error-section"),
    errorMessage: q<HTMLPreElement>("#error-message"),
    btnDismiss: q<HTMLButtonElement>("#btn-dismiss"),
    sessionsToolbar: q<HTMLElement>("#sessions-toolbar"),
    btnRefresh: q<HTMLButtonElement>("#btn-refresh-sessions"),
    btnTriggerAll: q<HTMLButtonElement>("#btn-trigger-all-pipeline"),
    sessionsLoading: q<HTMLElement>("#sessions-loading"),
    sessionsEmpty: q<HTMLElement>("#sessions-empty"),
    sessionsList: q<HTMLElement>("#sessions-list"),
    sessionsError: q<HTMLElement>("#sessions-error"),
    sessionsErrorMsg: q<HTMLParagraphElement>("#sessions-error-msg"),
    btnSessionsRetry: q<HTMLButtonElement>("#btn-sessions-retry"),
  }
}

export function init(root: HTMLElement): void {
  elements = bind(root)
}

// ── Visibility Helpers ─────────────────────────────────────────────────────

function show(e: HTMLElement): void {
  e.style.display = "block"
}
function hide(e: HTMLElement): void {
  e.style.display = "none"
}

// ── UI Updates ─────────────────────────────────────────────────────────────

function setStatus(label: string, sub: string): void {
  const el = getEl()
  el.statusLabel.textContent = label
  el.statusSub.textContent = sub
}

function setProgress(completed: number, total: number): void {
  const el = getEl()
  if (total === 0) {
    el.progressFill.classList.add("indeterminate")
    el.progressFill.style.width = ""
    el.progressLabel.textContent = "…"
  } else {
    el.progressFill.classList.remove("indeterminate")
    const pct = Math.round((completed / total) * 100)
    el.progressFill.style.width = `${pct}%`
    el.progressLabel.textContent = `${completed} / ${total}`
  }
}

function fmtDate(iso: string): string {
  return iso.length >= 16
    ? iso.slice(5, 16).replace("T", " ")
    : iso.slice(0, 10)
}

function renderResultTable(
  summary: CaptureSummary,
  postError: string | null
): void {
  const el = getEl()
  const rows: Array<[string, string]> = [
    ["captured", String(summary.captured_ok)],
    ["failed", String(summary.captured_fail)],
    ["skipped", String(summary.skipped)],
    ["total", String(summary.total_tabs)],
  ]

  el.resultRows.innerHTML = rows
    .map(
      ([l, v]) =>
        `<tr><td class="row-label">${l}</td><td class="row-value">${v}</td></tr>`
    )
    .join("")

  if (postError != null) {
    el.resultStatus.textContent = `⚠ sqlite write failed: ${postError}`
    el.resultStatus.className = "result-status warn"
  } else {
    el.resultStatus.textContent = "✓ saved to sqlite"
    el.resultStatus.className = "result-status ok"
  }
}

// ── Main Renderers ─────────────────────────────────────────────────────────

export function render(state: PopupState): void {
  const el = getEl()

  hide(el.progressSection)
  hide(el.actionsSection)
  hide(el.resultSection)
  hide(el.errorSection)

  el.btnTriggerPipeline.disabled = false
  el.btnAll.disabled = false
  el.btnActive.disabled = false

  switch (state.kind) {
    case "INIT":
      setStatus("tabsched capture", "connecting…")
      show(el.actionsSection)
      break

    case "IDLE":
      setStatus(
        "tabsched capture",
        state.last_summary
          ? `last run ${fmtDate(state.last_summary.captured_at)}`
          : "ready"
      )
      show(el.actionsSection)
      break

    case "ALREADY_CAPTURING":
      setStatus("capturing", "started in another window")
      show(el.progressSection)
      setProgress(0, 0)
      break

    case "QUERYING_TABS":
      setStatus("capturing", "extracting tabs…")
      show(el.progressSection)
      setProgress(state.completed, state.total)
      break

    case "POSTING":
      setStatus("capturing", "writing to sqlite…")
      show(el.progressSection)
      setProgress(100, 100)
      break

    case "DONE_SUCCESS":
      setStatus("saved", fmtDate(state.summary.captured_at))
      renderResultTable(state.summary, null)
      show(el.resultSection)
      break

    case "DONE_POST_FAILED":
      setStatus("write failed", fmtDate(state.summary.captured_at))
      renderResultTable(state.summary, state.post_error)
      show(el.resultSection)
      show(el.actionsSection)
      el.btnTriggerPipeline.disabled = true
      break

    case "TRIGGERING_PIPELINE":
      setStatus("queueing", "sending pipeline signal…")
      show(el.resultSection)
      renderResultTable(state.summary, null)
      el.btnTriggerPipeline.disabled = true
      el.btnTriggerPipeline.textContent = "triggering…"
      break

    case "PIPELINE_QUEUED":
      setStatus("queued", "pipeline job enqueued ✓")
      renderResultTable(state.summary, null)
      el.resultStatus.textContent = "✓ pipeline job enqueued"
      el.resultStatus.className = "result-status ok"
      show(el.resultSection)
      el.btnTriggerPipeline.disabled = true
      el.btnTriggerPipeline.textContent = "queued ✓"
      break

    case "ERROR":
      setStatus("error", "")
      el.errorMessage.textContent = state.message
      show(el.errorSection)
      show(el.actionsSection)
      break
  }
}

export function renderSessions(state: SessionsState): void {
  const el = getEl()

  hide(el.sessionsLoading)
  hide(el.sessionsEmpty)
  hide(el.sessionsError)
  el.sessionsList.innerHTML = ""
  el.btnTriggerAll.disabled = false

  switch (state.kind) {
    case "IDLE":
      show(el.sessionsEmpty)
      break
    case "LOADING":
      show(el.sessionsLoading)
      el.btnTriggerAll.disabled = true
      break
    case "LOADED":
      if (state.summaries.length === 0) {
        show(el.sessionsEmpty)
      } else {
        state.summaries.forEach((s) =>
          el.sessionsList.appendChild(buildSessionCard(s, false, false))
        )
      }
      break
    case "DELETING":
      state.prev.forEach((s) =>
        el.sessionsList.appendChild(
          buildSessionCard(s, s.session_id === state.session_id, false)
        )
      )
      break
    case "TRIGGERING":
      state.prev.forEach((s) =>
        el.sessionsList.appendChild(
          buildSessionCard(s, false, s.session_id === state.session_id)
        )
      )
      break
    case "ERROR":
      el.sessionsErrorMsg.textContent = state.error
      show(el.sessionsError)
      break
  }
}

// ── Card Builder ───────────────────────────────────────────────────────────

function buildSessionCard(
  s: CaptureSummary,
  isDeleting: boolean,
  isTriggering: boolean
): HTMLElement {
  const card = document.createElement("div")
  card.className = "session-card"
  card.dataset.sessionId = s.session_id
  if (isDeleting || isTriggering) card.style.opacity = "0.45"

  const status = s.pipeline_status ?? "pending"
  const sid = s.session_id.slice(-8)

  card.innerHTML = `
    <div class="session-card-head">
      <span class="session-id" title="${s.session_id}">…${sid}</span>
      <span class="session-date">${fmtDate(s.captured_at)}</span>
    </div>
    <div class="session-stats">
      <div class="stat"><span class="stat-value ok">${s.captured_ok}</span><span class="stat-label">ok</span></div>
      <div class="stat"><span class="stat-value${s.captured_fail > 0 ? " warn" : " muted"}">${s.captured_fail}</span><span class="stat-label">fail</span></div>
      <div class="stat"><span class="stat-value muted">${s.skipped}</span><span class="stat-label">skip</span></div>
      <div class="stat"><span class="stat-value muted">${s.total_tabs}</span><span class="stat-label">total</span></div>
    </div>
    <div class="session-card-actions">
      <span class="pipeline-badge ${status}">${status}</span>
      <button class="btn-sm accent btn-trigger-session" data-session-id="${s.session_id}" 
        ${isTriggering || status === "running" || status === "done" ? "disabled" : ""}>
        ${isTriggering ? "…" : "▶ pipeline"}
      </button>
      <button class="btn-sm danger btn-delete-session" data-session-id="${s.session_id}" 
        ${isDeleting ? "disabled" : ""}>
        ${isDeleting ? "…" : "✕"}
      </button>
    </div>
  `

  return card
}

export function switchTab(name: "capture" | "sessions"): void {
  const el = getEl()
  el.tabBtns.forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  )

  if (name === "capture") {
    show(el.tabCapture)
    hide(el.tabSessions)
  } else {
    hide(el.tabCapture)
    show(el.tabSessions)
  }
}

// ── Exported Refs ──────────────────────────────────────────────────────────

export type ActionButtons = {
  captureAll: HTMLButtonElement
  captureActive: HTMLButtonElement
  triggerPipeline: HTMLButtonElement
  again: HTMLButtonElement
  dismiss: HTMLButtonElement
  refreshSessions: HTMLButtonElement
  triggerAllPipeline: HTMLButtonElement
  sessionsRetry: HTMLButtonElement
  tabBtns: Array<HTMLButtonElement>
  sessionsList: HTMLElement
}

export function getButtons(): ActionButtons {
  const el = getEl()
  return {
    captureAll: el.btnAll,
    captureActive: el.btnActive,
    triggerPipeline: el.btnTriggerPipeline,
    again: el.btnAgain,
    dismiss: el.btnDismiss,
    refreshSessions: el.btnRefresh,
    triggerAllPipeline: el.btnTriggerAll,
    sessionsRetry: el.btnSessionsRetry,
    tabBtns: el.tabBtns,
    sessionsList: el.sessionsList,
  }
}
