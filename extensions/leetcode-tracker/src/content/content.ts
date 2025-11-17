import "./content.css"

let currentStreak = 0
let isEnabled = true

// Initialize
init()

async function init() {
  const settings = await browser.runtime.sendMessage({ type: "GET_SETTINGS" })
  isEnabled = settings.enabled
  if (!isEnabled) return

  createStreakIndicator()
  await startStreakMonitoring()
}

// Listen for messages from background
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "CHECK_TODAY") {
    startStreakMonitoring()
  }
})

// Fetch streak lazily (once per day)
async function startStreakMonitoring() {
  if (!window.location.hostname.includes("leetcode.com")) return

  const today = new Date().toISOString().slice(0, 10)
  const { lastCheckDate, lastStreak } = await browser.storage.local.get([
    "lastCheckDate",
    "lastStreak",
  ])

  if (lastCheckDate === today) {
    currentStreak = lastStreak ?? 0
    updateStreakIndicator(currentStreak)
    return
  }

  const streakElement = document.querySelector(
    'a[href*="daily-question"] span.text-brand-orange, a[href*="daily-question"] span.text-dark-brand-orange'
  )
  if (!streakElement) return

  const newStreak = parseInt(streakElement.textContent?.trim() || "0", 10)
  if (isNaN(newStreak)) return

  currentStreak = newStreak
  updateStreakIndicator(newStreak)

  browser.storage.local.set({ lastCheckDate: today, lastStreak: newStreak })
  updateStreakInDB(newStreak)
}

async function updateStreakInDB(streak: number) {
  try {
    await browser.runtime.sendMessage({
      type: "UPDATE_STREAK",
      platform: "leetcode",
      streak,
    })
  } catch (err) {
    console.error(err)
  }
}

// Create floating widget
function createStreakIndicator() {
  removeStreakIndicator()
  const container = document.createElement("div")
  container.id = "streak-tracker-widget"
  container.className = "streak-tracker-widget"

  container.innerHTML = `
    <div class="streak-content">
      <div class="streak-icon drag-handle">🔥</div>
      <div class="streak-number" id="streak-number">0</div>
    </div>
  `

  document.body.appendChild(container)
  makeDraggable(container)
  updateStreakIndicator(currentStreak)
}

function updateStreakIndicator(streak: number) {
  const numberEl = document.getElementById("streak-number")
  if (numberEl) numberEl.textContent = streak.toString()
}

function removeStreakIndicator() {
  const existing = document.getElementById("streak-tracker-widget")
  if (existing) existing.remove()
}

// Drag support
function makeDraggable(widget: HTMLElement) {
  const dragHandle = widget.querySelector(".drag-handle") as HTMLElement
  if (!dragHandle) return

  dragHandle.style.cursor = "grab"

  let isDragging = false
  let startX = 0
  let startY = 0
  let origX = 0
  let origY = 0

  // Start drag
  const startDrag = (e: MouseEvent | TouchEvent) => {
    isDragging = true
    widget.classList.add("dragging") // ✅ disable CSS transitions
    dragHandle.style.cursor = "grabbing"
    dragHandle.style.cursor = "grabbing"

    const rect = widget.getBoundingClientRect()

    origX = rect.left
    origY = rect.top

    if ("touches" in e) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    } else {
      startX = e.clientX
      startY = e.clientY
    }

    // Fix position for dragging
    widget.style.top = `${origY}px`
    widget.style.left = `${origX}px`
    widget.style.right = "auto"
    widget.style.bottom = "auto"

    document.addEventListener("mousemove", onDrag)
    document.addEventListener("touchmove", onDrag, { passive: false })
    document.addEventListener("mouseup", stopDrag)
    document.addEventListener("touchend", stopDrag)

    e.preventDefault()
  }

  // During drag
  const onDrag = (e: MouseEvent | TouchEvent) => {
    if (!isDragging) return

    let clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    let clientY = "touches" in e ? e.touches[0].clientY : e.clientY

    let newX = origX + (clientX - startX)
    let newY = origY + (clientY - startY)

    // Keep within viewport
    newX = Math.max(0, Math.min(newX, window.innerWidth - widget.offsetWidth))
    newY = Math.max(0, Math.min(newY, window.innerHeight - widget.offsetHeight))

    widget.style.left = `${newX}px`
    widget.style.top = `${newY}px`

    e.preventDefault()
  }

  // Stop drag & snap to corner
  const stopDrag = () => {
    if (!isDragging) return
    isDragging = false
    widget.classList.remove("dragging") // ✅ restore transitions
    dragHandle.style.cursor = "grab"
    dragHandle.style.cursor = "grab"

    document.removeEventListener("mousemove", onDrag)
    document.removeEventListener("touchmove", onDrag)
    document.removeEventListener("mouseup", stopDrag)
    document.removeEventListener("touchend", stopDrag)

    snapToCorner(widget)
  }

  // Snap to nearest corner
  const snapToCorner = (widget: HTMLElement) => {
    const rect = widget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const margin = 20
    const isLeft = centerX < window.innerWidth / 2
    const isTop = centerY < window.innerHeight / 2

    widget.style.top = isTop
      ? `${margin}px`
      : `${window.innerHeight - rect.height - margin}px`
    widget.style.left = isLeft
      ? `${margin}px`
      : `${window.innerWidth - rect.width - margin}px`

    // Persist position
    browser.storage.local.set({
      widgetPosition: {
        top: widget.style.top,
        left: widget.style.left,
      },
    })
  }

  // Event listeners
  dragHandle.addEventListener("mousedown", startDrag)
  dragHandle.addEventListener("touchstart", startDrag, { passive: false })

  // Load saved position
  browser.storage.local.get(["widgetPosition"]).then((res) => {
    if (res.widgetPosition) {
      widget.style.top = res.widgetPosition.top
      widget.style.left = res.widgetPosition.left
      widget.style.right = "auto"
      widget.style.bottom = "auto"
    }
  })
}

export {}
