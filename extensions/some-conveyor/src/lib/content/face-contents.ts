import type { FaceContent } from "@conveyor/types"

// ─── Storage schema (mirrors some-streak's background.ts) ─────────────────────

type Task = { id: string; label: string; done: boolean }
type Category = {
  id: string
  name: string
  icon: string
  color: string
  tasks: Array<Task>
}
type StorageData = {
  currentCategoryIndex: number
  categories: Array<Category>
  lastActivity: string | null
}

const STORAGE_KEY = "streak-tracker-data"

async function loadStreakData(): Promise<StorageData | null> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY)
    if (result[STORAGE_KEY]) {
      return JSON.parse(result[STORAGE_KEY] as string) as StorageData
    }
    return null
  } catch {
    return null
  }
}

// ─── Helper — build a terminal-styled element ──────────────────────────────────

function terminalEl(tag: string, cls?: string): HTMLElement {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  Object.assign(el.style, {
    fontFamily: "var(--face-font, 'Courier New', monospace)",
    fontSize: "var(--face-font-size, 11px)",
    lineHeight: "var(--face-line-height, 1.5)",
    color: "var(--face-text, #4a7c4a)",
    padding: "0",
    margin: "0",
    background: "transparent",
    border: "none",
    width: "100%",
  })
  return el
}

function terminalLabel(text: string): HTMLElement {
  const el = terminalEl("span", "sc-face-label")
  el.style.color = "var(--face-text-secondary, #2a4a2a)"
  el.style.display = "block"
  el.textContent = text
  return el
}

function terminalValue(text: string, bright = false): HTMLElement {
  const el = terminalEl("span", "sc-face-value")
  el.style.color = bright
    ? "var(--face-text-active, #00ff41)"
    : "var(--face-text, #4a7c4a)"
  el.style.fontSize = bright ? "18px" : "var(--face-font-size, 11px)"
  el.style.fontWeight = bright ? "bold" : "normal"
  el.style.display = "block"
  el.textContent = text
  return el
}

function terminalRow(...children: Array<HTMLElement>): HTMLElement {
  const row = terminalEl("div", "sc-face-row")
  Object.assign(row.style, {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "12px",
    width: "100%",
    boxSizing: "border-box",
  })
  for (const child of children) row.appendChild(child)
  return row
}

// ─── Face 0: Current streak count ─────────────────────────────────────────────

export function makeStreakCountFace(): FaceContent {
  let timer: ReturnType<typeof setInterval> | null = null
  let container: HTMLElement | null = null

  return {
    id: "streak-count",
    slowOnHover: true,

    render() {
      container = terminalEl("div", "sc-face-streak-count")
      Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "12px",
        gap: "4px",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
      })

      const label = terminalLabel("STREAK")
      const valueEl = terminalValue("--", true)
      const subLabel = terminalLabel("categories complete")

      container.appendChild(label)
      container.appendChild(valueEl)
      container.appendChild(subLabel)

      const update = async () => {
        const data = await loadStreakData()
        if (!data || !container) return
        const complete = data.categories.filter((c) =>
          c.tasks.every((t) => t.done)
        ).length
        valueEl.textContent = String(complete)
        subLabel.textContent = `/ ${data.categories.length} categories`
      }

      update()
      timer = setInterval(update, 10_000)

      return container
    },

    onExit() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

// ─── Face 1: Today's progress bar ─────────────────────────────────────────────

export function makeTodayProgressFace(): FaceContent {
  let timer: ReturnType<typeof setInterval> | null = null

  return {
    id: "today-progress",
    slowOnHover: true,

    render() {
      const container = terminalEl("div", "sc-face-today")
      Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        padding: "10px 12px",
        gap: "6px",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        justifyContent: "center",
      })

      const header = terminalLabel("TODAY")
      const tasksEl = terminalEl("div", "sc-face-tasks")
      tasksEl.style.display = "flex"
      tasksEl.style.flexDirection = "column"
      tasksEl.style.gap = "3px"

      container.appendChild(header)
      container.appendChild(tasksEl)

      const update = async () => {
        const data = await loadStreakData()
        if (!data) return
        const cat = data.categories[data.currentCategoryIndex]
        if (!cat) return

        tasksEl.innerHTML = ""
        for (const task of cat.tasks) {
          const row = terminalEl("div")
          row.style.display = "flex"
          row.style.alignItems = "center"
          row.style.gap = "6px"

          const tick = terminalEl("span")
          tick.textContent = task.done ? "▪" : "▫"
          tick.style.color = task.done
            ? "var(--face-text-active, #00ff41)"
            : "var(--face-text-secondary, #2a4a2a)"

          const label = terminalEl("span")
          label.textContent = task.label
          label.style.color = task.done
            ? "var(--face-text, #4a7c4a)"
            : "var(--face-text-secondary, #2a4a2a)"
          label.style.textDecoration = task.done ? "line-through" : "none"
          label.style.overflow = "hidden"
          label.style.textOverflow = "ellipsis"
          label.style.whiteSpace = "nowrap"
          label.style.flex = "1"

          row.appendChild(tick)
          row.appendChild(label)
          tasksEl.appendChild(row)
        }
      }

      update()
      timer = setInterval(update, 10_000)

      return container
    },

    onExit() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

// ─── Face 2: Last activity timestamp ──────────────────────────────────────────

