import type { Meta, StoryObj } from "@storybook/react-vite"

import { MetricsBar } from "."

type Story = StoryObj<typeof MetricsBar>

export default {
  title: "Sandlot/Components/MetricsBar",
  component: MetricsBar,
  parameters: { layout: "fullscreen" },
} as Meta<typeof MetricsBar>

export const IronCondor: Story = {
  args: {
    metrics: {
      plAtSpot: 178,
      maxProfit: 230,
      maxLoss: -770,
      probProfit: 0.68,
      breakevens: [103.8, 133.4],
    },
    greeks: {
      delta: -0.04,
      gamma: -0.012,
      theta: 0.184,
      vega: -0.42,
    },
  },
}

export const ShortStrangleLoss: Story = {
  args: {
    metrics: {
      plAtSpot: -340,
      maxProfit: 340,
      maxLoss: -9660,
      probProfit: 0.58,
      breakevens: [99.3, 139.4],
    },
    greeks: {
      delta: -0.11,
      gamma: -0.028,
      theta: 0.32,
      vega: -0.81,
    },
  },
}

export const NullState: Story = {
  args: {
    metrics: {
      plAtSpot: 0,
      maxProfit: 0,
      maxLoss: 0,
      probProfit: 0,
      breakevens: [],
    },
    greeks: { delta: 0, gamma: 0, theta: 0, vega: 0 },
  },
}
