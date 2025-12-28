import { createElement, createSVGElement } from "@streak/utils/create-element"

export type Task = {
  id: string
  label: string
  done: boolean
}

export type Category = {
  id: string
  name: string
  icon: string
  color: string
  tasks: Array<Task>
}

export type ExpandedStateData = {
  currentCategory: Category
  categories: Array<Category>
  currentCategoryIndex: number
  totalStreak: number
  lastActivity: Date | null
}

/**
 * Creates the expanded state UI component
 */
export function createExpandedState(
  data: ExpandedStateData,
  onPrevCategory: () => void,
  onNextCategory: () => void,
  onCategorySwitch: (index: number) => void,
  onTaskToggle: (categoryId: string, taskId: string) => void,
  onResetAll: () => void
): HTMLElement {
  const container = createElement("div", {
    className: "streak-expanded",
  })

  const inner = createElement("div", {
    className: `streak-expanded-inner color-${data.currentCategory.color}`,
  })

  const todayComplete = data.currentCategory.tasks.filter((t) => t.done).length
  const todayTotal = data.currentCategory.tasks.length

  // Header
  const header = createHeader(
    data.currentCategory,
    data.totalStreak,
    data.categories.length,
    onPrevCategory,
    onNextCategory
  )

  // Progress section
  const progressSection = createProgressSection(
    todayComplete,
    todayTotal,
    data.currentCategory.color
  )

  // Task list with click handlers
  const taskList = createTaskList(
    data.currentCategory.tasks,
    data.currentCategory.id,
    onTaskToggle
  )

  // Last activity
  const lastActivity = createLastActivity(data.lastActivity)

  // Category indicators
  const indicators = createCategoryIndicators(
    data.categories,
    data.currentCategoryIndex,
    onCategorySwitch
  )

  // Reset button
  const resetButton = createResetButton(onResetAll)

  inner.appendChild(header)
  inner.appendChild(progressSection)
  inner.appendChild(taskList)
  inner.appendChild(lastActivity)
  inner.appendChild(indicators)
  inner.appendChild(resetButton)
  container.appendChild(inner)

  return container
}

/**
 * Creates the header with category icon, title, and navigation
 */
function createHeader(
  category: Category,
  totalStreak: number,
  totalCategories: number,
  onPrev: () => void,
  onNext: () => void
): HTMLElement {
  const header = createElement("div", {
    className: "streak-header",
  })

  const headerContent = createElement("div", {
    className: "streak-header-content",
  })

  // Icon container
  const iconContainer = createElement("div", {
    className: `category-icon-container color-${category.color}`,
  })

  const icon = createElement("div", {
    className: "category-icon large",
    children: [category.icon],
  })

  iconContainer.appendChild(icon)

  // Title and subtitle
  const textContainer = createElement("div")
  const title = createElement("h3", {
    className: "streak-title",
    children: [category.name],
  })
  const subtitle = createElement("p", {
    className: "streak-subtitle",
    children: [`${totalStreak}/${totalCategories} categories complete`],
  })

  textContainer.appendChild(title)
  textContainer.appendChild(subtitle)

  headerContent.appendChild(iconContainer)
  headerContent.appendChild(textContainer)

  // Navigation buttons
  const navButtons = createElement("div", {
    className: "nav-buttons",
  })

  // Previous button
  const prevButton = createElement("button", {
    className: "nav-button large",
    attributes: {
      "aria-label": "Previous category",
    },
  })

  const prevIcon = createSVGElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })
  const prevPath = createSVGElement("path", {
    d: "m15 18-6-6 6-6",
  })
  prevIcon.appendChild(prevPath)
  prevButton.appendChild(prevIcon)

  prevButton.addEventListener("click", (e) => {
    e.stopPropagation()
    onPrev()
  })

  // Next button
  const nextButton = createElement("button", {
    className: "nav-button large",
    attributes: {
      "aria-label": "Next category",
    },
  })

  const nextIcon = createSVGElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })
  const nextPath = createSVGElement("path", {
    d: "m9 18 6-6-6-6",
  })
  nextIcon.appendChild(nextPath)
  nextButton.appendChild(nextIcon)

  nextButton.addEventListener("click", (e) => {
    e.stopPropagation()
    onNext()
  })

  navButtons.appendChild(prevButton)
  navButtons.appendChild(nextButton)

  header.appendChild(headerContent)
  header.appendChild(navButtons)

  return header
}

/**
 * Creates the progress bar section
 */
function createProgressSection(
  complete: number,
  total: number,
  color: string
): HTMLElement {
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
    className: `progress-bar-fill ${
      progressPercent === 100 ? "complete" : `color-${color}`
    }`,
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
 * Creates the task list with click handlers
 */
function createTaskList(
  tasks: Array<Task>,
  categoryId: string,
  onToggle: (categoryId: string, taskId: string) => void
): HTMLElement {
  const container = createElement("div", {
    className: "task-list",
  })

  tasks.forEach((task) => {
    const taskItem = createTaskItem(task, categoryId, onToggle)
    container.appendChild(taskItem)
  })

  return container
}

/**
 * Creates a single task item with click handler
 */
function createTaskItem(
  task: Task,
  categoryId: string,
  onToggle: (categoryId: string, taskId: string) => void
): HTMLElement {
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

  // Add click handler
  button.addEventListener("click", (e) => {
    e.stopPropagation()
    onToggle(categoryId, task.id)
  })

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
 * Creates category indicator dots
 */
function createCategoryIndicators(
  categories: Array<Category>,
  currentIndex: number,
  onSwitch: (index: number) => void
): HTMLElement {
  const container = createElement("div", {
    className: "category-indicators",
  })

  categories.forEach((cat, idx) => {
    const dot = createElement("button", {
      className: `category-dot ${idx === currentIndex ? "active" : "inactive"}`,
      attributes: {
        "aria-label": `Switch to ${cat.name}`,
      },
    })

    dot.addEventListener("click", (e) => {
      e.stopPropagation()
      onSwitch(idx)
    })

    container.appendChild(dot)
  })

  return container
}

/**
 * Creates the reset button with click handler
 */
function createResetButton(onReset: () => void): HTMLElement {
  const button = createElement("button", {
    className: "reset-button",
    children: ["Reset All (Demo)"],
  })

  button.addEventListener("click", (e) => {
    e.stopPropagation()
    onReset()
  })

  return button
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
