// Content script for LeetCode pages (optimized, Manifest V2 compatible)
import "./content.css"

interface WidgetPosition {
  top?: string
  right?: string
  bottom?: string
  left?: string
}

let currentStreak = 0
let isEnabled = true
let widget: HTMLElement | null = null

async function init() {
  // Check if feature is enabled
  const settings = await browser.runtime.sendMessage({ type: "GET_SETTINGS" })
  isEnabled = settings.enabled
  if (!isEnabled) return

  // Fetch streak once per day
  const today = new Date().toISOString().split("T")[0]
  const lastFetch = (await browser.storage.local.get("lastFetch"))?.lastFetch
  if (lastFetch !== today) {
    await fetchAndUpdateStreak()
    await browser.storage.local.set({ lastFetch: today })
  }

  // Create floating streak indicator
  createWidget()

  // Setup fullscreen auto-hide
  setupFullscreenAutoHide()

  // Setup drag
  makeDraggable(widget!)

  // Observe DOM for streak changes (very lightweight)
  observeStreakElement()
}

// Fetch streak from background
async function fetchAndUpdateStreak() {
  try {
    const response = await browser.runtime.sendMessage({
      type: "GET_STREAK",
      platform: "leetcode",
    })
    if (response.success) currentStreak = response.data
    updateWidget(currentStreak)
  } catch (e) {
    console.error("Failed to fetch streak:", e)
    currentStreak = 0
    updateWidget(currentStreak)
  }
}

// Create the floating widget
function createWidget() {
  removeWidget()

  widget = document.createElement("div")
  widget.id = "streak-tracker-widget"
  widget.className = "streak-tracker-widget"

  // Load saved position
  browser.storage.local.get("widgetPosition").then((res) => {
    if (res.widgetPosition) {
      applyPosition(widget!, res.widgetPosition)
    } else {
      widget!.style.top = "20px"
      widget!.style.right = "20px"
    }
  })

  widget.innerHTML = `
    <div class="streak-content">
      <div class="streak-icon drag-handle">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M9.588 2.085a1 1 0 01.97.092c2.85 1.966 4.498 4.744 5.31 6.67l.854-.885a1 1 0 011.56.154c2.177 3.38 2.211 7.383.521 10.3C17.039 21.459 13.583 22 11.977 22c-1.569 0-4.905-.27-6.825-3.584-.832-1.435-1.27-3.053-1.125-4.704.146-1.66.876-3.284 2.264-4.721.86-.891 1.505-2.122 1.957-3.322.449-1.193.68-2.278.752-2.806a1 1 0 01.588-.778z" fill="url(#flame-gradient)"/>
          <defs>
            <linearGradient id="flame-gradient" x1="12" x2="12" y1="2" y2="22" gradientUnits="userSpaceOnUse">
              <stop stop-color="#FFA116"/>
              <stop offset="1" stop-color="#F9772E"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div class="streak-number" id="streak-number">0</div>
    </div>
  `

  document.body.appendChild(widget)
  updateWidget(currentStreak)
}

// Remove existing widget
function removeWidget() {
  const existing = document.getElementById("streak-tracker-widget")
  if (existing) existing.remove()
}

// Update widget display
function updateWidget(streak: number) {
  const numberEl = document.getElementById("streak-number")
  if (numberEl) numberEl.textContent = streak.toString()
}

// Apply stored position
function applyPosition(el: HTMLElement, pos: WidgetPosition) {
  el.style.top = pos.top ?? "auto"
  el.style.bottom = pos.bottom ?? "auto"
  el.style.left = pos.left ?? "auto"
  el.style.right = pos.right ?? "auto"
}

// Make the widget draggable to any corner
function makeDraggable(el: HTMLElement) {
  const handle = el.querySelector(".drag-handle") as HTMLElement
  if (!handle) return

  let offsetX = 0
  let offsetY = 0
  let dragging = false

  handle.style.cursor = "grab"

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return
    let x = e.clientX - offsetX
    let y = e.clientY - offsetY

    // constrain within viewport
    x = Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth))
    y = Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight))

    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.right = "auto"
    el.style.bottom = "auto"
  }

  const onMouseUp = () => {
    if (!dragging) return
    dragging = false
    handle.style.cursor = "grab"

    // Save position
    browser.storage.local.set({
      widgetPosition: {
        top: el.style.top,
        left: el.style.left,
      },
    })

    document.removeEventListener("mousemove", onMouseMove)
    document.removeEventListener("mouseup", onMouseUp)
  }

  handle.addEventListener("mousedown", (e) => {
    dragging = true
    handle.style.cursor = "grabbing"
    const rect = el.getBoundingClientRect()
    offsetX = e.clientX - rect.left
    offsetY = e.clientY - rect.top

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  })
}

// Auto-hide when fullscreen
function setupFullscreenAutoHide() {
  if (!widget) return

  const toggleVisibility = () => {
    const isFullscreen =
      !!document.fullscreenElement ||
      !!(document as any).webkitFullscreenElement ||
      !!(document as any).mozFullScreenElement ||
      !!(document as any).msFullscreenElement

    widget!.style.opacity = isFullscreen ? "0" : "1"
    widget!.style.pointerEvents = isFullscreen ? "none" : "auto"
  }

  document.addEventListener("fullscreenchange", toggleVisibility)
  document.addEventListener("webkitfullscreenchange", toggleVisibility)
  document.addEventListener("mozfullscreenchange", toggleVisibility)
  document.addEventListener("MSFullscreenChange", toggleVisibility)

  toggleVisibility()
}

// Lightweight DOM observation for streak changes
function observeStreakElement() {
  const streakEl = document.querySelector(
    'a[href*="daily-question"] span.text-brand-orange, a[href*="daily-question"] span.text-dark-brand-orange'
  )
  if (!streakEl) return

  const observer = new MutationObserver(() => {
    const newStreak = parseInt(streakEl.textContent?.trim() || "0", 10)
    if (!isNaN(newStreak) && newStreak !== currentStreak) {
      currentStreak = newStreak
      updateWidget(newStreak)
      browser.runtime.sendMessage({
        type: "UPDATE_STREAK",
        platform: "leetcode",
        streak: newStreak,
      })
    }
  })

  observer.observe(streakEl, { characterData: true, subtree: true })
}

init()
export {}
