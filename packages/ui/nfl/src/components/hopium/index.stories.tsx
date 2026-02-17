import { buildMoodEvents } from "@nfl/data/hopium/events"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Hopium } from "."

type Meta = MetaObj<typeof Hopium>
type Story = StoryObj<typeof Hopium>

const meta: Meta = {
  title: "UI/NFL/Components/Hopium/Dashboard",
  component: Hopium,
  parameters: {
    layout: "fullscreen",
  },
  // Provide the data at the meta level so all stories have it by default
  args: {
    seasonEvents: buildMoodEvents(),
  },
}

export default meta

export const Default: Story = {}

export const EmptyState: Story = {
  args: {
    seasonEvents: [],
  },
}

export const PlayoffPush: Story = {
  args: {
    // You could slice or filter the events here to show a specific scenario
    seasonEvents: buildMoodEvents().slice(10),
  },
}
