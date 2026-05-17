import { useState } from "react"
import type { MotifPoint } from "@portfolio/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { MotifPanel } from "."

function uuid() {
  return Math.random().toString(36).slice(2, 8)
}

const SEED_POINTS: Array<MotifPoint> = [
  {
    id: "1",
    text: "short premium strangle around weekly NVDA ATR",
    checked: true,
  },
  { id: "2", text: "targeting theta decay within 1σ range", checked: false },
  {
    id: "3",
    text: "no directional bias — delta-neutral entry",
    checked: false,
  },
  {
    id: "4",
    text: "exit at 50% max profit or 21 DTE, whichever first",
    checked: false,
  },
]

const Controlled: React.FC<{ initial: Array<MotifPoint> }> = ({ initial }) => {
  const [points, setPoints] = useState(initial)

  const toggle = (id: string) =>
    setPoints((ps) =>
      ps.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p))
    )
  const add = (text: string) =>
    setPoints((ps) => [...ps, { id: uuid(), text, checked: false }])
  const remove = (id: string) =>
    setPoints((ps) => ps.filter((p) => p.id !== id))
  const update = (id: string, text: string) =>
    setPoints((ps) => ps.map((p) => (p.id === id ? { ...p, text } : p)))

  return (
    <MotifPanel
      points={points}
      onToggle={toggle}
      onAdd={add}
      onRemove={remove}
      onUpdate={update}
    />
  )
}

type Story = StoryObj<typeof MotifPanel>

export default {
  title: "Sandlot/Components/MotifPanel",
  component: MotifPanel,
  parameters: { layout: "padded" },
} as Meta<typeof MotifPanel>

export const WithPoints: Story = {
  render: () => <Controlled initial={SEED_POINTS} />,
}

export const Empty: Story = {
  render: () => <Controlled initial={[]} />,
}

export const AllChecked: Story = {
  render: () => (
    <Controlled initial={SEED_POINTS.map((p) => ({ ...p, checked: true }))} />
  ),
}
