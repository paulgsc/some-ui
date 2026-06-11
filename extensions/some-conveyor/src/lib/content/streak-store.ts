/**
 * streak-store — the ONLY conveyor module that talks to browser.storage.
 * Pure I/O + pure selectors. No DOM, no timers, no theming.
 */
import {
  hasKey,
  isArrayField,
  isBooleanField,
  isNumberField,
  isStringField,
} from "@conveyor/utils/content/type-guards"

export type Task = { id: string; label: string; done: boolean }
export type Category = {
  id: string
  name: string
  icon: string
  color: string
  tasks: Array<Task>
}
export type StreakData = {
  currentCategoryIndex: number
  categories: Array<Category>
  lastActivity: string | null
}

const STORAGE_KEY = "streak-tracker-data"

// --- Exhaustive Compiler Assurance Helper ---
function assertUnreachable(x: never): never {
  throw new Error("Unhandled type property", { cause: x })
}

// --- Exhaustive Type Guards ---
function isTask(value: unknown): value is Task {
  if (value === null || typeof value !== "object") return false
  const taskKeys: Array<keyof Task> = ["id", "label", "done"]
  for (const key of taskKeys) {
    switch (key) {
      case "id":
        if (!isStringField(value, key)) return false
        break
      case "label":
        if (!isStringField(value, key)) return false
        break
      case "done":
        if (!isBooleanField(value, key)) return false
        break
      default:
        key satisfies never
        assertUnreachable(key)
    }
  }
  return true
}

function isCategory(value: unknown): value is Category {
  if (value === null || typeof value !== "object") return false
  const categoryKeys: Array<keyof Category> = [
    "id",
    "name",
    "icon",
    "color",
    "tasks",
  ]
  for (const key of categoryKeys) {
    switch (key) {
      case "id":
        if (!isStringField(value, key)) return false
        break
      case "name":
        if (!isStringField(value, key)) return false
        break
      case "icon":
        if (!isStringField(value, key)) return false
        break
      case "color":
        if (!isStringField(value, key)) return false
        break
      case "tasks":
        if (!isArrayField(value, key, isTask)) return false
        break
      default:
        key satisfies never
        assertUnreachable(key)
    }
  }
  return true
}

function isStreakData(value: unknown): value is StreakData {
  if (value === null || typeof value !== "object") return false
  const streakDataKeys: Array<keyof StreakData> = [
    "currentCategoryIndex",
    "categories",
    "lastActivity",
  ]
  for (const key of streakDataKeys) {
    switch (key) {
      case "currentCategoryIndex":
        if (!isNumberField(value, key)) return false
        break
      case "categories":
        if (!isArrayField(value, key, isCategory)) return false
        break
      case "lastActivity":
        if (!hasKey(value, key)) return false
        if (
          value.lastActivity !== null &&
          typeof value.lastActivity !== "string"
        )
          return false
        break
      default:
        key satisfies never
        assertUnreachable(key)
    }
  }
  return true
}

export async function loadStreakData(): Promise<StreakData | null> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY)
    const raw = result[STORAGE_KEY]
    if (typeof raw !== "string") return null
    const parsed = JSON.parse(raw)
    return isStreakData(parsed) ? parsed : null
  } catch {
    return null
  }
}

// ── Pure selectors (no I/O) ──────────────────────────────────────────────────

export function completeCategoryCount(data: StreakData): number {
  return data.categories.filter((c) => c.tasks.every((t) => t.done)).length
}

export function currentCategory(data: StreakData): Category | undefined {
  return data.categories[data.currentCategoryIndex]
}

export function categoryProgress(category: Category): number {
  const total = category.tasks.length
  if (total === 0) return 0
  return Math.round((category.tasks.filter((t) => t.done).length / total) * 100)
}

export function formatRelative(isoString: string | null): string {
  if (!isoString) return "no activity"
  const minutes = Math.floor(
    (Date.now() - new Date(isoString).getTime()) / 60_000
  )
  const hours = Math.floor(minutes / 60)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
