import { useState } from "react"
import type { SimState } from "@portfolio/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SimControls } from "."

type Story = StoryObj<typeof SimControls>

const Controlled: React.FC<Partial<SimState>> = (initial) => {
  const [sim, setSim] = useState<SimState>({
    spot: 118,
    dte: 21,
    ivShift: 0,
    ...initial,
  })
  return (
    <SimControls
      sim={sim}
      onSpotChange={(v) => setSim((s) => ({ ...s, spot: v }))}
      onDTEChange={(v) => setSim((s) => ({ ...s, dte: v }))}
      onIVShiftChange={(v) => setSim((s) => ({ ...s, ivShift: v }))}
    />
  )
}

export default {
  title: "Sandlot/Components/SimControls",
  component: SimControls,
  parameters: { layout: "padded" },
} as Meta<typeof SimControls>

export const Default: Story = { render: () => <Controlled /> }
export const HighIV: Story = { render: () => <Controlled ivShift={0.3} /> }
export const NearExpiry: Story = { render: () => <Controlled dte={2} /> }
