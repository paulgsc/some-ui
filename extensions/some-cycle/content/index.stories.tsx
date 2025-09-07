import { useEffect, useRef } from "react"
import type { Task, TaskEvent } from "@/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { TaskNotificationUI } from "."

// Mock browser API for Storybook
const mockBrowser = {
  runtime: {
    onMessage: {
      addListener: (callback: Function) => {
        // Store callback for later use
        ;(window as any).mockMessageCallback = callback
      },
    },
  },
}

// Make browser API available globally
;(window as any).browser = mockBrowser

const meta: Meta = {
  title: "Extensions/TaskNotificationUI",
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    eventType: {
      control: { type: "select" },
      options: ["critical", "warning", "reminder", "none"],
      description: "Type of notification event",
    },
    taskCount: {
      control: { type: "range", min: 0, max: 5, step: 1 },
      description: "Number of tasks to show",
    },
    urgencyMix: {
      control: { type: "select" },
      options: ["all-critical", "mixed", "all-low", "single-critical"],
      description: "Mix of task urgencies",
    },
  },
}

export default meta
type Story = StoryObj

// Helper function to create mock tasks
function createMockTask(
  name: string,
  urgency: "critical" | "high" | "medium" | "low",
  hoursOverdue: number = 2
): Task {
  const now = Date.now()
  const intervalMs = 24 * 60 * 60 * 1000 // 24 hours
  const lastCompleted = now - (intervalMs + hoursOverdue * 60 * 60 * 1000)

  return {
    id: Math.random().toString(36),
    name,
    urgency,
    intervalMs,
    lastCompleted,
    isActive: true,
  }
}

// Helper function to create task events
function createTaskEvent(type: string, tasks: Array<Task>): TaskEvent {
  return {
    type: type as any,
    tasks,
    timestamp: Date.now(),
  }
}

// Helper function to get tasks based on configuration
function getTasks(count: number, urgencyMix: string): Array<Task> {
  const taskNames = [
    "Review security logs",
    "Update system patches",
    "Backup database",
    "Monitor server performance",
    "Check SSL certificates",
  ]

  const tasks: Array<Task> = []

  for (let i = 0; i < count; i++) {
    let urgency: "critical" | "high" | "medium" | "low"
    let hoursOverdue = 2

    switch (urgencyMix) {
      case "all-critical":
        urgency = "critical"
        hoursOverdue = Math.random() * 48 + 24 // 1-3 days overdue
        break
      case "single-critical":
        urgency = i === 0 ? "critical" : "low"
        hoursOverdue = i === 0 ? 36 : 2
        break
      case "all-low":
        urgency = "low"
        hoursOverdue = Math.random() * 6 + 1 // 1-7 hours overdue
        break
      case "mixed":
      default:
        const urgencies: Array<"critical" | "high" | "medium" | "low"> = [
          "critical",
          "high",
          "medium",
          "low",
        ]
        urgency = urgencies[i % urgencies.length]
        hoursOverdue =
          urgency === "critical"
            ? 48
            : urgency === "high"
              ? 12
              : urgency === "medium"
                ? 6
                : 2
        break
    }

    tasks.push(
      createMockTask(taskNames[i % taskNames.length], urgency, hoursOverdue)
    )
  }

  return tasks
}

