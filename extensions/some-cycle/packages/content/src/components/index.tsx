// Content script for in-page task notifications - Functional Preact Version
import type { Task, TaskEvent } from "@some-cycle/types"
import { render } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import browser from "webextension-polyfill"

// Types for our state
type NotificationState = {
  event: TaskEvent | null
  isVisible: boolean
}

// Utility functions (pure!)
const urgencyColors = {
  critical: {
    bg: "bg-red-900",
    border: "border-red-600",
    text: "text-red-300",
  },
  high: {
    bg: "bg-orange-900",
    border: "border-orange-500",
    text: "text-orange-300",
  },
  medium: {
    bg: "bg-yellow-900",
    border: "border-yellow-600",
    text: "text-yellow-300",
  },
  low: { bg: "bg-blue-900", border: "border-blue-500", text: "text-blue-300" },
} as const

const getTaskColor = (
  urgency: string
): (typeof urgencyColors)[keyof typeof urgencyColors] =>
  urgencyColors[urgency as keyof typeof urgencyColors] || urgencyColors.low

const getMostUrgentTask = (tasks: Array<Task>): Task =>
  tasks.reduce((prev, current) => {
    const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 }
    return urgencyOrder[current.urgency] > urgencyOrder[prev.urgency]
      ? current
      : prev
  })

const formatTimeOverdue = (task: Task): string => {
  const overdueMs = Date.now() - (task.lastCompleted + task.intervalMs)
  const hours = Math.floor(overdueMs / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d overdue`
  if (hours > 0) return `${hours}h overdue`
  return "overdue"
}

const getIcon = (type: string): string => {
  const icons = {
    critical: "⚡",
    warning: "⚠️",
    reminder: "🔔",
    default: "✓",
  }
  return icons[type as keyof typeof icons] || icons.default
}

// Pure component for individual task display
export const TaskItem = ({
  task,
  colorScheme,
}: {
  task: Task
  colorScheme: ReturnType<typeof getTaskColor>
}) => (
  <div className="flex items-center justify-between border-b border-white/10 py-2">
    <span className="mr-2 flex-1 truncate text-sm font-medium text-white">
      {task.name}
    </span>
    <span
      className={`${colorScheme.text} whitespace-nowrap text-xs font-semibold uppercase`}
    >
      {formatTimeOverdue(task)}
    </span>
  </div>
)

// Main notification component
export const TaskNotification = ({
  event,
  onDismiss,
}: {
  event: TaskEvent
  onDismiss: () => void
}) => {
  const mostUrgentTask = getMostUrgentTask(event.tasks)
  const colorScheme = getTaskColor(mostUrgentTask.urgency)

  return (
    <div
      className={`
      ${colorScheme.bg} ${colorScheme.border}
      relative max-w-sm overflow-hidden rounded-xl border-2
      p-4 shadow-2xl backdrop-blur-sm
    `}
    >
      {/* Pulsing top border */}
      <div
        className={`
        absolute inset-x-0 top-0 h-0.5 ${colorScheme.border.replace("border-", "bg-")}
        animate-pulse
      `}
      />

      {/* Header */}
      <div className="mb-3 flex items-center">
        <span className="mr-2 text-xl">{getIcon(event.type)}</span>
        <div>
          <h3 className="m-0 text-sm font-semibold text-white">
            {event.tasks.length} Task{event.tasks.length !== 1 ? "s" : ""} Need
            Attention
          </h3>
          <p
            className={`${colorScheme.text} m-0 text-xs uppercase tracking-wide`}
          >
            {event.type} Priority
          </p>
        </div>
      </div>

      {/* Task list */}
      <div className="mb-3">
        {event.tasks.slice(0, 2).map((task, index) => (
          <TaskItem
            key={`${task.name}-${index}`}
            task={task}
            colorScheme={colorScheme}
          />
        ))}

        {event.tasks.length > 2 && (
          <div className={`py-2 text-center ${colorScheme.text} text-xs`}>
            +{event.tasks.length - 2} more task
            {event.tasks.length - 2 !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onDismiss}
          className="cursor-pointer rounded border border-white/20 
                     bg-white/10 px-3 py-1.5 text-xs text-white transition-colors 
                     duration-200 hover:bg-white/20"
        >
          Dismiss
        </button>

        <a
          href="http://localhost:3000/dashboard"
          target="_blank"
          className={`${colorScheme.border.replace("border-", "bg-")} rounded
                      px-3 py-1.5 text-xs font-medium text-white no-underline 
                      transition-opacity duration-200 hover:opacity-80`}
        >
          View Dashboard →
        </a>
      </div>
    </div>
  )
}

// Main container component with state management
export const NotificationContainer = () => {
  const [state, setState] = useState<NotificationState>({
    event: null,
    isVisible: false,
  })
  const timeoutRef = useRef<number | null>(null)

  // Message listener effect
  useEffect(() => {
    const handleMessage = (message: any): void => {
      if (message.type === "TASK_UPDATE" && message.event) {
        showNotification(message.event)
      }
    }

    browser.runtime.onMessage.addListener(handleMessage)
    return (): void => browser.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const showNotification = (event: TaskEvent): void => {
    // Hide if no tasks or already visible
    if (event.type === "none" || event.tasks.length === 0) {
      hideNotification()
      return
    }

    if (state.isVisible) return

    setState({ event, isVisible: true })

    // Auto-hide with appropriate delay
    const hideDelay = event.type === "critical" ? 10000 : 5000
    timeoutRef.current = window.setTimeout(hideNotification, hideDelay)
  }

  const hideNotification = (): void => {
    setState((prev) => ({ ...prev, isVisible: false }))

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  // Cleanup effect
  useEffect(() => {
    return (): void => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  if (!state.isVisible || !state.event) {
    return null
  }

  return (
    <div
      className={`
        pointer-events-auto fixed right-5 top-5 z-[999999] font-sans
        transition-transform duration-300 ease-in-out
        ${state.isVisible ? "translate-x-0" : "translate-x-full"}
      `}
    >
      <TaskNotification event={state.event} onDismiss={hideNotification} />
    </div>
  )
}

// Utility functions for external use (like Storybook)
export { getTaskColor, getMostUrgentTask, formatTimeOverdue, getIcon }

// Functional initialization
export const initializeTaskNotifications = (): void => {
  // Create container element
  const container = document.createElement("div")
  container.id = "cyclical-tasks-notification"
  document.body.appendChild(container)

  // Render our functional component
  render(<NotificationContainer />, container)
}
