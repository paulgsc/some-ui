import type { CollapsedStateData } from "@streak/components/collapsed-state"
import { createCollapsedState } from "@streak/components/collapsed-state"
import type {
  Category,
  ExpandedStateData,
} from "@streak/components/expanded-state"
import { createExpandedState } from "@streak/components/expanded-state"
import { createElement } from "@streak/utils/create-element"

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
  let state: OverlayState = {
    currentCategoryIndex: 0,
    categories: [],
    isExpanded: false,
    lastActivity: null,
  }

  // Main container
  const container = createElement("div", {
    className: "streak-overlay",
  })

  let collapsedState: HTMLElement | null
  let expandedState: HTMLElement | null

  // Load initial data from background
  const loadData = async (): Promise<void> => {
    try {
      const response = await browser.runtime.sendMessage({ type: "GET_DATA" })
      if (response.success) {
        state = {
          currentCategoryIndex: response.data.currentCategoryIndex,
          categories: response.data.categories,
          isExpanded: false,
          lastActivity: response.data.lastActivity
            ? new Date(response.data.lastActivity)
            : null,
        }
        render()
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Content] Error loading data:", error)
    }
  }

  // Render functions
  const render = (): void => {
    if (state.categories.length === 0) return

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
      handleCategorySwitch,
      handleTaskToggle,
      handleResetAll
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

    container.appendChild(collapsedState)
    container.appendChild(expandedState)
  }

  // Event handlers
  const handlePrevCategory = async (): Promise<void> => {
    const newIndex =
      state.currentCategoryIndex === 0
        ? state.categories.length - 1
        : state.currentCategoryIndex - 1

    try {
      const response = await browser.runtime.sendMessage({
        type: "SWITCH_CATEGORY",
        index: newIndex,
      })
      if (response.success) {
        updateState(response.data)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Content] Error switching category:", error)
    }
  }

  const handleNextCategory = async (): Promise<void> => {
    const newIndex = (state.currentCategoryIndex + 1) % state.categories.length

    try {
      const response = await browser.runtime.sendMessage({
        type: "SWITCH_CATEGORY",
        index: newIndex,
      })
      if (response.success) {
        updateState(response.data)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Content] Error switching category:", error)
    }
  }

  const handleCategorySwitch = async (index: number): Promise<void> => {
    try {
      const response = await browser.runtime.sendMessage({
        type: "SWITCH_CATEGORY",
        index,
      })
      if (response.success) {
        updateState(response.data)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Content] Error switching category:", error)
    }
  }

  const handleTaskToggle = async (
    categoryId: string,
    taskId: string
  ): Promise<void> => {
    try {
      const response = await browser.runtime.sendMessage({
        type: "TOGGLE_TASK",
        categoryId,
        taskId,
      })
      if (response.success) {
        updateState(response.data)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Content] Error toggling task:", error)
    }
  }

  const handleResetAll = async (): Promise<void> => {
    try {
      const response = await browser.runtime.sendMessage({
        type: "RESET_ALL",
      })
      if (response.success) {
        updateState(response.data)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Content] Error resetting tasks:", error)
    }
  }

  const toggleExpanded = (): void => {
    state.isExpanded = !state.isExpanded
    if (state.isExpanded) {
      if (collapsedState) collapsedState.classList.add("hidden")
      if (expandedState) expandedState.classList.add("visible")
    } else {
      if (collapsedState) collapsedState.classList.remove("hidden")
      if (expandedState) expandedState.classList.remove("visible")
    }
  }

  const handleClickOutside = (e: MouseEvent): void => {
    if (!state.isExpanded) return
    if (!container.contains(e.target as Node)) {
      state.isExpanded = false
      if (collapsedState) collapsedState.classList.remove("hidden")
      if (expandedState) expandedState.classList.remove("visible")
    }
  }

  const updateState = (data: any): void => {
    state.currentCategoryIndex = data.currentCategoryIndex
    state.categories = data.categories
    state.lastActivity = data.lastActivity ? new Date(data.lastActivity) : null
    render()
  }

  // Listen for state updates from background
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "STATE_UPDATE") {
      updateState(message.data)
    }
  })

  // Add click outside listener
  document.addEventListener("click", handleClickOutside)

  // Setup dragging
  setupDraggable(container)

  // Setup fullscreen auto-hide
  setupFullscreenAutoHide(container)

  // Initial load
  loadData()

  return container
}

/**
 * Makes the overlay draggable
 */
function setupDraggable(container: HTMLElement): void {
  let isDragging = false
  let offsetX = 0
  let offsetY = 0

  const onMouseMove = (e: MouseEvent): void => {
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

  const onMouseUp = (): void => {
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
function setupFullscreenAutoHide(container: HTMLElement): void {
  const toggleVisibility = (): void => {
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
