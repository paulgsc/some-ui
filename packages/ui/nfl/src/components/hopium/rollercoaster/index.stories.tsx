import { useMemo } from "react"
import { RollercoasterChart } from "@nfl/components/hopium/rollercoaster"
import { buildMoodEvents } from "@nfl/data/hopium/events"
import type { Meta, StoryObj } from "@storybook/react-vite"

type Story = StoryObj<typeof RollercoasterChart>

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

// Base Template
const Template: Story = {
  render: (args) => {
    // Simulate season events (same as in Hopium)
    const events = useMemo(() => buildMoodEvents(), [])

    return (
      <div className="h-96 w-full bg-slate-900 p-4 text-white">
        <RollercoasterChart {...args} events={events} />
      </div>
    )
  },
}

// Default story — full season, mid-season highlight
export const Default: Story = {
  ...Template,
  args: {
    currentIndex: 8,
  },
}

// Early season focus
export const EarlySeason: Story = {
  ...Template,
  args: {
    currentIndex: 3,
  },
}

// Late season / playoffs buildup
export const LateSeason: Story = {
  ...Template,
  args: {
    currentIndex: 15,
  },
}

// Peak highs and lows — dramatic rollercoaster
export const HighDrama: Story = {
  render: () => {
    const dramaticEvents = [
      { week: 1, mood: 40, label: "L" }, // Big loss
      { week: 2, mood: 85, label: "W" },
      { week: 3, mood: 30, label: "L" }, // Crushing defeat
      { week: 4, mood: 95, label: "W" }, // Blowout win
      { week: 5, mood: 50, label: "W" },
      { week: 6, mood: 20, label: "L" }, // Worst loss
      { week: 7, mood: 100, label: "W" }, // Perfect game
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
    ]

    return (
      <div className="h-96 w-full bg-slate-900 p-4 text-white">
        <RollercoasterChart
          events={dramaticEvents}
          currentIndex={10}
          animationDuration={600}
        />
      </div>
    )
  },
}

// Smooth season — minimal mood swings
export const LowVariance: Story = {
  render: () => {
    const calmEvents = Array.from({ length: 17 }, (_, i) => ({
      week: i + 1,
      mood: 70 + Math.sin(i) * 5, // Oscillates between ~65–75
      label: i % 2 === 0 ? "W" : "L",
    }))

    return (
      <div className="h-96 w-full bg-slate-900 p-4 text-white">
        <RollercoasterChart
          events={calmEvents}
          currentIndex={8}
          animationDuration={600}
        />
      </div>
    )
  },
}

// Loading state simulation (no events)
export const EmptyState: Story = {
  render: () => {
    return (
      <div className="h-96 w-full bg-slate-900 p-4 text-white">
        <RollercoasterChart
          events={[]}
          currentIndex={0}
          animationDuration={600}
        />
      </div>
    )
  },
}

// Fast animation
export const FastAnimation: Story = {
  ...Template,
  args: {
    currentIndex: 5,
    animationDuration: 200,
  },
}

// Slow animation
export const SlowAnimation: Story = {
  ...Template,
  args: {
    currentIndex: 10,
    animationDuration: 1500,
  },
}
