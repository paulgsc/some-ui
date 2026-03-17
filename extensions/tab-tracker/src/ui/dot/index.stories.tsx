import "@tab/styles/content.css"

import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { BadgeTier } from "@tab/types"
import { Dot } from "@tab/ui/dot"

// ── Bridge ──────────────────────────────────────────────────────────────────

type DotBridgeProps = {
  tier?: BadgeTier
  pulsing?: boolean
}

const DotBridge = ({ tier = "green", pulsing = true }: DotBridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const instance = useRef<Dot | null>(null)

  useEffect(() => {
    if (containerRef.current && !instance.current) {
      instance.current = new Dot({ tier, pulsing })
      containerRef.current.appendChild(instance.current.getElement())
    }
    instance.current?.update(tier, pulsing)

    return () => {
      instance.current?.getElement().remove()
      instance.current = null
    }
  }, [tier, pulsing])

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        background: "rgba(8,8,12,0.9)",
        borderRadius: 8,
      }}
    />
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<DotBridgeProps> = {
  title: "Extensions/TabLedger/Components/Dot",
  component: DotBridge,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  argTypes: {
    tier: {
      control: "select",
      options: ["green", "amber", "red", "violet"],
    },
    pulsing: { control: "boolean" },
  },
}

export default meta
type Story = StoryObj<DotBridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = { args: { tier: "green", pulsing: true } }
export const Amber: Story = { args: { tier: "amber", pulsing: true } }
export const Red: Story = { args: { tier: "red", pulsing: true } }
export const Violet: Story = { args: { tier: "violet", pulsing: false } }

export const AllTiers: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      {(["green", "amber", "red", "violet"] as Array<BadgeTier>).map((tier) => (
        <DotBridge key={tier} tier={tier} pulsing />
      ))}
    </div>
  ),
}
