// Global type definitions for the extension

export type Task = {
  id: string
  name: string
  description?: string
  lastCompleted: number
  intervalMs: number
  urgency: "low" | "medium" | "high" | "critical"
  category: string
  tags?: Array<string>
  estimatedDuration?: number // in minutes
  location?: string
  dependencies?: Array<string> // task IDs this task depends on
}

export type TaskEvent = {
  type: "reminder" | "warning" | "critical" | "none"
  tasks: Array<Task>
  timestamp: number
  metadata?: {
    totalOverdue: number
    mostCriticalUrgency: Task["urgency"]
    categoriesAffected: Array<string>
    triggerEvent?: string
  }
}

/** The subset of a browser tab this extension ever reads off the wire. */
export type TabInfo = {
  id?: number
  url?: string
  title?: string
}

export type TabEventData = {
  event:
    | "tab_created"
    | "tab_removed"
    | "tab_switched"
    | "extension_startup"
    | "extension_installed"
  tab?: TabInfo
  timestamp: number
  userAgent?: string
}

export type ApiRequest = {
  event: string
  tab?: TabInfo
  timestamp: number
  sessionId?: string
}

export type ApiResponse = {
  success: boolean
  event: TaskEvent
  message?: string
  /** Free-form diagnostic payload; `unknown` so callers must narrow before use. */
  debug?: unknown
}

export type StorageData = {
  lastTaskEvent?: TaskEvent
  lastEventTime?: number
  userPreferences?: {
    notificationDuration: number
    showInPageNotifications: boolean
    notificationPosition:
      | "top-right"
      | "top-left"
      | "bottom-right"
      | "bottom-left"
    urgencyFilters: Array<Task["urgency"]>
  }
  sessionData?: {
    tabEventCount: number
    lastApiCall: number
    sessionStartTime: number
  }
}

// Message types for communication between scripts
export type ExtensionMessage = {
  type:
    | "TASK_UPDATE"
    | "SETTINGS_CHANGED"
    | "MANUAL_REFRESH"
    | "DISMISS_NOTIFICATION"
  event?: TaskEvent
  settings?: StorageData["userPreferences"]
  /** Per-message-type payload; `unknown` so callers must narrow before use. */
  payload?: unknown
}

// Utility types
export type UrgencyLevel = Task["urgency"]
export type EventType = TaskEvent["type"]
export type MessageType = ExtensionMessage["type"]

export {} // Make this a module
