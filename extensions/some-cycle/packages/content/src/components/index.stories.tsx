import { useState } from "react"
import type { Task, TaskEvent } from "@/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { TaskItem, TaskNotification } from "."

// Mock data for stories
const mockTasks: Array<Task> = [
  {
    id: "1",
    name: "Water the plants",
    urgency: "high",
    intervalMs: 24 * 60 * 60 * 1000, // 1 day
    lastCompleted: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
    category: "home",
  },
  {
    id: "2",
    name: "Take vitamins",
    urgency: "critical",
    intervalMs: 24 * 60 * 60 * 1000, // 1 day
    lastCompleted: Date.now() - 6 * 60 * 60 * 1000, // 6 hours ago
    category: "health",
  },
  {
    id: "3",
    name: "Clean the kitchen",
    urgency: "medium",
    intervalMs: 3 * 24 * 60 * 60 * 1000, // 3 days
    lastCompleted: Date.now() - 4 * 24 * 60 * 60 * 1000, // 4 days ago
    category: "home",
  },
  {
    id: "4",
    name: "Exercise routine",
    urgency: "low",
    intervalMs: 2 * 24 * 60 * 60 * 1000, // 2 days
    lastCompleted: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    category: "fitness",
  },
  {
    id: "5",
    name: "Weekly grocery shopping",
    urgency: "medium",
    intervalMs: 7 * 24 * 60 * 60 * 1000, // 1 week
    lastCompleted: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
    category: "errands",
  },
  {
    id: "6",
    name: "This is a very long task name that should demonstrate how the component handles text truncation",
    urgency: "high",
    intervalMs: 24 * 60 * 60 * 1000,
    lastCompleted: Date.now() - 1 * 24 * 60 * 60 * 1000,
    category: "home",
  },
]

const createMockEvent = (
  type: TaskEvent["type"],
  tasks: Array<Task>
): TaskEvent => ({
  type,
  tasks,
  timestamp: Date.now(),
})

// Named events for the interactive container demo below.
const sampleEvents = {
  critical: createMockEvent("critical", [mockTasks[1]]),
  warning: createMockEvent("warning", [mockTasks[0], mockTasks[5]]),
  reminder: createMockEvent("reminder", [mockTasks[2], mockTasks[4]]),
  multiple: createMockEvent("warning", mockTasks.slice(0, 5)),
}

