import { createCollapsedState } from "@streak/components/collapsed-state"
import {
  createExpandedState,
  type Task,
} from "@streak/components/expanded-state"
import { createElement } from "@streak/utils/create-element"

export type ActivityData = {
  streak: number
  todayComplete: number
  todayTotal: number
  lastActivity: Date | null
  tasks: Array<Task>
}

/**
 * Creates the main streak overlay component
 */
export function createStreakOverlay(): HTMLElement {
  // Static data for proof of concept
  const data: ActivityData = {
    streak: 5,
    todayComplete: 2,
    todayTotal: 3,
    lastActivity: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
    tasks: [
      { id: "1", label: "Morning Applications (5-8)", done: true },
      { id: "2", label: "Midday Profile Update", done: true },
      { id: "3", label: "Evening Strategic Search", done: false },
    ],
  }

  // Main container
  const container = createElement("div", {
    className: "streak-overlay",
  })

  // Create collapsed state
  const collapsedState = createCollapsedState({
    streak: data.streak,
    todayComplete: data.todayComplete,
    todayTotal: data.todayTotal,
  })

  // Create expanded state
  const expandedState = createExpandedState(data)

  // Add hover behavior (for proof of concept)
  container.addEventListener("mouseenter", () => {
    collapsedState.classList.add("hidden")
    expandedState.classList.add("visible")
  })

  container.addEventListener("mouseleave", () => {
    collapsedState.classList.remove("hidden")
    expandedState.classList.remove("visible")
  })

  container.appendChild(collapsedState)
  container.appendChild(expandedState)

  return container
}
