// Content script for all pages (Manifest V2 compatible)
import "./content.css"

let currentStreak = 0
let isEnabled = true
let observer: MutationObserver | null = null
let fullscreenObserver: MutationObserver | null = null
let isDragging = false
let dragOffset = { x: 0, y: 0 }

// Initialize
init()

async function init() {
  // Check if feature is enabled
  const settings = await browser.runtime.sendMessage({ type: "GET_SETTINGS" })
  isEnabled = settings.enabled

  if (!isEnabled) return

  // Fetch current streak from DB
  await fetchAndDisplayStreak()

  // Only monitor LeetCode pages for streak updates
  if (window.location.hostname.includes("leetcode.com")) {
    startStreakMonitoring()
  }

  // Create floating streak indicator on all pages
  createStreakIndicator()

  // Monitor fullscreen changes
  startFullscreenMonitoring()
}

// Listen for messages from background
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "REFRESH_STREAK") {
    fetchAndDisplayStreak()
  }

  if (message.type === "TOGGLE_FEATURE") {
    isEnabled = message.enabled
    if (isEnabled) {
      init()
    } else {
      removeStreakIndicator()
      if (observer) observer.disconnect()
      if (fullscreenObserver) fullscreenObserver.disconnect()
    }
  }
})

async function fetchAndDisplayStreak() {
  try {
    const response = await browser.runtime.sendMessage({
      type: "GET_STREAK",
      platform: "leetcode",
    })

    if (response.success) {
      currentStreak = response.data
      updateStreakIndicator(currentStreak)
    }
  } catch (error) {
    console.error("Failed to fetch streak:", error)
    // Default to 0 if fetch fails
    currentStreak = 0
    updateStreakIndicator(currentStreak)
  }
}

function startStreakMonitoring() {
  // Only run on LeetCode pages
  if (!window.location.hostname.includes("leetcode.com")) return

  // Look for the daily question streak indicator
  const checkStreak = () => {
    const streakElement = document.querySelector(
      'a[href*="daily-question"] span.text-brand-orange, a[href*="daily-question"] span.text-dark-brand-orange'
    )

    if (streakElement) {
      const streakText = streakElement.textContent?.trim()
      const newStreak = parseInt(streakText || "0", 10)

      if (!isNaN(newStreak) && newStreak !== currentStreak) {
        // Streak changed, update DB
        updateStreakInDB(newStreak)
        currentStreak = newStreak
        updateStreakIndicator(newStreak)
      }
    }
  }

  // Initial check
  checkStreak()

  // Monitor DOM changes
  observer = new MutationObserver(() => {
    checkStreak()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  // Also check periodically (backup)
  setInterval(checkStreak, 5000)
}

async function updateStreakInDB(streak: number) {
  try {
    await browser.runtime.sendMessage({
      type: "UPDATE_STREAK",
      platform: "leetcode",
      streak,
    })
  } catch (error) {
    console.error("Failed to update streak:", error)
  }
}

function startFullscreenMonitoring() {
  const widget = document.getElementById("streak-tracker-widget")
  if (!widget) return

  const handleFullscreenChange = () => {
    const isFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    )

    if (isFullscreen) {
      widget.classList.add("fullscreen-hidden")
    } else {
      widget.classList.remove("fullscreen-hidden")
    }
  }

  // Listen to fullscreen events
  document.addEventListener("fullscreenchange", handleFullscreenChange)
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange)
  document.addEventListener("mozfullscreenchange", handleFullscreenChange)
  document.addEventListener("MSFullscreenChange", handleFullscreenChange)

  // Also monitor for video elements going fullscreen
  fullscreenObserver = new MutationObserver(handleFullscreenChange)
  fullscreenObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
    subtree: true,
  })
}

function createStreakIndicator() {
  // Remove existing indicator if present
  removeStreakIndicator()

  const container = document.createElement("div")
  container.id = "streak-tracker-widget"
  container.className = "streak-tracker-widget"

  // Load saved position or use default
  browser.storage.local.get(["widgetPosition"]).then((result) => {
    if (result.widgetPosition) {
      container.style.top = result.widgetPosition.top
      container.style.right = result.widgetPosition.right
      container.style.bottom = result.widgetPosition.bottom
      container.style.left = result.widgetPosition.left
    }
  })

  container.innerHTML = `
    <div class="streak-content">
      <div class="streak-icon drag-handle">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
      <div class="streak-tooltip">
        <div class="tooltip-title">LeetCode Streak</div>
        <div class="tooltip-days" id="tooltip-days">0 days</div>
        <div class="tooltip-message" id="tooltip-message">Keep going!</div>
      </div>
    </div>
  `

  document.body.appendChild(container)
  updateStreakIndicator(currentStreak)
  makeDraggable(container)
}

