import type { LedgerState, TabRecord } from "@tab/types"
import {
  BADGE_COLORS,
  formatMsShort,
  getBadgeTier,
  getDomain,
} from "@tab/types"
import browser from "webextension-polyfill"

// ─── State ────────────────────────────────────────────────────────────────────

type ViewMode = "session" | "alltime"
let viewMode: ViewMode = "session"
let ledgerState: LedgerState | null = null
let expandedTabId: number | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTimeForMode(record: TabRecord): number {
  return viewMode === "session" ? record.sessionMs : record.totalMs
}

function getTags(
  record: TabRecord,
  totalMs: number,
  sessionTotal: number
): Array<string> {
  const tags: Array<string> = []
  const ms = getTimeForMode(record)

  if (record.isActive) tags.push("active")
  if (record.intentional) tags.push("pinned")

  if (viewMode === "session") {
    const share = sessionTotal > 0 ? ms / sessionTotal : 0
    if (share > 0.4 && ms > 20 * 60 * 1000) tags.push("rabbit-hole")
    else if (ms > 45 * 60 * 1000) tags.push("deep-work")

    if (ms === 0) tags.push("cold")
    else if (ms < 5 * 60 * 1000 && sessionTotal > 30 * 60 * 1000) {
      tags.push("neglected")
    }
  } else {
    const share = totalMs > 0 ? ms / totalMs : 0
    if (share > 0.35) tags.push("rabbit-hole")
    else if (ms > 2 * 60 * 60 * 1000) tags.push("deep-work")
    if (ms === 0) tags.push("cold")
  }

  return tags
}

function tagLabel(tag: string): string {
  const labels: Record<string, string> = {
    active: "live",
    pinned: "intent",
    "rabbit-hole": "rabbit hole",
    "deep-work": "deep work",
    neglected: "neglected",
    cold: "cold",
  }
  return labels[tag] || tag
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderTabList(state: LedgerState): void {
  const listEl = document.getElementById("tabList")!

  const records = Object.values(state.records)

  if (records.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◎</div>
        No tabs tracked yet.<br/>Browse a bit and come back.
      </div>`
    return
  }

  const sessionTotal = records.reduce((s, r) => s + r.sessionMs, 0)
  const allTimeTotal = records.reduce((s, r) => s + r.totalMs, 0)
  const grandTotal = viewMode === "session" ? sessionTotal : allTimeTotal

  // Sort by selected mode, descending
  const sorted = [...records].sort(
    (a, b) => getTimeForMode(b) - getTimeForMode(a)
  )

  listEl.innerHTML = ""

  for (const record of sorted) {
    const ms = getTimeForMode(record)
    const share = grandTotal > 0 ? ms / grandTotal : 0
    const tier = getBadgeTier(record.totalMs)
    const barColor = BADGE_COLORS[tier]
    const tags = getTags(record, allTimeTotal, sessionTotal)
    const domain =
      getDomain(record.url) || record.title || `tab ${record.tabId}`
    const isExpanded = expandedTabId === record.tabId

    const row = document.createElement("div")
    row.className = `tab-row${isExpanded ? " expanded" : ""}`
    row.dataset.tabId = String(record.tabId)

    const tagsHtml = tags
      .map((t) => `<span class="tag tag-${t}">${tagLabel(t)}</span>`)
      .join("")

    const faviconHtml = record.favicon
      ? `<img class="tab-favicon" src="${record.favicon}" alt="" onerror="this.style.display='none'" />`
      : `<div class="tab-favicon-placeholder"></div>`

    const activeDot = record.isActive ? `<span class="active-dot"></span>` : ""

    // Sparkline
    let sparkHtml = ""
    if (isExpanded) {
      const buckets = record.buckets
      const maxBucket = Math.max(...buckets, 1)
      const sparkBars = buckets
        .map((b) => {
          const heightPct = Math.max(6, Math.round((b / maxBucket) * 100))
          return `<div class="spark-bar" style="height:${heightPct}%;background:${barColor}33;"></div>`
        })
        .join("")

      sparkHtml = `
        <div class="tab-expand open">
          <div class="sparkline-label">Time distribution (15m buckets)</div>
          <div class="sparkline">
            ${buckets.length > 0 ? sparkBars : '<span style="color:var(--text-muted);font-size:10px">No bucket data yet</span>'}
          </div>
          <button class="pin-btn${record.intentional ? " pinned" : ""}" data-pin="${record.tabId}">
            ${record.intentional ? "◆ intentional (click to remove)" : "◇ mark as intentional"}
          </button>
        </div>`
    }

    row.innerHTML = `
      <div class="tab-main">
        ${faviconHtml}
        <div class="tab-info">
          <div class="tab-domain">${domain}</div>
          <div class="tab-title">${record.title || record.url}</div>
        </div>
        <div class="tab-right">
          <div style="display:flex;align-items:center;gap:5px;">
            ${activeDot}
            <span class="tab-time">${ms > 0 ? formatMsShort(ms) : "—"}</span>
          </div>
          <div class="tab-tags">${tagsHtml}</div>
        </div>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.round(share * 100)}%;background:${barColor};"></div>
      </div>
      ${sparkHtml}
    `

    listEl.appendChild(row)
  }

  // Click handlers
  listEl.querySelectorAll<HTMLElement>(".tab-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      // Don't toggle if pin button clicked
      if ((e.target as HTMLElement).closest(".pin-btn")) return
      const tabId = Number(row.dataset.tabId)
      expandedTabId = expandedTabId === tabId ? null : tabId
      renderTabList(state)
    })
  })

  listEl.querySelectorAll<HTMLButtonElement>("[data-pin]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation()
      const tabId = Number(btn.dataset.pin)
      await browser.runtime.sendMessage({ type: "PIN_TAB", tabId })
      // Re-fetch and re-render
      await refresh()
    })
  })
}

function renderHeader(state: LedgerState): void {
  const sessionTotal = Object.values(state.records).reduce(
    (s, r) => s + r.sessionMs,
    0
  )
  const allTimeTotal = Object.values(state.records).reduce(
    (s, r) => s + r.totalMs,
    0
  )

  const displayTotal = viewMode === "session" ? sessionTotal : allTimeTotal

  document.getElementById("sessionTotal")!.textContent =
    formatMsShort(displayTotal) || "0m"

  const records = Object.values(state.records)
  const tracked = records.filter((r) => getTimeForMode(r) > 0).length
  const sorted = [...records].sort(
    (a, b) => getTimeForMode(b) - getTimeForMode(a)
  )
  const topRecord = sorted[0]

  document.getElementById("statTabs")!.textContent = String(records.length)
  document.getElementById("statActive")!.textContent = String(tracked)
  document.getElementById("statTop")!.textContent = topRecord
    ? getDomain(topRecord.url) || "—"
    : "—"
}

// ─── Export ───────────────────────────────────────────────────────────────────

function buildMarkdown(state: LedgerState): string {
  const records = Object.values(state.records).sort(
    (a, b) => getTimeForMode(b) - getTimeForMode(a)
  )

  const lines = [
    `# TabLedger Export`,
    `> ${new Date().toLocaleString()}  |  mode: ${viewMode}`,
    ``,
    `| Domain | Time | Tags |`,
    `|--------|------|------|`,
    ...records.map((r) => {
      const sessionTotal = Object.values(state.records).reduce(
        (s, rec) => s + rec.sessionMs,
        0
      )
      const allTimeTotal = Object.values(state.records).reduce(
        (s, rec) => s + rec.totalMs,
        0
      )
      const tags = getTags(r, allTimeTotal, sessionTotal).join(", ")
      const ms = getTimeForMode(r)
      return `| ${getDomain(r.url) || r.title} | ${formatMsShort(ms)} | ${tags} |`
    }),
  ]
  return lines.join("\n")
}

