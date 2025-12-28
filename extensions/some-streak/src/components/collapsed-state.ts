import { createElement, createSVGElement } from "@streak/utils/create-element"

export type CollapsedStateData = {
  streak: number
  todayComplete: number
  todayTotal: number
  categoryIcon: string
  categoryColor: string
}

/**
 * Creates the collapsed state UI component
 */
export function createCollapsedState(
  data: CollapsedStateData,
  onPrevCategory: () => void,
  onNextCategory: () => void
): HTMLElement {
  const container = createElement("div", {
    className: "streak-collapsed drag-handle",
  })

  const inner = createElement("div", {
    className: `streak-collapsed-inner color-${data.categoryColor}`,
  })

  // Category icon with badge
  const iconContainer = createCategoryIcon(data.categoryIcon, data.streak)

  // Progress ring
  const progressRing = createProgressRing(
    data.todayComplete,
    data.todayTotal,
    data.categoryColor
  )

  // Navigation buttons
  const navButtons = createNavButtons(onPrevCategory, onNextCategory)

  inner.appendChild(iconContainer)
  inner.appendChild(progressRing)
  inner.appendChild(navButtons)
  container.appendChild(inner)

  return container
}

/**
 * Creates the category icon with optional badge
 */
function createCategoryIcon(icon: string, streak: number): HTMLElement {
  const container = createElement("div", {
    className: "category-icon",
  })

  const iconText = createElement("span", {
    children: [icon],
  })

  container.appendChild(iconText)

  // Add badge if streak > 0
  if (streak > 0) {
    const badge = createElement("span", {
      className: "streak-badge",
      children: [String(streak)],
    })
    container.appendChild(badge)
  }

  return container
}

/**
 * Creates the circular progress ring
 */
function createProgressRing(
  complete: number,
  total: number,
  color: string
): HTMLElement {
  const container = createElement("div", {
    className: "progress-ring",
  })

  const progressPercent = (complete / total) * 100
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progressPercent / 100)

  const svg = createSVGElement("svg", {
    width: "32",
    height: "32",
  })

  // Background circle
  const bgCircle = createSVGElement("circle", {
    cx: "16",
    cy: "16",
    r: "14",
    class: "progress-ring-bg",
  })

  // Progress circle
  const progressCircle = createSVGElement("circle", {
    cx: "16",
    cy: "16",
    r: "14",
    class: `progress-ring-fill ${
      progressPercent === 100 ? "complete" : `color-${color}`
    }`,
    "stroke-dasharray": String(circumference),
    "stroke-dashoffset": String(offset),
  })

  svg.appendChild(bgCircle)
  svg.appendChild(progressCircle)

  // Count text
  const countText = createElement("span", {
    className: "progress-ring-count",
    children: [String(complete)],
  })

  container.appendChild(svg)
  container.appendChild(countText)

  return container
}

/**
 * Creates navigation buttons for category switching
 */
function createNavButtons(onPrev: () => void, onNext: () => void): HTMLElement {
  const container = createElement("div", {
    className: "nav-buttons",
  })

  // Previous button
  const prevButton = createElement("button", {
    className: "nav-button",
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
    className: "nav-button",
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

  container.appendChild(prevButton)
  container.appendChild(nextButton)

  return container
}
