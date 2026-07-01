/**
 * Background Service Worker
 * Manages state, localStorage operations, and message passing
 */

import type { Category } from "@streak/components/expanded-state"

/* -------------------------------------------------------
 * Types
 * ----------------------------------------------------- */

type StorageData = {
  currentCategoryIndex: number
  categories: Array<Category>
  lastActivity: string | null
}

type GetDataMessage = {
  type: "GET_DATA"
}

type ToggleTaskMessage = {
  type: "TOGGLE_TASK"
  categoryId: string
  taskId: string
}

type SwitchCategoryMessage = {
  type: "SWITCH_CATEGORY"
  index: number
}

type ResetAllMessage = {
  type: "RESET_ALL"
}

type AutoCompleteTaskMessage = {
  type: "AUTO_COMPLETE_TASK"
  categoryId: string
  taskId: string
}

type CheckTaskStatusMessage = {
  type: "CHECK_TASK_STATUS"
  categoryId: string
  taskId: string
}

type IncomingMessage =
  | GetDataMessage
  | ToggleTaskMessage
  | SwitchCategoryMessage
  | ResetAllMessage
  | AutoCompleteTaskMessage
  | CheckTaskStatusMessage

type MessageResponse =
  | { success: true; data: StorageData }
  | { success: true; isCompleted: boolean }
  | { success: false; error: string }

/* -------------------------------------------------------
 * Constants
 * ----------------------------------------------------- */

const STORAGE_KEY = "streak-tracker-data"

/* -------------------------------------------------------
 * Default Data
 * ----------------------------------------------------- */

const DEFAULT_CATEGORIES: Array<Category> = [
  {
    id: "jobs",
    name: "Job Search",
    icon: "💼",
    color: "blue",
    tasks: [
      { id: "1", label: "Morning Applications (5-8)", done: false },
      { id: "2", label: "Midday Profile Update", done: false },
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
      { id: "1", label: "Daily Lesson", done: false },
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

/* -------------------------------------------------------
 * Storage Ops
 * ----------------------------------------------------- */

async function getData(): Promise<StorageData> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY)
    if (result[STORAGE_KEY]) {
      return JSON.parse(result[STORAGE_KEY])
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Background] Error loading data:", error)
  }

  return {
    currentCategoryIndex: 0,
    categories: DEFAULT_CATEGORIES,
    lastActivity: null,
  }
}

async function saveData(data: StorageData): Promise<void> {
  try {
    await browser.storage.local.set({
      [STORAGE_KEY]: JSON.stringify(data),
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Background] Error saving data:", error)
  }
}

/* -------------------------------------------------------
 * Update Ops
 * ----------------------------------------------------- */

async function toggleTask(
  categoryId: string,
  taskId: string
): Promise<StorageData> {
  const data = await getData()

  const category = data.categories.find((cat) => cat.id === categoryId)
  if (!category) {
    throw new Error(`Category ${categoryId} not found`)
  }

  const task = category.tasks.find((t) => t.id === taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found in category ${categoryId}`)
  }

  task.done = !task.done
  data.lastActivity = new Date().toISOString()

  await saveData(data)
  return data
}

async function autoCompleteTask(
  categoryId: string,
  taskId: string
): Promise<StorageData> {
  const data = await getData()

  const category = data.categories.find((cat) => cat.id === categoryId)
  if (!category) {
    throw new Error(`Category ${categoryId} not found`)
  }

  const task = category.tasks.find((t) => t.id === taskId)
  if (!task) {
    throw new Error(`Task ${taskId} not found in category ${categoryId}`)
  }

  // Only auto-complete if not already done
  if (!task.done) {
    task.done = true
    data.lastActivity = new Date().toISOString()

    await saveData(data)
  }

  return data
}

async function checkTaskStatus(
  categoryId: string,
  taskId: string
): Promise<boolean> {
  const data = await getData()

  const category = data.categories.find((cat) => cat.id === categoryId)
  if (!category) {
    return false
  }

  const task = category.tasks.find((t) => t.id === taskId)
  if (!task) {
    return false
  }

  return task.done
}

async function switchCategory(index: number): Promise<StorageData> {
  const data = await getData()

  if (index < 0 || index >= data.categories.length) {
    throw new Error(`Invalid category index: ${index}`)
  }

  data.currentCategoryIndex = index
  await saveData(data)
  return data
}

async function resetAllTasks(): Promise<StorageData> {
  const data = await getData()

  data.categories = data.categories.map((cat) => ({
    ...cat,
    tasks: cat.tasks.map((t) => ({ ...t, done: false })),
  }))

  await saveData(data)
  return data
}

async function checkAndResetDaily(): Promise<void> {
  const data = await getData()
  if (!data.lastActivity) return

  const last = new Date(data.lastActivity)
  const now = new Date()

  const isDifferentDay =
    now.getFullYear() !== last.getFullYear() ||
    now.getMonth() !== last.getMonth() ||
    now.getDate() !== last.getDate()

  if (isDifferentDay) {
    await resetAllTasks()
  }
}

/* -------------------------------------------------------
 * Broadcast
 * ----------------------------------------------------- */

async function broadcastUpdate(data: StorageData): Promise<void> {
  try {
    const tabs = await browser.tabs.query({})

    for (const tab of tabs) {
      if (!tab.id) continue

      browser.tabs
        .sendMessage(tab.id, {
          type: "STATE_UPDATE",
          data,
        })
        .catch(() => {
          /* content script not present */
        })
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Background] Error broadcasting update:", error)
  }
}

/* -------------------------------------------------------
 * Message Router (Strict Typed)
 * ----------------------------------------------------- */

browser.runtime.onMessage.addListener(
  (
    message: IncomingMessage,
    _sender: browser.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): true => {
    ;(async () => {
      try {
        switch (message.type) {
          case "GET_DATA": {
            const data = await getData()
            sendResponse({ success: true, data })
            break
          }

          case "TOGGLE_TASK": {
            const updated = await toggleTask(message.categoryId, message.taskId)
            sendResponse({ success: true, data: updated })
            broadcastUpdate(updated)
            break
          }

          case "AUTO_COMPLETE_TASK": {
            const updated = await autoCompleteTask(
              message.categoryId,
              message.taskId
            )
            sendResponse({ success: true, data: updated })
            broadcastUpdate(updated)
            break
          }

          case "CHECK_TASK_STATUS": {
            const isCompleted = await checkTaskStatus(
              message.categoryId,
              message.taskId
            )
            sendResponse({ success: true, isCompleted })
            break
          }

          case "SWITCH_CATEGORY": {
            const switched = await switchCategory(message.index)
            sendResponse({ success: true, data: switched })
            broadcastUpdate(switched)
            break
          }

          case "RESET_ALL": {
            const reset = await resetAllTasks()
            sendResponse({ success: true, data: reset })
            broadcastUpdate(reset)
            break
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        // eslint-disable-next-line no-console
        console.error("[Background] Error handling message:", err)
        sendResponse({ success: false, error: msg })
      }
    })()

    return true
  }
)

/* -------------------------------------------------------
 * Init
 * ----------------------------------------------------- */

async function init(): Promise<void> {
  await checkAndResetDaily()
  setInterval(checkAndResetDaily, 60 * 60 * 1000)
}

init()

export {}