// ─── Data fetch & refresh ─────────────────────────────────────────────────────

async function refresh(): Promise<void> {
  try {
    const resp = await browser.runtime.sendMessage({ type: "GET_FULL_STATE" })
    if (resp?.state) {
      ledgerState = resp.state as LedgerState
      renderHeader(ledgerState)
      renderTabList(ledgerState)
    }
  } catch (err) {
    console.error("TabLedger popup: failed to fetch state", err)
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.getElementById("btnSession")!.addEventListener("click", () => {
  viewMode = "session"
  document.getElementById("btnSession")!.classList.add("active")
  document.getElementById("btnAllTime")!.classList.remove("active")
  if (ledgerState) {
    renderHeader(ledgerState)
    renderTabList(ledgerState)
  }
})

document.getElementById("btnAllTime")!.addEventListener("click", () => {
  viewMode = "alltime"
  document.getElementById("btnAllTime")!.classList.add("active")
  document.getElementById("btnSession")!.classList.remove("active")
  if (ledgerState) {
    renderHeader(ledgerState)
    renderTabList(ledgerState)
  }
})

document.getElementById("resetBtn")!.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "RESET_SESSION" })
  await refresh()
})

document.getElementById("exportBtn")!.addEventListener("click", async () => {
  if (!ledgerState) return
  const md = buildMarkdown(ledgerState)
  await navigator.clipboard.writeText(md)

  const btn = document.getElementById("exportBtn")!
  const label = document.getElementById("exportLabel")!
  btn.classList.add("copied")
  label.textContent = "Copied!"
  setTimeout(() => {
    btn.classList.remove("copied")
    label.textContent = "Export MD"
  }, 2000)
})

// ─── Init ─────────────────────────────────────────────────────────────────────

refresh()

// Live refresh every 2s while popup is open
setInterval(refresh, 2000)

export {}
