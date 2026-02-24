import type { TabRecord } from "@tab/types"
import { BADGE_COLORS, formatMs, formatMsShort, getBadgeTier } from "@tab/types"
import browser from "webextension-polyfill"

// ─── Constants ────────────────────────────────────────────────────────────────

const HUD_ID = "__tabledger_hud__"
const TOAST_ID = "__tabledger_toast__"
const POLL_INTERVAL = 1000
const FLASH_DURATION = 3000

// Thresholds in ms that trigger a toast (each fires once per page load)
const TOAST_THRESHOLDS = [15 * 60 * 1000, 45 * 60 * 1000, 90 * 60 * 1000]
const firedThresholds = new Set<number>()

let currentTabId: number | null = null
// let lastTotalMs = 0
let flashTimeout: ReturnType<typeof setTimeout> | null = null
let hudEl: HTMLElement | null = null
let timerEl: HTMLElement | null = null
let dotEl: HTMLElement | null = null
let sessionEl: HTMLElement | null = null
let neglectEl: HTMLElement | null = null
let isFlashing = false
let userIsActive = false
let idleTimeout: ReturnType<typeof setTimeout> | null = null

// ─── Styles ───────────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById("__tabledger_styles__")) return
  const style = document.createElement("style")
  style.id = "__tabledger_styles__"
  style.textContent = `
    #${HUD_ID} {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 2147483647;
      pointer-events: none;
      user-select: none;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
      transition: opacity 0.4s ease;
    }

    #${HUD_ID}.idle {
      opacity: 0.18;
    }

    #${HUD_ID}.active {
      opacity: 0.82;
    }

    .__tl_chip {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      padding: 7px 11px 7px 10px;
      background: rgba(10, 10, 14, 0.72);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.07);
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
    }

    .__tl_row {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .__tl_dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background-color 0.8s ease;
    }

    .__tl_dot.pulsing {
      animation: __tl_pulse 2s ease-in-out infinite;
    }

    @keyframes __tl_pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.75); }
    }

    .__tl_timer {
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: rgba(255,255,255,0.90);
      transition: color 0.8s ease;
      min-width: 52px;
      text-align: right;
    }

    .__tl_session {
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.06em;
      color: rgba(255,255,255,0.38);
      text-align: right;
      transition: opacity 0.3s ease, color 0.3s ease;
    }

    .__tl_session.flash {
      color: rgba(255,255,255,0.75);
      font-weight: 600;
    }

    .__tl_neglect {
      font-size: 9.5px;
      font-weight: 500;
      letter-spacing: 0.05em;
      color: #f59e0b;
      text-align: right;
      animation: __tl_blink 2.5s ease-in-out infinite;
    }

    @keyframes __tl_blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ── Toast ── */
    #${TOAST_ID} {
      position: fixed;
      bottom: 20px;
      left: 20px;
      z-index: 2147483647;
      pointer-events: none;
      user-select: none;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
      transform: translateY(12px);
      opacity: 0;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
    }

    #${TOAST_ID}.visible {
      transform: translateY(0);
      opacity: 1;
    }

    .__tl_toast_inner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 14px;
      background: rgba(10, 10, 14, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 8px;
      border-left: 3px solid transparent;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }

    .__tl_toast_icon {
      font-size: 14px;
    }

    .__tl_toast_text {
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: rgba(255,255,255,0.88);
    }
  `
  document.documentElement.appendChild(style)
}

// ─── HUD creation ─────────────────────────────────────────────────────────────

function createHUD(): void {
  if (document.getElementById(HUD_ID)) return

  hudEl = document.createElement("div")
  hudEl.id = HUD_ID
  hudEl.className = "active"

  const chip = document.createElement("div")
  chip.className = "__tl_chip"

  // Main row: dot + timer
  const row = document.createElement("div")
  row.className = "__tl_row"

  dotEl = document.createElement("div")
  dotEl.className = "__tl_dot pulsing"
  dotEl.style.backgroundColor = BADGE_COLORS.green

  timerEl = document.createElement("div")
  timerEl.className = "__tl_timer"
  timerEl.textContent = "00:00"

  row.appendChild(dotEl)
  row.appendChild(timerEl)

  // Session sub-row
  sessionEl = document.createElement("div")
  sessionEl.className = "__tl_session"
  sessionEl.textContent = ""

  // Neglect sub-row
  neglectEl = document.createElement("div")
  neglectEl.className = "__tl_neglect"
  neglectEl.style.display = "none"

  chip.appendChild(row)
  chip.appendChild(sessionEl)
  chip.appendChild(neglectEl)
  hudEl.appendChild(chip)

  document.documentElement.appendChild(hudEl)
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastEl: HTMLElement | null = null
let toastHideTimeout: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, color: string): void {
  if (!toastEl) {
    toastEl = document.createElement("div")
    toastEl.id = TOAST_ID
    const inner = document.createElement("div")
    inner.className = "__tl_toast_inner"
    const icon = document.createElement("span")
    icon.className = "__tl_toast_icon"
    icon.textContent = "⏱"
    const textEl = document.createElement("span")
    textEl.className = "__tl_toast_text"
    inner.appendChild(icon)
    inner.appendChild(textEl)
    toastEl.appendChild(inner)
    document.documentElement.appendChild(toastEl)
  }

  const inner = toastEl.querySelector<HTMLElement>(".__tl_toast_inner")!
  const textEl = toastEl.querySelector<HTMLElement>(".__tl_toast_text")!
  textEl.textContent = text
  inner.style.borderLeftColor = color

  if (toastHideTimeout) clearTimeout(toastHideTimeout)
  toastEl.classList.add("visible")

  toastHideTimeout = setTimeout(() => {
    toastEl?.classList.remove("visible")
  }, 4000)
}

