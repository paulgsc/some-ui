/**
 *
 * Minimal. The popup's only job is to show a summary of all tracked nodes
 * and let the user reset segment assignments. All deep interaction happens
 * in the content script HUD.
 */

import type { NodeState, OutboundMessage } from "@tab/types"
import {
  getDomain,
  OUTCOME_CONFIG,
  OUTCOMES,
  SEGMENT_DISPLAY,
} from "@tab/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLastSeen(visits: NodeState["visits"]): string {
  if (visits.length === 0) return "never"
  const last = Math.max(...visits.map((v) => v.timestamp))
  const diffMin = Math.floor((Date.now() - last) / 60_000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  return `${diffDay}d ago`
}

function countOutcomes(visits: NodeState["visits"]): Record<string, number> {
  const counts: Record<string, number> = { Progress: 0, Stuck: 0, Review: 0 }
  for (const v of visits) counts[v.outcome]++
  return counts
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function render(): Promise<void> {
  const listEl = document.getElementById("nodeList")!
  listEl.textContent = "loading…"

  let allNodes: Array<NodeState> = []

  try {
    // Query all tabs and fetch their node state
    const tabs = await browser.tabs.query({})
    const responses = await Promise.all(
      tabs
        .filter(
          (t): t is browser.tabs.Tab & { id: number } => t.id !== undefined
        )
        .map(async (t) => {
          const resp = (await browser.runtime.sendMessage({
            type: "GET_NODE_STATE",
            tabId: t.id,
          })) as OutboundMessage
          if (resp.type === "NODE_STATE" && resp.state !== null) {
            return resp.state
          }
          return null
        })
    )
    allNodes = responses.filter((n): n is NodeState => n !== null)
  } catch (err) {
    listEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`
    return
  }

  if (allNodes.length === 0) {
    listEl.innerHTML = `<div class="empty">No tracked nodes yet.<br/>Browse a bit and come back.</div>`
    return
  }

  // Sort by visit count descending
  allNodes.sort((a, b) => b.visits.length - a.visits.length)

  listEl.innerHTML = ""

  for (const node of allNodes) {
    const segCfg = node.segment ? SEGMENT_DISPLAY[node.segment] : null
    const counts = countOutcomes(node.visits)
    const domain = getDomain(node.url) || `tab ${node.tabId}`

    const row = document.createElement("div")
    row.className = "node-row"

    // Domain + segment
    const info = document.createElement("div")
    info.className = "node-info"

    const domainEl = document.createElement("div")
    domainEl.className = "node-domain"
    domainEl.textContent = domain

    const meta = document.createElement("div")
    meta.className = "node-meta"

    if (segCfg) {
      const segBadge = document.createElement("span")
      segBadge.className = "seg-badge"
      segBadge.style.color = segCfg.accent
      segBadge.style.borderColor = `${segCfg.accent}44`
      segBadge.textContent = segCfg.abbr
      meta.appendChild(segBadge)
    }

    const lastSeen = document.createElement("span")
    lastSeen.className = "node-last-seen"
    lastSeen.textContent = formatLastSeen(node.visits)
    meta.appendChild(lastSeen)

    info.appendChild(domainEl)
    info.appendChild(meta)

    // Outcome summary
    const outcomes = document.createElement("div")
    outcomes.className = "node-outcomes"

    for (const outcome of OUTCOMES) {
      const cfg = OUTCOME_CONFIG[outcome]
      const pill = document.createElement("span")
      pill.className = "outcome-pill"
      pill.style.color = cfg.color
      pill.textContent = `${cfg.symbol} ${counts[outcome]}`
      outcomes.appendChild(pill)
    }

    // Visit count
    const visitCount = document.createElement("div")
    visitCount.className = "node-visits"
    visitCount.textContent = String(node.visits.length)

    row.appendChild(info)
    row.appendChild(outcomes)
    row.appendChild(visitCount)
    listEl.appendChild(row)
  }
}

// ─── Error banner ─────────────────────────────────────────────────────────────

function showError(msg: string): void {
  const el = document.getElementById("errorBanner")
  if (!el) return
  el.textContent = msg
  el.style.display = "block"
}

// ─── Init ─────────────────────────────────────────────────────────────────────

void render().catch((err: unknown) => {
  showError(err instanceof Error ? err.message : String(err))
})

export {}