function formatRelative(isoString: string | null): string {
  if (!isoString) return "no activity"
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function makeLastActivityFace(): FaceContent {
  let timer: ReturnType<typeof setInterval> | null = null

  return {
    id: "last-activity",
    slowOnHover: true,

    render() {
      const container = terminalEl("div", "sc-face-last-activity")
      Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        padding: "12px",
        gap: "6px",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        justifyContent: "center",
      })

      const label = terminalLabel("LAST ACTIVE")
      const timeEl = terminalValue("--", false)
      timeEl.style.fontSize = "14px"

      const catLabel = terminalLabel("CURRENT FOCUS")
      const catEl = terminalValue("--", false)

      container.appendChild(label)
      container.appendChild(timeEl)
      container.appendChild(catLabel)
      container.appendChild(catEl)

      const update = async () => {
        const data = await loadStreakData()
        if (!data) return
        timeEl.textContent = formatRelative(data.lastActivity)
        const cat = data.categories[data.currentCategoryIndex]
        if (cat) {
          catEl.textContent = `${cat.icon} ${cat.name}`
        }
      }

      update()
      timer = setInterval(update, 15_000)

      return container
    },

    onExit() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

// ─── Face 3: Category overview grid ───────────────────────────────────────────

export function makeCategoryOverviewFace(): FaceContent {
  let timer: ReturnType<typeof setInterval> | null = null

  return {
    id: "category-overview",
    slowOnHover: true,

    render() {
      const container = terminalEl("div", "sc-face-categories")
      Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        padding: "10px 12px",
        gap: "4px",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        justifyContent: "center",
        overflowY: "hidden",
      })

      const header = terminalLabel("CATEGORIES")
      container.appendChild(header)

      const grid = terminalEl("div", "sc-face-cat-grid")
      grid.style.display = "flex"
      grid.style.flexDirection = "column"
      grid.style.gap = "3px"
      grid.style.marginTop = "4px"
      container.appendChild(grid)

      const update = async () => {
        const data = await loadStreakData()
        if (!data) return

        grid.innerHTML = ""
        for (const cat of data.categories.slice(0, 5)) {
          const done = cat.tasks.filter((t) => t.done).length
          const total = cat.tasks.length
          const pct = total > 0 ? Math.round((done / total) * 100) : 0

          const row = terminalEl("div")
          row.style.display = "flex"
          row.style.alignItems = "center"
          row.style.gap = "6px"

          const icon = terminalEl("span")
          icon.textContent = cat.icon
          icon.style.fontSize = "13px"
          icon.style.lineHeight = "1"

          const name = terminalEl("span")
          name.textContent = cat.name
          name.style.flex = "1"
          name.style.overflow = "hidden"
          name.style.textOverflow = "ellipsis"
          name.style.whiteSpace = "nowrap"

          const pctEl = terminalEl("span")
          pctEl.textContent = `${pct}%`
          pctEl.style.color =
            pct === 100
              ? "var(--face-text-active, #00ff41)"
              : "var(--face-text, #4a7c4a)"
          pctEl.style.minWidth = "30px"
          pctEl.style.textAlign = "right"

          row.appendChild(icon)
          row.appendChild(name)
          row.appendChild(pctEl)
          grid.appendChild(row)
        }
      }

      update()
      timer = setInterval(update, 10_000)

      return container
    },

    onExit() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

// ─── Face 4: Clock / system info ──────────────────────────────────────────────

export function makeClockFace(): FaceContent {
  let timer: ReturnType<typeof setInterval> | null = null

  return {
    id: "clock",
    slowOnHover: false,

    render() {
      const container = terminalEl("div", "sc-face-clock")
      Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "12px",
        gap: "4px",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
      })

      const label = terminalLabel("LOCAL TIME")
      const timeEl = terminalValue("--:--:--", true)
      timeEl.style.fontSize = "20px"
      timeEl.style.fontVariantNumeric = "tabular-nums"
      const dateEl = terminalEl("span")
      dateEl.style.color = "var(--face-text-secondary, #2a4a2a)"
      dateEl.style.fontSize = "10px"
      dateEl.style.fontFamily = "var(--face-font)"

      container.appendChild(label)
      container.appendChild(timeEl)
      container.appendChild(dateEl)

      const update = () => {
        const now = new Date()
        timeEl.textContent = now.toLocaleTimeString("en-US", { hour12: false })
        dateEl.textContent = now.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      }

      update()
      timer = setInterval(update, 1_000)

      return container
    },

    onExit() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

// ─── Face 5: Quick action prompt ──────────────────────────────────────────────

export function makeActionFace(): FaceContent {
  return {
    id: "action",
    slowOnHover: true,

    render() {
      const container = terminalEl("div", "sc-face-action")
      Object.assign(container.style, {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "12px",
        gap: "8px",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        cursor: "pointer",
      })

      const label = terminalLabel("ACTION")
      const prompt = terminalValue("▶ open streak", true)
      prompt.style.cursor = "pointer"
      const hint = terminalEl("span")
      hint.textContent = "click to open"
      hint.style.color = "var(--face-text-secondary, #2a4a2a)"
      hint.style.fontSize = "9px"
      hint.style.fontFamily = "var(--face-font)"

      container.appendChild(label)
      container.appendChild(prompt)
      container.appendChild(hint)

      return container
    },
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns the canonical set of 6 face content implementations.
 * One instance per cube — they are not shared across cubes.
 */
export function makeCubeFaceContents(_cubeId: string): Array<FaceContent> {
  return [
    makeStreakCountFace(),
    makeTodayProgressFace(),
    makeLastActivityFace(),
    makeCategoryOverviewFace(),
    makeClockFace(),
    makeActionFace(),
  ]
}