function makeDraggable(widget: HTMLElement) {
  const dragHandle = widget.querySelector(".drag-handle") as HTMLElement
  if (!dragHandle) return

  dragHandle.style.cursor = "grab"

  dragHandle.addEventListener("mousedown", startDrag)
  dragHandle.addEventListener("touchstart", startDrag, { passive: false })

  function startDrag(e: MouseEvent | TouchEvent) {
    isDragging = true
    dragHandle.style.cursor = "grabbing"

    const rect = widget.getBoundingClientRect()
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY

    dragOffset.x = clientX - rect.left
    dragOffset.y = clientY - rect.top

    // Remove position constraints while dragging
    widget.style.top = `${rect.top}px`
    widget.style.left = `${rect.left}px`
    widget.style.right = "auto"
    widget.style.bottom = "auto"

    document.addEventListener("mousemove", onDrag)
    document.addEventListener("touchmove", onDrag, { passive: false })
    document.addEventListener("mouseup", stopDrag)
    document.addEventListener("touchend", stopDrag)

    e.preventDefault()
  }

  function onDrag(e: MouseEvent | TouchEvent) {
    if (!isDragging) return

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY

    let newX = clientX - dragOffset.x
    let newY = clientY - dragOffset.y

    // Keep within viewport bounds
    const maxX = window.innerWidth - widget.offsetWidth
    const maxY = window.innerHeight - widget.offsetHeight

    newX = Math.max(0, Math.min(newX, maxX))
    newY = Math.max(0, Math.min(newY, maxY))

    widget.style.left = `${newX}px`
    widget.style.top = `${newY}px`

    e.preventDefault()
  }

  function stopDrag() {
    if (!isDragging) return

    isDragging = false
    dragHandle.style.cursor = "grab"

    document.removeEventListener("mousemove", onDrag)
    document.removeEventListener("touchmove", onDrag)
    document.removeEventListener("mouseup", stopDrag)
    document.removeEventListener("touchend", stopDrag)

    // Snap to nearest corner
    snapToCorner(widget)
  }
}

function snapToCorner(widget: HTMLElement) {
  const rect = widget.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const isLeft = centerX < window.innerWidth / 2
  const isTop = centerY < window.innerHeight / 2

  // Reset all position properties
  widget.style.top = "auto"
  widget.style.right = "auto"
  widget.style.bottom = "auto"
  widget.style.left = "auto"

  // Set position based on corner
  const margin = "20px"
  const position = {
    top: isTop ? margin : "auto",
    right: isLeft ? "auto" : margin,
    bottom: isTop ? "auto" : margin,
    left: isLeft ? margin : "auto",
  }

  widget.style.top = position.top
  widget.style.right = position.right
  widget.style.bottom = position.bottom
  widget.style.left = position.left

  // Save position
  browser.storage.local.set({ widgetPosition: position })
}

function updateStreakIndicator(streak: number) {
  const numberEl = document.getElementById("streak-number")
  const daysEl = document.getElementById("tooltip-days")
  const messageEl = document.getElementById("tooltip-message")
  const widget = document.getElementById("streak-tracker-widget")

  if (numberEl) numberEl.textContent = streak.toString()
  if (daysEl) daysEl.textContent = `${streak} ${streak === 1 ? "day" : "days"}`

  // Update message based on streak
  if (messageEl) {
    if (streak === 0) {
      messageEl.textContent = "⚠️ Start your streak today!"
      messageEl.style.color = "#ff6b6b"
    } else if (streak < 7) {
      messageEl.textContent = "Keep it up! 🔥"
      messageEl.style.color = "#ffa116"
    } else if (streak < 30) {
      messageEl.textContent = "Great momentum! 💪"
      messageEl.style.color = "#51cf66"
    } else {
      messageEl.textContent = "Legendary streak! 🏆"
      messageEl.style.color = "#845ef7"
    }
  }

  // Add alert state for zero streak
  if (widget) {
    if (streak === 0) {
      widget.classList.add("streak-zero")
    } else {
      widget.classList.remove("streak-zero")
    }
  }
}

function removeStreakIndicator() {
  const existing = document.getElementById("streak-tracker-widget")
  if (existing) existing.remove()
}

export {}
