import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { TopBar } from "."

type Story = StoryObj<typeof TopBar>

const meta: Meta<typeof TopBar> = {
  title: "Sandlot/Components/TopBar",
  component: TopBar,
  parameters: { layout: "fullscreen" },
  args: {
    spot: 118.4,
    positionName: "NVDA IC Jan17",
    archetypeDesc:
      "range-bound income · theta decay · defined risk on both wings",
    onPositionNameChange: () => {},
    onReset: () => {},
  },
}

export default meta

export const IronCondor: Story = {
  args: { archetype: "iron condor" },
}

export const ShortStrangle: Story = {
  args: {
    archetype: "short strangle",
    archetypeDesc: "high theta income · neutral bias · wing risk unprotected",
    positionName: "NVDA strangle Jan24",
  },
}

export const Custom: Story = {
  args: {
    archetype: "custom",
    archetypeDesc: "custom multi-leg position",
    positionName: "misc legs",
  },
}

export const Editable: Story = {
  render: (args) => {
    const [name, setName] = useState("NVDA IC Jan17")
    return (
      <TopBar {...args} positionName={name} onPositionNameChange={setName} />
    )
  },
  args: { archetype: "iron condor" },
}
