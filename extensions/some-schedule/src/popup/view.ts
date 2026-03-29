/**
 *
 * Pure DOM renderer — the only file allowed to touch the DOM.
 *
 * Exports a single `render(state)` function that takes a `PopupState`
 * and fully reconciles the DOM to match it. Called once on init and
 * again on every state transition. Idempotent — calling render twice
 * with the same state is safe.
 *
 * The HTML skeleton is defined in popup.html. This file only mutates
 * element properties — it never creates or destroys elements.
 *
 * Component layout (maps to HTML sections):
 *
 *   <header>         — always visible, shows "tabsched capture"
 *   <section#status> — one-line status label + state-specific sub-label
 *   <section#progress> — progress bar + tab counter (QUERYING_TABS only)
 *   <section#actions>  — capture buttons (IDLE, DONE states)
 *   <section#result>   — summary table (DONE states)
 *   <section#error>    — error message + dismiss (ERROR state)
 */

import type { CaptureSummary } from "@schedule/shared/types"

import type { PopupState } from "./fsm"

// ── Element refs ───────────────────────────────────────────────────────────
// Resolved once at module load. If an element is missing the extension
// HTML is wrong — we let it throw.

const el = {
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
  btnAgain: q<HTMLButtonElement>("#btn-again"),

  errorSection: q<HTMLElement>("#error-section"),
  errorMessage: q<HTMLPreElement>("#error-message"),
  btnDismiss: q<HTMLButtonElement>("#btn-dismiss"),
}

function q<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`[tabsched view] missing element: ${selector}`)
  return el
}

// ── Render ─────────────────────────────────────────────────────────────────

export function render(state: PopupState): void {
  // Hide all variable sections first — each branch reveals what it needs.
  hide(el.progressSection)
  hide(el.actionsSection)
  hide(el.resultSection)
  hide(el.errorSection)

  switch (state.kind) {
    case "INIT":
      setStatus("tabsched capture", "connecting…")
      show(el.actionsSection) // allow early interaction
      break

    case "IDLE":
      setStatus(
        "tabsched capture",
        state.last_summary != null
          ? `last run ${fmtDate(state.last_summary.captured_at)}`
          : "ready"
      )
      show(el.actionsSection)
      el.btnAll.disabled = false
      el.btnActive.disabled = false
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
      setStatus("capturing", "posting to pipeline…")
      show(el.progressSection)
      setProgress(100, 100) // full bar while waiting for POST
      break

    case "DONE_SUCCESS":
      setStatus("done", `sent  ·  ${fmtDate(state.summary.captured_at)}`)
      renderResult(state.summary, null)
      show(el.resultSection)
      break

    case "DONE_POST_FAILED":
      setStatus(
        "done",
        `pipeline unreachable  ·  ${fmtDate(state.summary.captured_at)}`
      )
      renderResult(state.summary, state.post_error)
      show(el.resultSection)
      show(el.actionsSection) // allow immediate re-run
      break

    case "ERROR":
      setStatus("error", "")
      el.errorMessage.textContent = state.message
      show(el.errorSection)
      show(el.actionsSection) // allow retry
      break
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function show(el: HTMLElement): void {
  el.style.display = "block"
}
function hide(el: HTMLElement): void {
  el.style.display = "none"
}

function setStatus(label: string, sub: string): void {
  el.statusLabel.textContent = label
  el.statusSub.textContent = sub
}

function setProgress(completed: number, total: number): void {
  if (total === 0) {
    // Indeterminate — total not yet known
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
  return iso.slice(0, 10)
}

function renderResult(summary: CaptureSummary, postError: string | null): void {
  const rows: Array<[string, string]> = [
    ["captured", String(summary.captured_ok)],
    ["failed", String(summary.captured_fail)],
    ["skipped", String(summary.skipped)],
    ["total", String(summary.total_tabs)],
  ]

  el.resultRows.innerHTML = rows
    .map(
      ([label, value]) => `
      <tr>
        <td class="row-label">${label}</td>
        <td class="row-value">${value}</td>
      </tr>`
    )
    .join("")

  if (postError != null) {
    el.resultStatus.textContent = `⚠ pipeline: ${postError}`
    el.resultStatus.className = "result-status warn"
  } else {
    el.resultStatus.textContent = "✓ delivered to pipeline"
    el.resultStatus.className = "result-status ok"
  }
}

// ── Exported element refs for event binding in index.ts ───────────────────
// index.ts attaches event listeners to buttons. Exporting the elements
// keeps the binding in one place without coupling view to controller.

export const buttons = {
  captureAll: el.btnAll,
  captureActive: el.btnActive,
  again: el.btnAgain,
  dismiss: el.btnDismiss,
}