// ─── HUD update ───────────────────────────────────────────────────────────────

function updateHUD(
  record: TabRecord,
  now: number,
  neglect: string | null
): void {
  if (!timerEl || !dotEl || !sessionEl || !neglectEl) return

  const elapsed =
    record.isActive && record.lastActivated > 0
      ? record.totalMs + (now - record.lastActivated)
      : record.totalMs

  const sessionElapsed =
    record.isActive && record.lastActivated > 0
      ? record.sessionMs + (now - record.lastActivated)
      : record.sessionMs

  const tier = getBadgeTier(elapsed)
  const color = BADGE_COLORS[tier]

  // Update timer
  timerEl.textContent = formatMs(elapsed)
  timerEl.style.color =
    tier === "violet"
      ? "#c084fc"
      : tier === "red"
        ? "#fca5a5"
        : "rgba(255,255,255,0.90)"

  // Update dot
  dotEl.style.backgroundColor = color

  // Check thresholds for toast
  for (const threshold of TOAST_THRESHOLDS) {
    if (elapsed >= threshold && !firedThresholds.has(threshold)) {
      firedThresholds.add(threshold)
      showToast(`${formatMsShort(threshold)} on this tab`, color)
    }
  }

  // Session label — shows "today: Xh Ym" flash on first focus, then fades to session time
  if (!isFlashing) {
    if (sessionElapsed > 60000) {
      sessionEl.textContent = `session ${formatMsShort(sessionElapsed)}`
    } else {
      sessionEl.textContent = ""
    }
  }

  // Neglect label
  if (neglect) {
    neglectEl.style.display = "block"
    neglectEl.textContent = `↑ ${neglect} neglected`
  } else {
    neglectEl.style.display = "none"
  }

  // lastTotalMs = elapsed
}

function flashSessionTotal(record: TabRecord, now: number): void {
  if (!sessionEl) return
  const sessionElapsed =
    record.isActive && record.lastActivated > 0
      ? record.sessionMs + (now - record.lastActivated)
      : record.sessionMs

  isFlashing = true
  sessionEl.className = "__tl_session flash"
  sessionEl.textContent = `today  ${formatMsShort(sessionElapsed)}`

  if (flashTimeout) clearTimeout(flashTimeout)
  flashTimeout = setTimeout(() => {
    isFlashing = false
    if (sessionEl) sessionEl.className = "__tl_session"
  }, FLASH_DURATION)
}

// ─── Idle detection ───────────────────────────────────────────────────────────

function resetIdleTimer(): void {
  if (!hudEl) return
  userIsActive = true
  console.log("you sir is active", userIsActive)
  hudEl.className = "idle" // fade while user is actively doing things
  if (idleTimeout) clearTimeout(idleTimeout)
  idleTimeout = setTimeout(() => {
    userIsActive = false
    if (hudEl) hudEl.className = "active"
  }, 3000)
}

function setupIdleDetection(): void {
  const events = ["mousedown", "scroll", "keydown"]
  for (const evt of events) {
    document.addEventListener(evt, resetIdleTimer, { passive: true })
  }
}

// ─── Polling ──────────────────────────────────────────────────────────────────

let isFirstPoll = true

async function poll(): Promise<void> {
  try {
    // Get own tab ID if we don't have it
    if (currentTabId === null) {
      // We can't directly get our own tabId in content scripts in MV2,
      // so we send a message and background responds with it
      const resp = await browser.runtime.sendMessage({ type: "GET_OWN_TAB_ID" })
      if (resp?.tabId) currentTabId = resp.tabId
      if (!currentTabId) return
    }

    const resp = await browser.runtime.sendMessage({
      type: "GET_TAB_STATE",
      tabId: currentTabId,
    })

    if (!resp || !resp.record) return

    const { record, now, neglect } = resp

    if (isFirstPoll) {
      isFirstPoll = false
      flashSessionTotal(record, now)
    }

    updateHUD(record, now, neglect ?? null)
  } catch {
    // Extension context may be invalidated
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  // Don't inject into extension pages or about: pages
  if (
    location.protocol === "chrome-extension:" ||
    location.protocol === "moz-extension:" ||
    location.protocol === "about:"
  ) {
    return
  }

  injectStyles()
  createHUD()
  setupIdleDetection()

  setInterval(poll, POLL_INTERVAL)
  poll()
}

// Wait for DOM to be at least partially ready
if (document.documentElement) {
  init()
} else {
  document.addEventListener("DOMContentLoaded", init)
}

export {}
