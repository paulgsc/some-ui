/**
 * @module report
 *
 * Renders a run for a human reading a terminal.
 *
 * The organising principle is that a green run should be one screen and a red
 * run should lead with what broke. Findings carry their detail indented under
 * the line that names them, so scanning down the left edge gives the summary
 * and reading right gives the evidence.
 */

import type { DriftReport } from "./drift"
import type { ContractOutcome, Finding, OutcomeStatus } from "./probe"

const MARKERS: Record<OutcomeStatus, string> = {
  passed: "PASS",
  failed: "FAIL",
  warned: "WARN",
  skipped: "SKIP",
  errored: "ERR ",
}

const SEVERITY_MARKERS = { fail: "✗", warn: "!", info: "·" } as const

export type RunReport = {
  drift: DriftReport
  outcomes: Array<ContractOutcome>
  baseUrl: string | undefined
  /** Whether contract probes ran at all. */
  probed: boolean
}

function renderFinding(finding: Finding, indent: string): Array<string> {
  const lines = [
    `${indent}${SEVERITY_MARKERS[finding.severity]} ${finding.code}: ${finding.message}`,
  ]
  if (finding.detail !== undefined && finding.detail !== "") {
    for (const line of finding.detail.split("\n")) {
      lines.push(`${indent}    ${line}`)
    }
  }
  return lines
}

export function renderDrift(
  drift: DriftReport,
  showUncovered: boolean
): string {
  const lines: Array<string> = []
  lines.push("Route drift")
  lines.push("───────────")
  lines.push(
    `  server ${drift.serverVersion} · ${drift.covered}/${drift.total} routes covered by a contract`
  )

  const actionable = drift.findings.filter(
    (finding) => finding.code !== "uncovered-route"
  )
  const uncovered = drift.findings.filter(
    (finding) => finding.code === "uncovered-route"
  )

  if (actionable.length === 0) {
    lines.push("  ✓ every contract targets a route the server actually serves")
  } else {
    for (const finding of actionable) {
      lines.push(...renderFinding({ ...finding, detail: finding.detail }, "  "))
    }
  }

  if (showUncovered && uncovered.length > 0) {
    lines.push("")
    lines.push(
      `  Uncovered routes (${uncovered.length}) — not failures, just unwritten contracts:`
    )
    for (const finding of uncovered) {
      lines.push(`    · ${finding.message.replace("no contract covers ", "")}`)
    }
  } else if (uncovered.length > 0) {
    lines.push(
      `  · ${uncovered.length} route(s) have no contract yet (--show-uncovered to list)`
    )
  }

  return lines.join("\n")
}

export function renderOutcomes(
  outcomes: ReadonlyArray<ContractOutcome>
): string {
  const lines: Array<string> = []
  lines.push("Contract conformance")
  lines.push("────────────────────")

  for (const outcome of outcomes) {
    const timing =
      outcome.durationMs === undefined ? "" : ` ${outcome.durationMs}ms`
    const http =
      outcome.httpStatus === undefined ? "" : ` ${outcome.httpStatus}`
    lines.push(
      `  ${MARKERS[outcome.status]}  ${outcome.id}  ${outcome.method} ${outcome.path}${http}${timing}`
    )
    const notable = outcome.findings.filter(
      (finding) => finding.severity !== "info" || outcome.status === "skipped"
    )
    for (const finding of notable) {
      lines.push(...renderFinding(finding, "        "))
    }
  }

  return lines.join("\n")
}

export type RunSummary = {
  passed: number
  failed: number
  warned: number
  skipped: number
  errored: number
  driftFailures: number
}

export function summarize(report: RunReport): RunSummary {
  const count = (status: OutcomeStatus): number =>
    report.outcomes.filter((outcome) => outcome.status === status).length

  return {
    passed: count("passed"),
    failed: count("failed"),
    warned: count("warned"),
    skipped: count("skipped"),
    errored: count("errored"),
    driftFailures: report.drift.findings.filter(
      (finding) => finding.severity === "fail"
    ).length,
  }
}

export function renderSummary(summary: RunSummary, probed: boolean): string {
  const parts = [`${summary.driftFailures} drift failure(s)`]
  if (probed) {
    parts.push(
      `${summary.passed} passed`,
      `${summary.warned} warned`,
      `${summary.failed} failed`,
      `${summary.errored} errored`,
      `${summary.skipped} skipped`
    )
  }
  return `Summary: ${parts.join(" · ")}`
}

/** Non-zero only for things that are actually wrong: drift failures, failed and
 * errored probes. Warnings are drift the boundary has accumulated, which is
 * information, not breakage. */
export function exitCode(summary: RunSummary): number {
  return summary.driftFailures + summary.failed + summary.errored > 0 ? 1 : 0
}
