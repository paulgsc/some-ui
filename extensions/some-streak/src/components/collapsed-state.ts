import { createElement, createSVGElement } from "@streak/utils/create-element"

export type CollapsedStateData = {
  streak: number
  todayComplete: number
  todayTotal: number
}

/**
 * Creates the collapsed state UI component
 */
export function createCollapsedState(data: CollapsedStateData): HTMLElement {
  const container = createElement("div", {
    className: "streak-collapsed",
  })

  const inner = createElement("div", {
    className: "streak-collapsed-inner",
  })

  // Flame icon with badge
  const flameContainer = createFlameIcon(data.streak)

  // Progress ring
  const progressRing = createProgressRing(data.todayComplete, data.todayTotal)

  inner.appendChild(flameContainer)
  inner.appendChild(progressRing)
  container.appendChild(inner)

  return container
}

/**
 * Creates the flame icon with optional badge
 */
function createFlameIcon(streak: number): HTMLElement {
  const container = createElement("div", {
    className: `flame-icon ${streak > 0 ? "active" : "inactive"}`,
  })

  // Create flame SVG (lucide-react Flame icon)
  const svg = createSVGElement("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })

  const path1 = createSVGElement("path", {
    d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  })

  svg.appendChild(path1)
  container.appendChild(svg)

  // Add badge if streak > 0
  if (streak > 0) {
    const badge = createElement("span", {
      className: "flame-badge",
      children: [String(streak)],
    })
    container.appendChild(badge)
  }

  return container
}

/**
 * Creates the circular progress ring
 */
function createProgressRing(complete: number, total: number): HTMLElement {
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
    class: `progress-ring-fill ${progressPercent === 100 ? "complete" : "primary"}`,
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
