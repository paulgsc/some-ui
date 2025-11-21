import { createElement, createSVGElement } from "@streak/utils/create-element"

export type Task = {
  id: string
  label: string
  done: boolean
}

export type ExpandedStateData = {
  streak: number
  todayComplete: number
  todayTotal: number
  tasks: Array<Task>
  lastActivity: Date | null
}

/**
 * Creates the expanded state UI component
 */
export function createExpandedState(data: ExpandedStateData): HTMLElement {
  const container = createElement("div", {
    className: "streak-expanded",
  })

  const inner = createElement("div", {
    className: "streak-expanded-inner",
  })

  // Header
  const header = createHeader(data.streak)

  // Progress section
  const progressSection = createProgressSection(
    data.todayComplete,
    data.todayTotal
  )

  // Task list
  const taskList = createTaskList(data.tasks)

  // Last activity
  const lastActivity = createLastActivity(data.lastActivity)

  // Reset button
  const resetButton = createResetButton()

  inner.appendChild(header)
  inner.appendChild(progressSection)
  inner.appendChild(taskList)
  inner.appendChild(lastActivity)
  inner.appendChild(resetButton)
  container.appendChild(inner)

  return container
}

/**
 * Creates the header with flame icon and title
 */
function createHeader(streak: number): HTMLElement {
  const header = createElement("div", {
    className: "streak-header",
  })

  const headerContent = createElement("div", {
    className: "streak-header-content",
  })

  // Flame icon
  const flameContainer = createElement("div", {
    className: `flame-icon large ${streak > 0 ? "active" : "inactive"}`,
  })

  const svg = createSVGElement("svg", {
    width: "28",
    height: "28",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })

  const path = createSVGElement("path", {
    d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  })

  svg.appendChild(path)
  flameContainer.appendChild(svg)

  if (streak > 0) {
    const badge = createElement("span", {
      className: "flame-badge large",
      children: [String(streak)],
    })
    flameContainer.appendChild(badge)
  }

  // Title and subtitle
  const textContainer = createElement("div")
  const title = createElement("h3", {
    className: "streak-title",
    children: [`${streak} Day Streak`],
  })
  const subtitle = createElement("p", {
    className: "streak-subtitle",
    children: ["Keep it going!"],
  })

  textContainer.appendChild(title)
  textContainer.appendChild(subtitle)

  headerContent.appendChild(flameContainer)
  headerContent.appendChild(textContainer)
  header.appendChild(headerContent)

  return header
}

/**
 * Creates the progress bar section
 */
function createProgressSection(complete: number, total: number): HTMLElement {
  const section = createElement("div", {
    className: "progress-section",
  })

  const progressPercent = (complete / total) * 100

  // Label
  const label = createElement("div", {
    className: "progress-label",
  })

  const labelText = createElement("span", {
    className: "progress-label-text",
    children: ["Today's Progress"],
  })

  const labelCount = createElement("span", {
    className: "progress-label-count",
    children: [`${complete}/${total}`],
  })

  label.appendChild(labelText)
  label.appendChild(labelCount)

  // Progress bar
  const barContainer = createElement("div", {
    className: "progress-bar-container",
  })

  const barFill = createElement("div", {
    className: `progress-bar-fill ${progressPercent === 100 ? "complete" : "primary"}`,
    styles: {
      width: `${progressPercent}%`,
    },
  })

  barContainer.appendChild(barFill)

  section.appendChild(label)
  section.appendChild(barContainer)

  return section
}

/**
 * Creates the task list
 */
function createTaskList(tasks: Array<Task>): HTMLElement {
  const container = createElement("div", {
    className: "task-list",
  })

  tasks.forEach((task) => {
    const taskItem = createTaskItem(task)
    container.appendChild(taskItem)
  })

  return container
}

/**
 * Creates a single task item
 */
function createTaskItem(task: Task): HTMLElement {
  const button = createElement("button", {
    className: "task-item",
  })

  // Icon
  const iconContainer = createElement("div", {
    className: `task-icon ${task.done ? "done" : "undone"}`,
  })

  const svg = createSVGElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })

  if (task.done) {
    // CheckCircle2 icon
    const path1 = createSVGElement("path", {
      d: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z",
    })
    const path2 = createSVGElement("path", {
      d: "m9 12 2 2 4-4",
    })
    svg.appendChild(path1)
    svg.appendChild(path2)
  } else {
    // Circle icon
    const circle = createSVGElement("circle", {
      cx: "12",
      cy: "12",
      r: "10",
    })
    svg.appendChild(circle)
  }

  iconContainer.appendChild(svg)

  // Text
  const text = createElement("span", {
    className: `task-text ${task.done ? "done" : ""}`,
    children: [task.label],
  })

  button.appendChild(iconContainer)
  button.appendChild(text)

  return button
}

/**
 * Creates the last activity section
 */
function createLastActivity(date: Date | null): HTMLElement {
  const container = createElement("div", {
    className: "last-activity",
  })

  // Clock icon
  const iconContainer = createElement("div", {
    className: "last-activity-icon",
  })

  const svg = createSVGElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })

  const circle = createSVGElement("circle", {
    cx: "12",
    cy: "12",
    r: "10",
  })
  const path = createSVGElement("path", {
    d: "M12 6v6l4 2",
  })

  svg.appendChild(circle)
  svg.appendChild(path)
  iconContainer.appendChild(svg)

  // Text
  const text = createElement("span", {
    className: "last-activity-text",
    children: [`Last activity: ${formatLastActivity(date)}`],
  })

  container.appendChild(iconContainer)
  container.appendChild(text)

  return container
}

/**
 * Creates the reset button
 */
function createResetButton(): HTMLElement {
  return createElement("button", {
    className: "reset-button",
    children: ["Reset Today (Demo)"],
  })
}

/**
 * Formats the last activity date
 */
function formatLastActivity(date: Date | null): string {
  if (!date) return "No activity yet"
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString()
}
