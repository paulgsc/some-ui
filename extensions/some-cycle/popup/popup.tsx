import "@some-ui/styles/tailwind.css"

import type { FC, JSX } from "react"
import { useEffect, useState } from "react"
import type { Task, TaskEvent } from "@/types"
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Zap,
} from "lucide-react"
import { createRoot } from "react-dom/client"
import browser from "webextension-polyfill"

const TaskPopup: FC = () => {
  const [taskEvent, setTaskEvent] = useState<TaskEvent | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadTaskData()

    // Listen for updates from background script
    const handleMessage = (message: any): void => {
      if (message.type === "TASK_UPDATE") {
        setTaskEvent(message.event)
      }
    }

    browser.runtime.onMessage.addListener(handleMessage)
    return (): void => browser.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const loadTaskData = async (): Promise<void> => {
    try {
      const result = await browser.storage.local.get([
        "lastTaskEvent",
        "lastEventTime",
      ])
      if (result.lastTaskEvent) {
        setTaskEvent(result.lastTaskEvent)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load task data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return "just now"
  }

  const getUrgencyColor = (urgency: string, type: string = "bg"): string => {
    const colors = {
      critical:
        type === "bg"
          ? "bg-red-500"
          : type === "text"
            ? "text-red-400"
            : "border-red-400",
      high:
        type === "bg"
          ? "bg-orange-500"
          : type === "text"
            ? "text-orange-400"
            : "border-orange-400",
      medium:
        type === "bg"
          ? "bg-yellow-500"
          : type === "text"
            ? "text-yellow-400"
            : "border-yellow-400",
      low:
        type === "bg"
          ? "bg-blue-500"
          : type === "text"
            ? "text-blue-400"
            : "border-blue-400",
    }
    return colors[urgency as keyof typeof colors] || colors.low
  }

  const getEventIcon = (eventType: string): JSX.Element => {
    switch (eventType) {
      case "critical": {
        return <Zap className="size-5 text-red-400" />
      }
      case "warning": {
        return <AlertTriangle className="size-5 text-orange-400" />
      }
      case "reminder": {
        return <Clock className="size-5 text-blue-400" />
      }
      default: {
        return <CheckCircle className="size-5 text-green-400" />
      }
    }
  }

  const getEventTitle = (eventType: string): string => {
    switch (eventType) {
      case "critical": {
        return "Critical Tasks Overdue"
      }
      case "warning": {
        return "Important Tasks Pending"
      }
      case "reminder": {
        return "Tasks Need Attention"
      }
      default: {
        return "All Tasks Up to Date"
      }
    }
  }

  const calculateOverdueAmount = (task: Task): string => {
    const overdueMs = Date.now() - (task.lastCompleted + task.intervalMs)
    const overdueHours = Math.floor(overdueMs / (1000 * 60 * 60))
    const overdueDays = Math.floor(overdueHours / 24)

    if (overdueDays > 0) return `${overdueDays}d overdue`
    if (overdueHours > 0) return `${overdueHours}h overdue`
    return "recently overdue"
  }

  if (isLoading) {
    return (
      <div className="flex h-64 w-80 items-center justify-center bg-gray-900 p-6 text-white">
        <RefreshCw className="size-6 animate-spin text-blue-400" />
      </div>
    )
  }

  if (!taskEvent || taskEvent.type === "none" || taskEvent.tasks.length === 0) {
    return (
      <div className="w-80 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
        <div className="p-6">
          <div className="mb-4 flex items-center space-x-3">
            <CheckCircle className="size-6 text-green-400" />
            <h2 className="text-lg font-semibold">All Clear!</h2>
          </div>
          <p className="mb-4 text-gray-300">No overdue tasks at the moment.</p>
          <div className="rounded-lg border border-green-400/20 bg-green-500/10 p-3">
            <p className="text-sm text-green-400">
              ✓ All cyclical tasks are up to date
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white shadow-2xl">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-center space-x-3">
          {getEventIcon(taskEvent.type)}
          <div>
            <h2 className="text-lg font-semibold">
              {getEventTitle(taskEvent.type)}
            </h2>
            <p className="text-sm text-gray-400">
              {taskEvent.tasks.length} task
              {taskEvent.tasks.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Task List */}
        <div className="mb-6 space-y-3">
          {taskEvent.tasks.map((task) => (
            <div
              key={task.id}
              className={`rounded-lg border p-4 transition-all hover:shadow-lg ${getUrgencyColor(task.urgency, "border")}/30 bg-gray-800/50`}
            >
              <div className="mb-2 flex items-start justify-between">
                <h3 className="flex-1 truncate font-medium text-white">
                  {task.name}
                </h3>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${getUrgencyColor(task.urgency)} ml-2 flex-shrink-0 text-white`}
                >
                  {task.urgency}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="capitalize text-gray-400">
                  {task.category}
                </span>
                <span
                  className={`font-medium ${getUrgencyColor(task.urgency, "text")}`}
                >
                  {calculateOverdueAmount(task)}
                </span>
              </div>

              <div className="mt-2 text-xs text-gray-500">
                Last: {formatTimeAgo(task.lastCompleted)}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">
              Updated {formatTimeAgo(taskEvent.timestamp)}
            </span>
            <button
              onClick={() =>
                window.open("http://localhost:3000/dashboard", "_blank")
              }
              className="flex items-center space-x-1 text-blue-400 transition-colors hover:text-blue-300"
            >
              <span>Dashboard</span>
              <ExternalLink className="size-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Pulsing indicator for critical tasks */}
      {taskEvent.type === "critical" && (
        <div className="absolute right-2 top-2">
          <div className="size-3 animate-pulse rounded-full bg-red-500" />
        </div>
      )}
    </div>
  )
}

// Mount the component
const container = document.getElementById("popup-root")
if (container) {
  const root = createRoot(container)
  root.render(<TaskPopup />)
}
