import { attributionData } from "@attributions/data/attribution-data"
import type { Meta, StoryObj } from "@storybook/react"

import { AttributionCard } from "."

type Story = StoryObj<typeof AttributionCard>

export const Default: Story = {
  args: {
    attribution: attributionData[1],
  },
}

export default {
  title: "UI/Attributions/AttributionCard",
  component: AttributionCard,
} as Meta
