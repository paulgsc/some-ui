import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { MetricsPanel } from "."

type Story = StoryObj<typeof MetricsPanel>
type Meta = MetaObj<typeof MetricsPanel>

export default {
  title: "UI/Makjang/Components/CDrama/MetricsPanel",
  component: MetricsPanel,
  args: {
    overallRating: 8.6,
    likelihoodToFinish: 9.2,
    rewatchValue: 7.4,
  },
} satisfies Meta

// --- Stories --------------------------------------------------------------

export const Default: Story = {}

export const Masterpiece: Story = {
  args: {
    overallRating: 9.4,
    likelihoodToFinish: 9.8,
    rewatchValue: 9.0,
  },
}

export const Excellent: Story = {
  args: {
    overallRating: 8.1,
    likelihoodToFinish: 8.3,
    rewatchValue: 7.7,
  },
}

export const Good: Story = {
  args: {
    overallRating: 6.7,
    likelihoodToFinish: 7.2,
    rewatchValue: 6.5,
  },
}

export const Mediocre: Story = {
  args: {
    overallRating: 5.1,
    likelihoodToFinish: 6.0,
    rewatchValue: 4.3,
  },
}

export const Disappointing: Story = {
  args: {
    overallRating: 3.2,
    likelihoodToFinish: 2.9,
    rewatchValue: 2.5,
  },
}

export const HighRewatchValue: Story = {
  args: {
    overallRating: 7.4,
    likelihoodToFinish: 6.8,
    rewatchValue: 9.6,
  },
}

export const LowLikelihoodToFinish: Story = {
  args: {
    overallRating: 7.8,
    likelihoodToFinish: 3.2,
    rewatchValue: 6.1,
  },
}

export const PeachBlossomTheme: Story = {
  parameters: {
    backgrounds: {
      default: "light",
    },
  },
  args: {
    overallRating: 8.9,
    likelihoodToFinish: 9.1,
    rewatchValue: 8.4,
  },
}
