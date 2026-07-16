import { CHALLENGES } from "@leetype/data/leetype"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SessionConfig } from "."

const meta: Meta<typeof SessionConfig> = {
  title: "UI/Input/Components/Typing/SessionConfig",
  component: SessionConfig,
  parameters: { layout: "padded" },
  argTypes: {
    onStart: { action: "session started" },
    onBack: { action: "back pressed" },
  },
}

export default meta
type Story = StoryObj<typeof SessionConfig>

const dsChallenge = CHALLENGES.find((c) => c.id === "ds-linked-list")!
const medChallenge = CHALLENGES.find((c) => c.id === "ds-binary-tree")!
const hardChallenge = CHALLENGES.find((c) => c.id === "ds-min-heap")!
const algoChallenge = CHALLENGES.find((c) => c.id === "algo-merge-sort")!

export const EasyDataStructure: Story = {
  args: { challenge: dsChallenge },
}

export const MediumDataStructure: Story = {
  args: { challenge: medChallenge },
}

export const HardMode: Story = {
  args: { challenge: hardChallenge },
  parameters: {
    docs: {
      description: {
        story: "Hard mode — source always hidden, no adaptive toggle",
      },
    },
  },
}

export const AlgorithmChallenge: Story = {
  args: { challenge: algoChallenge },
  parameters: {
    docs: {
      description: { story: "Algorithm mode — shows N context selector" },
    },
  },
}