// Template function
const Template = (args: any) => {
  const { eventType, taskCount, urgencyMix } = args

  // Create container
  const container = document.createElement("div")
  container.style.cssText = `
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  position: relative;
  padding: 20px;
  box-sizing: border-box;
  `

  // Add some context to the page
  const contextDiv = document.createElement("div")
  contextDiv.innerHTML = `
  <h1 style="color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0 0 20px 0;">
  Task Notification Demo
  </h1>
  <p style="color: rgba(255,255,255,0.8); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0 0 20px 0;">
  Current settings: ${eventType} event with ${taskCount} task(s) (${urgencyMix} urgency)
  </p>
  <button id="trigger-notification" style="
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.3);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  transition: background 0.2s;
  ">
  Trigger Notification
  </button>
  `

  container.appendChild(contextDiv)

  // Initialize notification UI
  setTimeout(() => {
    const notificationUI = new TaskNotificationUI()

    // Add click handler for trigger button
    const button = container.querySelector(
      "#trigger-notification"
    ) as HTMLButtonElement
    if (button) {
      button.addEventListener("click", () => {
        const tasks = getTasks(taskCount, urgencyMix)
        const event = createTaskEvent(eventType, tasks)

        // Trigger the notification using the mock callback
        if ((window as any).mockMessageCallback) {
          ;(window as any).mockMessageCallback({
            type: "TASK_UPDATE",
            event: event,
          })
        }
      })

      button.addEventListener("mouseover", () => {
        button.style.background = "rgba(255,255,255,0.3)"
      })

      button.addEventListener("mouseout", () => {
        button.style.background = "rgba(255,255,255,0.2)"
      })
    }
  }, 100)

  return container
}

export const Default: Story = {
  render: (args) => {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (ref.current) {
        ref.current.appendChild(Template(args))
      }
    }, [])

    return <div ref={ref} />
  },
  args: {
    eventType: "warning",
    taskCount: 2,
    urgencyMix: "mixed",
  },
}

export const CriticalAlert: Story = {
  render: Template,
  args: {
    eventType: "critical",
    taskCount: 3,
    urgencyMix: "all-critical",
  },
}

export const SingleCriticalTask: Story = {
  render: Template,
  args: {
    eventType: "critical",
    taskCount: 1,
    urgencyMix: "single-critical",
  },
}

export const MultipleTasksReminder: Story = {
  render: Template,
  args: {
    eventType: "reminder",
    taskCount: 4,
    urgencyMix: "mixed",
  },
}

export const LowPriorityTasks: Story = {
  render: Template,
  args: {
    eventType: "warning",
    taskCount: 2,
    urgencyMix: "all-low",
  },
}

export const NoTasks: Story = {
  render: Template,
  args: {
    eventType: "none",
    taskCount: 0,
    urgencyMix: "mixed",
  },
}

// Auto-trigger story for demo purposes
export const AutoTrigger: Story = {
  render: (args) => {
    const container = Template(args)

    // Auto-trigger notification after 1 second
    setTimeout(() => {
      const button = container.querySelector(
        "#trigger-notification"
      ) as HTMLButtonElement
      if (button) {
        button.click()
      }
    }, 1000)

    return container
  },
  args: {
    eventType: "critical",
    taskCount: 3,
    urgencyMix: "mixed",
  },
}

// Story with multiple rapid notifications (stress test)
export const RapidNotifications: Story = {
  render: (args) => {
    const container = Template(args)

    // Add additional button for rapid testing
    const rapidButton = document.createElement("button")
    rapidButton.textContent = "Trigger Rapid Notifications"
    rapidButton.style.cssText = `
    background: rgba(255,100,100,0.3);
    border: 1px solid rgba(255,100,100,0.5);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin-left: 10px;
    `

    const contextDiv = container.querySelector("div")
    if (contextDiv) {
      contextDiv.appendChild(rapidButton)
    }

    rapidButton.addEventListener("click", () => {
      // Trigger multiple notifications with delay
      const events = [
        { type: "reminder", count: 1, urgency: "low" },
        { type: "warning", count: 2, urgency: "medium" },
        { type: "critical", count: 3, urgency: "critical" },
      ]

      events.forEach((eventConfig, index) => {
        setTimeout(() => {
          const tasks = getTasks(eventConfig.count, eventConfig.urgency)
          const event = createTaskEvent(eventConfig.type, tasks)

          if ((globalThis as any).mockMessageCallback) {
            ;(globalThis as any).mockMessageCallback({
              type: "TASK_UPDATE",
              event: event,
            })
          }
        }, index * 2000)
      })
    })

    return container
  },
  args: {
    eventType: "warning",
    taskCount: 2,
    urgencyMix: "mixed",
  },
}
