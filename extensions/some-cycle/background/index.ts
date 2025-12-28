// Background script for handling tab events and API communication
import type { Task, TaskEvent } from "@/types"
import browser from "webextension-polyfill"

class TaskTracker {
  private apiEndpoint = "http://localhost:3000/api/tasks"
  private lastPingTime = 0
  private pingThrottleMs = 1000 // Prevent spam

  async pingBackend(eventType: string, tabInfo: any): Promise<TaskEvent> {
    const now = Date.now()
    if (now - this.lastPingTime < this.pingThrottleMs) {
      return { type: "none", tasks: [], timestamp: now }
    }

    try {
      const response = await fetch(this.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: eventType,
          tab: tabInfo,
          timestamp: now,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      this.lastPingTime = now
      return await response.json()
    } catch (error) {
      console.warn("Failed to ping backend, using dummy data:", error)
      return this.getDummyTaskEvent()
    }
  }

  private getDummyTaskEvent(): TaskEvent {
    const tasks: Array<Task> = [
      {
        id: "1",
        name: "Review System Logs",
        lastCompleted: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        intervalMs: 1 * 60 * 60 * 1000, // Every 1 hour
        urgency: "high",
        category: "monitoring",
      },
      {
        id: "2",
        name: "Backup Database",
        lastCompleted: Date.now() - 23 * 60 * 60 * 1000, // 23 hours ago
        intervalMs: 24 * 60 * 60 * 1000, // Every 24 hours
        urgency: "critical",
        category: "maintenance",
      },
      {
        id: "3",
        name: "Update Dependencies",
        lastCompleted: Date.now() - 6 * 24 * 60 * 60 * 1000, // 6 days ago
        intervalMs: 7 * 24 * 60 * 60 * 1000, // Every week
        urgency: "medium",
        category: "development",
      },
    ]

    const staleTasks = tasks.filter((task) => {
      const timeSinceCompletion = Date.now() - task.lastCompleted
      return timeSinceCompletion > task.intervalMs
    })

    let eventType: TaskEvent["type"] = "none"
    if (staleTasks.some((t) => t.urgency === "critical")) {
      eventType = "critical"
    } else if (staleTasks.some((t) => t.urgency === "high")) {
      eventType = "warning"
    } else if (staleTasks.length > 0) {
      eventType = "reminder"
    }

    return {
      type: eventType,
      tasks: staleTasks,
      timestamp: Date.now(),
    }
  }

  async handleTaskEvent(event: TaskEvent) {
    if (event.type === "none") return

    // Store the event for popup and content script access
    await browser.storage.local.set({
      lastTaskEvent: event,
      lastEventTime: Date.now(),
    })

    // Update badge
    const badgeText =
      event.tasks.length > 0 ? event.tasks.length.toString() : ""
    const badgeColor = this.getBadgeColor(event.type)

    await browser.browserAction.setBadgeText({ text: badgeText })
    await browser.browserAction.setBadgeBackgroundColor({ color: badgeColor })

    // Notify content script for in-page notifications
    this.notifyContentScripts(event)
  }

  private getBadgeColor(eventType: TaskEvent["type"]): string {
    switch (eventType) {
      case "critical":
        return "#dc2626" // red-600
      case "warning":
        return "#ea580c" // orange-600
      case "reminder":
        return "#0891b2" // cyan-600
      default:
        return "#6b7280" // gray-500
    }
  }

  private async notifyContentScripts(event: TaskEvent) {
    try {
      const tabs = await browser.tabs.query({})
      tabs.forEach((tab) => {
        if (tab.id) {
          browser.tabs
            .sendMessage(tab.id, {
              type: "TASK_UPDATE",
              event: event,
            })
            .catch(() => {
              // Ignore errors for tabs without content scripts
            })
        }
      })
    } catch (error) {
      console.warn("Failed to notify content scripts:", error)
    }
  }
}

const taskTracker = new TaskTracker()

// Tab event listeners
browser.tabs.onCreated.addListener(async (tab) => {
  const event = await taskTracker.pingBackend("tab_created", {
    id: tab.id,
    url: tab.url,
  })
  await taskTracker.handleTaskEvent(event)
})

browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const event = await taskTracker.pingBackend("tab_removed", {
    id: tabId,
    removeInfo,
  })
  await taskTracker.handleTaskEvent(event)
})

browser.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await browser.tabs.get(activeInfo.tabId)
  const event = await taskTracker.pingBackend("tab_switched", {
    id: tab.id,
    url: tab.url,
  })
  await taskTracker.handleTaskEvent(event)
})

// Initialize on startup
browser.runtime.onStartup.addListener(async () => {
  const event = await taskTracker.pingBackend("extension_startup", {})
  await taskTracker.handleTaskEvent(event)
})

// Also ping on install/enable
browser.runtime.onInstalled.addListener(async () => {
  const event = await taskTracker.pingBackend("extension_installed", {})
  await taskTracker.handleTaskEvent(event)
})
