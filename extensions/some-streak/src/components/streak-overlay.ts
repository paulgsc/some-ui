import type { CollapsedStateData } from "@streak/components/collapsed-state"
import { createCollapsedState } from "@streak/components/collapsed-state"
import type {
  Category,
  ExpandedStateData,
} from "@streak/components/expanded-state"
import { createExpandedState } from "@streak/components/expanded-state"
import { createElement } from "@streak/utils/create-element"

const DEFAULT_CATEGORIES: Array<Category> = [
  {
    id: "jobs",
    name: "Job Search",
    icon: "💼",
    color: "blue",
    tasks: [
      { id: "1", label: "Morning Applications (5-8)", done: true },
      { id: "2", label: "Midday Profile Update", done: true },
      { id: "3", label: "Evening Strategic Search", done: false },
    ],
  },
  {
    id: "leetcode",
    name: "LeetCode",
    icon: "💻",
    color: "orange",
    tasks: [
      { id: "1", label: "Easy Problem", done: false },
      { id: "2", label: "Medium Problem", done: false },
    ],
  },
  {
    id: "duolingo",
    name: "Duolingo",
    icon: "🦉",
    color: "green",
    tasks: [
      { id: "1", label: "Daily Lesson", done: true },
      { id: "2", label: "Practice Round", done: false },
    ],
  },
  {
    id: "typing",
    name: "Typing",
    icon: "⌨️",
    color: "purple",
    tasks: [{ id: "1", label: "10min Speed Practice", done: false }],
  },
  {
    id: "coding",
    name: "Coding",
    icon: "🚀",
    color: "pink",
    tasks: [
      { id: "1", label: "Personal Project Work", done: false },
      { id: "2", label: "Code Review/Learning", done: false },
    ],
  },
]

type OverlayState = {
  currentCategoryIndex: number
  categories: Array<Category>
  isExpanded: boolean
  lastActivity: Date | null
}

/**
 * Creates the main streak overlay component with full interactivity
 */
export function createStreakOverlay(): HTMLElement {
  // State
  const state: OverlayState = {
    currentCategoryIndex: 0,
    categories: DEFAULT_CATEGORIES,
    isExpanded: false,
    lastActivity: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
  }

  // Main container
  const container = createElement("div", {
    className: "streak-overlay",
  })

  let collapsedState: HTMLElement
  let expandedState: HTMLElement

  // Render functions
  const render = () => {
    const currentCategory = state.categories[state.currentCategoryIndex]
    const todayComplete = currentCategory.tasks.filter((t) => t.done).length
    const todayTotal = currentCategory.tasks.length
    const totalStreak = state.categories.reduce((sum, cat) => {
      const allDone = cat.tasks.every((t) => t.done)
      return sum + (allDone ? 1 : 0)
    }, 0)

    // Remove old elements
    if (collapsedState) collapsedState.remove()
    if (expandedState) expandedState.remove()

    // Create collapsed state
    const collapsedData: CollapsedStateData = {
      streak: totalStreak,
      todayComplete,
      todayTotal,
      categoryIcon: currentCategory.icon,
      categoryColor: currentCategory.color,
    }

    collapsedState = createCollapsedState(
      collapsedData,
      handlePrevCategory,
      handleNextCategory
    )

    // Create expanded state
    const expandedData: ExpandedStateData = {
      currentCategory,
      categories: state.categories,
      currentCategoryIndex: state.currentCategoryIndex,
      totalStreak,
      lastActivity: state.lastActivity,
    }

    expandedState = createExpandedState(
      expandedData,
      handlePrevCategory,
      handleNextCategory,
      handleCategorySwitch
    )

    // Apply expanded/collapsed state
    if (state.isExpanded) {
      collapsedState.classList.add("hidden")
      expandedState.classList.add("visible")
    }

    // Add click handler to collapsed state
    collapsedState.addEventListener("click", (e) => {
      // Don't toggle if clicking on nav buttons
      if ((e.target as HTMLElement).closest(".nav-button")) return
      toggleExpanded()
    })

    // Add click outside handler for expanded state
    document.addEventListener("click", handleClickOutside)

    container.appendChild(collapsedState)
    container.appendChild(expandedState)
  }

  // Event handlers
  const handlePrevCategory = () => {
    state.currentCategoryIndex =
      state.currentCategoryIndex === 0
        ? state.categories.length - 1
        : state.currentCategoryIndex - 1
    render()
  }

  const handleNextCategory = () => {
    state.currentCategoryIndex =
      (state.currentCategoryIndex + 1) % state.categories.length
    render()
  }

  const handleCategorySwitch = (index: number) => {
    state.currentCategoryIndex = index
    render()
  }

  const toggleExpanded = () => {
    state.isExpanded = !state.isExpanded
    if (state.isExpanded) {
      collapsedState.classList.add("hidden")
      expandedState.classList.add("visible")
    } else {
      collapsedState.classList.remove("hidden")
      expandedState.classList.remove("visible")
    }
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (!state.isExpanded) return
    if (!container.contains(e.target as Node)) {
      state.isExpanded = false
      collapsedState.classList.remove("hidden")
      expandedState.classList.remove("visible")
    }
  }

  // Setup dragging
  setupDraggable(container)

  // Setup fullscreen auto-hide
  setupFullscreenAutoHide(container)

  // Initial render
  render()

  return container
}

/**
 * Makes the overlay draggable
 */
function setupDraggable(container: HTMLElement) {
  let isDragging = false
  let offsetX = 0
  let offsetY = 0

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return

    let x = e.clientX - offsetX
    let y = e.clientY - offsetY

    // Constrain within viewport
    x = Math.max(0, Math.min(x, window.innerWidth - container.offsetWidth))
    y = Math.max(0, Math.min(y, window.innerHeight - container.offsetHeight))

    container.style.left = `${x}px`
    container.style.top = `${y}px`
    container.style.right = "auto"
    container.style.bottom = "auto"
  }

  const onMouseUp = () => {
    if (!isDragging) return
    isDragging = false
    container.classList.remove("dragging")

    document.removeEventListener("mousemove", onMouseMove)
    document.removeEventListener("mouseup", onMouseUp)
  }

  container.addEventListener("mousedown", (e) => {
    // Only allow dragging from the drag handle
    if (!(e.target as HTMLElement).closest(".drag-handle")) return

    isDragging = true
    container.classList.add("dragging")

    const rect = container.getBoundingClientRect()
    offsetX = e.clientX - rect.left
    offsetY = e.clientY - rect.top

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  })
}

/**
 * Auto-hide overlay when in fullscreen mode
 */
function setupFullscreenAutoHide(container: HTMLElement) {
  const toggleVisibility = () => {
    const isFullscreen =
      !!document.fullscreenElement ||
      !!(document as any).webkitFullscreenElement ||
      !!(document as any).mozFullScreenElement ||
      !!(document as any).msFullscreenElement

    if (isFullscreen) {
      container.classList.add("fullscreen-hidden")
    } else {
      container.classList.remove("fullscreen-hidden")
    }
  }

  document.addEventListener("fullscreenchange", toggleVisibility)
  document.addEventListener("webkitfullscreenchange", toggleVisibility)
  document.addEventListener("mozfullscreenchange", toggleVisibility)
  document.addEventListener("MSFullscreenChange", toggleVisibility)

  // Check initial state
  toggleVisibility()
}