// TaskNotification Stories
const meta: Meta<typeof TaskNotification> = {
  title: "Extensions/TaskNotification",
  component: TaskNotification,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#1a1a1a" },
        { name: "light", value: "#ffffff" },
        { name: "purple", value: "#2d1b69" },
      ],
    },
  },
  tags: ["autodocs"],
  argTypes: {
    event: {
      description: "The task event containing tasks and metadata",
      control: false,
    },
    onDismiss: {
      description: "Callback function when notification is dismissed",
      action: "dismissed",
    },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: "400px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof meta>

// Critical urgency notification
export const Critical: Story = {
  args: {
    event: createMockEvent("critical", [mockTasks[1]]),
    onDismiss: () => {},
  },
}

// High urgency with multiple tasks
export const HighUrgency: Story = {
  args: {
    event: createMockEvent("warning", [mockTasks[0], mockTasks[5]]),
    onDismiss: () => {},
  },
}

// Medium urgency
export const MediumUrgency: Story = {
  args: {
    event: createMockEvent("reminder", [mockTasks[2], mockTasks[4]]),
    onDismiss: () => {},
  },
}

// Low urgency
export const LowUrgency: Story = {
  args: {
    event: createMockEvent("reminder", [mockTasks[3]]),
    onDismiss: () => {},
  },
}

// Many tasks (shows truncation behavior)
export const ManyTasks: Story = {
  args: {
    event: createMockEvent("warning", mockTasks.slice(0, 5)),
    onDismiss: () => {},
  },
}

// Different time overdue formats
export const VariousTimeFormats: Story = {
  args: {
    event: createMockEvent("warning", [
      {
        ...mockTasks[0],
        lastCompleted: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
        name: "Task overdue by hours",
      },
      {
        ...mockTasks[1],
        lastCompleted: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
        name: "Task overdue by days",
      },
      {
        ...mockTasks[2],
        lastCompleted: Date.now() - 30 * 60 * 1000, // 30 minutes ago
        name: "Recently overdue task",
      },
    ]),
    onDismiss: () => {},
  },
}

// Empty state (should not render)
export const EmptyTasks: Story = {
  args: {
    event: createMockEvent("none", []),
    onDismiss: () => {},
  },
}

// TaskItem Component Stories
export const TaskItemStories = {
  title: "Extensions/TaskItem",
  component: TaskItem,
  parameters: {
    layout: "padded",
    backgrounds: {
      default: "dark",
      values: [{ name: "dark", value: "#1f2937" }],
    },
  },
  decorators: [
    (Story: any) => (
      <div
        style={{
          width: "320px",
          padding: "16px",
          backgroundColor: "#1f2937",
          borderRadius: "12px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <Story />
      </div>
    ),
  ],
} as Meta<typeof TaskItem>

export const CriticalTask: StoryObj<typeof TaskItem> = {
  ...TaskItemStories,
  args: {
    task: mockTasks[1],
    colorScheme: {
      bg: "bg-red-900",
      border: "border-red-600",
      text: "text-red-300",
    },
  },
}

export const HighUrgencyTask: StoryObj<typeof TaskItem> = {
  ...TaskItemStories,
  args: {
    task: mockTasks[0],
    colorScheme: {
      bg: "bg-orange-900",
      border: "border-orange-500",
      text: "text-orange-300",
    },
  },
}

export const MediumUrgencyTask: StoryObj<typeof TaskItem> = {
  ...TaskItemStories,
  args: {
    task: mockTasks[2],
    colorScheme: {
      bg: "bg-yellow-900",
      border: "border-yellow-600",
      text: "text-yellow-300",
    },
  },
}

export const LowUrgencyTask: StoryObj<typeof TaskItem> = {
  ...TaskItemStories,
  args: {
    task: mockTasks[3],
    colorScheme: {
      bg: "bg-blue-900",
      border: "border-blue-500",
      text: "text-blue-300",
    },
  },
}

export const LongTaskName: StoryObj<typeof TaskItem> = {
  ...TaskItemStories,
  args: {
    task: mockTasks[5], // The long name task
    colorScheme: {
      bg: "bg-orange-900",
      border: "border-orange-500",
      text: "text-orange-300",
    },
  },
}

// Interactive playground story
export const Playground: Story = {
  args: {
    event: createMockEvent("warning", [mockTasks[0], mockTasks[1]]),
    onDismiss: () => {},
  },
  parameters: {
    docs: {
      description: {
        story:
          "Interactive playground to test different notification states and behaviors.",
      },
    },
  },
}

const NotificationContainer = () => {
  const [state, setState] = useState<{
    event: TaskEvent | null
    isVisible: boolean
  }>({
    event: null,
    isVisible: false,
  })

  const showNotification = (event: TaskEvent) => {
    if (event.type === "none" || event.tasks.length === 0) {
      setState({ event: null, isVisible: false })
      return
    }

    setState({ event, isVisible: true })

    // Auto-hide after delay
    const hideDelay = event.type === "critical" ? 10000 : 5000
    setTimeout(() => {
      setState((prev) => ({ ...prev, isVisible: false }))
    }, hideDelay)
  }

  const hideNotification = () => {
    setState((prev) => ({ ...prev, isVisible: false }))
  }

  if (!state.isVisible || !state.event) {
    return (
      <div className="space-y-4 p-6">
        <h3 className="text-lg font-bold">Notification Container Demo</h3>
        <p className="text-gray-600">
          Click a button to trigger a notification:
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => showNotification(sampleEvents.critical)}
            className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
          >
            Critical Alert
          </button>
          <button
            onClick={() => showNotification(sampleEvents.warning)}
            className="rounded bg-orange-500 px-4 py-2 text-white hover:bg-orange-600"
          >
            Warning
          </button>
          <button
            onClick={() => showNotification(sampleEvents.reminder)}
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Reminder
          </button>
          <button
            onClick={() => showNotification(sampleEvents.multiple)}
            className="rounded bg-purple-500 px-4 py-2 text-white hover:bg-purple-600"
          >
            Multiple Tasks
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-96 w-full">
      <div
        className={`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    pointer-events-auto fixed right-5 top-5 z-[999999] font-sans
                                                                                                                                                                                                                                                                                                                                                                                                                                                                              transition-transform duration-300 ease-in-out
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ${state.isVisible ? "translate-x-0" : "translate-x-full"}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                `}
      >
        <TaskNotification event={state.event} onDismiss={hideNotification} />
      </div>
    </div>
  )
}

// NotificationContainer Stories (full integration)
export const ContainerStories = {
  title: "Extensions/NotificationContainer",
  component: NotificationContainer,
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#f5f5f5" },
        { name: "dark", value: "#1a1a1a" },
      ],
    },
  },
  decorators: [
    (Story: any) => (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          position: "relative",
          backgroundColor: "var(--sb-background-color, #f5f5f5)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            padding: "12px 16px",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            fontSize: "14px",
            color: "#666",
          }}
        >
          The notification container will appear in the top-right corner
        </div>
        <Story />
      </div>
    ),
  ],
} as Meta<typeof NotificationContainer>

export const FullContainer: StoryObj<typeof NotificationContainer> = {
  ...ContainerStories,
  parameters: {
    docs: {
      description: {
        story:
          "Complete notification container as it would appear on a webpage. The container manages its own state and positioning.",
      },
    },
  },
}
