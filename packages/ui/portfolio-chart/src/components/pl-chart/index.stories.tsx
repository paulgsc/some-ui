import type { Meta, StoryObj } from "@storybook/react-vite"
import type { PLPoint } from "@portfolio/types"
import { PLChart } from "."

// ── helpers ──────────────────────────────────────────────────────────────────

function ironCondorCurve(centerSpot = 118): Array<PLPoint> {
  const lo = centerSpot * 0.7
  const hi = centerSpot * 1.3
  return Array.from({ length: 120 }, (_, i) => {
    const spot = lo + ((hi - lo) * i) / 119
    const maxProfit = 230
    const beLeft = centerSpot * 0.88
    const beRight = centerSpot * 1.13
    let pl: number
    if (spot < beLeft)        pl = Math.max(-770, maxProfit - (beLeft - spot) * 77)
    else if (spot > beRight)  pl = Math.max(-770, maxProfit - (spot - beRight) * 77)
    else                      pl = maxProfit
    return { spot, pl }
  })
}

function shortCallCurve(strike = 130, premium = 210, centerSpot = 118): Array<PLPoint> {
  const lo = centerSpot * 0.7
  const hi = centerSpot * 1.3
  return Array.from({ length: 120 }, (_, i) => {
    const spot = lo + ((hi - lo) * i) / 119
    const pl = spot <= strike ? premium : premium - (spot - strike) * 100
    return { spot, pl }
  })
}

// ── story ─────────────────────────────────────────────────────────────────────

type Story = StoryObj<typeof PLChart>

export default {
  title: "Sandlot/Components/PLChart",
  component: PLChart,
  parameters: { layout: "padded" },
  argTypes: {
    spot: { control: { type: "range", min: 80, max: 160, step: 0.5 } },
  },
} as Meta<typeof PLChart>

export const IronCondor: Story = {
  args: {
    curve: ironCondorCurve(118),
    spot: 118,
    breakevens: [103.8, 133.4],
    className: "h-64",
  },
}

export const IronCondorOffCenter: Story = {
  args: {
    ...IronCondor.args,
    spot: 128,
  },
}

export const ShortCall: Story = {
  args: {
    curve: shortCallCurve(130, 210, 118),
    spot: 118,
    breakevens: [132.1],
    className: "h-64",
  },
}

export const EmptyCurve: Story = {
  args: {
    curve: [],
    spot: 118,
    breakevens: [],
    className: "h-64",
  },
}
