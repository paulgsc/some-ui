// Content script for in-page task notifications
import type { Task, TaskEvent } from "@/types"
import browser from "webextension-polyfill"

export class TaskNotificationUI {
  private container: HTMLElement | null = null
  private isVisible = false
  private hideTimeout: number | null = null

  constructor() {
    this.createContainer()
    this.listenForMessages()
  }

  private createContainer() {
    // Create notification container
    this.container = document.createElement("div")
    this.container.id = "cyclical-tasks-notification"
    this.container.className = "cyclical-tasks-notification"

    // Add styles
    this.container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transform: translateX(100%);
        transition: transform 0.3s ease-in-out;
        max-width: 320px;
        pointer-events: auto;
        `

    document.body.appendChild(this.container)
  }

  private listenForMessages() {
    browser.runtime.onMessage.addListener((message: any) => {
      if (message.type === "TASK_UPDATE" && message.event) {
        this.showNotification(message.event)
      }
    })
  }

  private showNotification(event: TaskEvent) {
    if (event.type === "none" || event.tasks.length === 0) {
      this.hideNotification()
      return
    }

    // Don't show notifications too frequently
    if (this.isVisible) return

    this.renderNotification(event)
    this.slideIn()

    // Auto-hide after delay (longer for critical tasks)
    const hideDelay = event.type === "critical" ? 10000 : 5000
    this.hideTimeout = window.setTimeout(() => {
      this.hideNotification()
    }, hideDelay)
  }

  private renderNotification(event: TaskEvent) {
    if (!this.container) return

    const urgencyColors = {
      critical: { bg: "#7f1d1d", border: "#dc2626", text: "#fca5a5" },
      high: { bg: "#7c2d12", border: "#ea580c", text: "#fdba74" },
      medium: { bg: "#713f12", border: "#d97706", text: "#fde68a" },
      low: { bg: "#1e3a8a", border: "#3b82f6", text: "#93c5fd" },
    }

    const getTaskColor = (urgency: string) =>
      urgencyColors[urgency as keyof typeof urgencyColors] || urgencyColors.low

    const mostUrgentTask = event.tasks.reduce((prev, current) => {
      const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 }
      return urgencyOrder[current.urgency] > urgencyOrder[prev.urgency]
        ? current
        : prev
    })

    const color = getTaskColor(mostUrgentTask.urgency)

    const formatTimeOverdue = (task: Task): string => {
      const overdueMs = Date.now() - (task.lastCompleted + task.intervalMs)
      const hours = Math.floor(overdueMs / (1000 * 60 * 60))
      const days = Math.floor(hours / 24)

      if (days > 0) return `${days}d overdue`
      if (hours > 0) return `${hours}h overdue`
      return "overdue"
    }

    const getIcon = (type: string) => {
      switch (type) {
        case "critical":
          return "⚡"
        case "warning":
          return "⚠️"
        case "reminder":
          return "🔔"
        default:
          return "✓"
      }
    }

    this.container.innerHTML = `
            <div style="
            background: linear-gradient(135deg, ${color.bg} 0%, #1f2937 100%);
            border: 2px solid ${color.border};
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            position: relative;
            overflow: hidden;
            ">
            <div style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: ${color.border};
            animation: pulse 2s infinite;
            "></div>

            <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 20px; margin-right: 8px;">${getIcon(event.type)}</span>
            <div>
            <h3 style="
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: white;
            ">${event.tasks.length} Task${event.tasks.length !== 1 ? "s" : ""} Need Attention</h3>
            <p style="
            margin: 0;
            font-size: 12px;
            color: ${color.text};
            text-transform: uppercase;
            letter-spacing: 0.5px;
            ">${event.type} Priority</p>
            </div>
            </div>

            <div style="margin-bottom: 12px;">
            ${event.tasks
              .slice(0, 2)
              .map(
                (task) => `
                    <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    ">
                    <span style="
                    color: white;
                    font-size: 13px;
                    font-weight: 500;
                    flex: 1;
                    margin-right: 8px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    ">${task.name}</span>
                    <span style="
                    color: ${color.text};
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    white-space: nowrap;
                    ">${formatTimeOverdue(task)}</span>
                    </div>
                    `
              )
              .join("")}
                ${
                  event.tasks.length > 2
                    ? `
                        <div style="
                        padding: 8px 0;
                        text-align: center;
                        color: ${color.text};
                        font-size: 12px;
                        ">
                        +${event.tasks.length - 2} more task${event.tasks.length - 2 !== 1 ? "s" : ""}
                        </div>
                        `
                    : ""
                }
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                <button onclick="this.parentElement.parentElement.parentElement.style.transform = 'translateX(100%)'" style="
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                color: white;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 11px;
                cursor: pointer;
                transition: background 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                Dismiss
                </button>

                <a href="http://localhost:3000/dashboard" target="_blank" style="
                    background: ${color.border};
                color: white;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 11px;
                text-decoration: none;
                font-weight: 500;
                transition: opacity 0.2s;
                " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                View Dashboard →
                </a>
                </div>
                </div>

                <style>
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                </style>
                `
  }

  private slideIn() {
    if (!this.container) return

    this.isVisible = true
    this.container.style.transform = "translateX(0)"
  }

  private hideNotification() {
    if (!this.container || !this.isVisible) return

    this.container.style.transform = "translateX(100%)"
    this.isVisible = false

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
  }
}

// Initialize the notification system
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new TaskNotificationUI()
  })
} else {
  new TaskNotificationUI()
}
