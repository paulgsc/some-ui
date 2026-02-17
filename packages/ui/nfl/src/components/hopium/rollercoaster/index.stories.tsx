import { useMemo } from "react"
import { RollercoasterChart } from "@nfl/components/hopium/rollercoaster"
import { buildMoodEvents } from "@nfl/data/hopium/events"
import type { MoodEvent } from "@nfl/types/hopium/hopium-tracker"
import type { Meta, StoryObj } from "@storybook/react-vite"

type Story = StoryObj<typeof RollercoasterChart>

// Helper to transform partial data into valid MoodEvents
const createMockEvent = (
  overrides: Partial<MoodEvent> & { week: number; mood: number }
): MoodEvent => ({
  id: Math.random(),
  index: overrides.week - 1,
  label: overrides.label ?? `W${overrides.week}`,
  description: "Mock event description",
  team: "Mock Team",
  category: "General",
  delta: 0, // Default delta
  ...overrides,
})

const meta: Meta<typeof RollercoasterChart> = {
  title: "UI/NFL/Components/Hopium/RollercoasterChart",
  component: RollercoasterChart,
  tags: ["autodocs"],
  args: {
    animationDuration: 600,
  },
  argTypes: {
    currentIndex: {
      control: { type: "number", min: 0, max: 17 },
      description: "Index of the currently highlighted game week",
    },
    animationDuration: {
      control: { type: "number", min: 100, max: 2000, step: 100 },
      description: "Duration of the line animation in milliseconds",
    },
  },
}

export default meta

const Template: Story = {
  render: (args) => {
    const events = useMemo(() => buildMoodEvents(), [])
    return (
      <div className="h-96 w-full bg-slate-900 p-4 text-white">
        <RollercoasterChart {...args} events={events} />
      </div>
    )
  },
}

export const Default: Story = {
  ...Template,
  args: { currentIndex: 8 },
}

// Peak highs and lows — Fixed with helper
export const HighDrama: Story = {
  render: (args) => {
    const dramaticEvents: Array<MoodEvent> = [
      { week: 1, mood: 40, label: "L" },
      { week: 2, mood: 85, label: "W" },
      { week: 3, mood: 30, label: "L" },
      { week: 4, mood: 95, label: "W" },
      { week: 5, mood: 50, label: "W" },
      { week: 6, mood: 20, label: "L" },
      { week: 7, mood: 100, label: "W" },
      { week: 8, mood: 60, label: "T" },
      { week: 9, mood: 80, label: "W" },
      { week: 10, mood: 45, label: "L" },
      { week: 11, mood: 90, label: "W" },
      { week: 12, mood: 35, label: "L" },
      { week: 13, mood: 75, label: "W" },
      { week: 14, mood: 55, label: "L" },
      { week: 15, mood: 92, label: "W" },
      { week: 16, mood: 65, label: "W" },
      { week: 17, mood: 88, label: "W" },
    ].map((e) => createMockEvent(e))

    return (
      <div className="h-96 w-full bg-slate-900 p-4 text-white">
        <RollercoasterChart
          {...args}
          events={dramaticEvents}
          currentIndex={10}
        />
      </div>
    )
  },
}

// Smooth season — Fixed with helper
export const LowVariance: Story = {
  render: (args) => {
    const calmEvents: Array<MoodEvent> = Array.from({ length: 17 }, (_, i) =>
      createMockEvent({
        week: i + 1,
        mood: 70 + Math.sin(i) * 5,
        label: i % 2 === 0 ? "W" : "L",
      })
    )

    return (
      <div className="h-96 w-full bg-slate-900 p-4 text-white">
        <RollercoasterChart {...args} events={calmEvents} currentIndex={8} />
      </div>
    )
  },
}

export const EmptyState: Story = {
  args: {
    events: [],
    currentIndex: 0,
  },
  render: (args) => (
    <div className="h-96 w-full bg-slate-900 p-4 text-white">
      <RollercoasterChart {...args} />
    </div>
  ),
}
