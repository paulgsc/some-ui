
import "@tab/styles/content.css"

import { useEffect, useRef } from "react"
import type { BadgeTier } from "@tab/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { Timer } from "@tab/ui/timer"

// ── Bridge ──────────────────────────────────────────────────────────────────

interface TimerBridgeProps {
  text?: string
  tier?: BadgeTier
}

const TimerBridge = ({ text = "00:00", tier = "green" }: TimerBridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const instance = useRef<Timer | null>(null)

  useEffect(() => {
    if (containerRef.current && !instance.current) {
      instance.current = new Timer()
      containerRef.current.appendChild(instance.current.getElement())
    }
    instance.current?.update(text, tier)

    return () => {
      instance.current?.getElement().remove()
      instance.current = null
    }
  }, [text, tier])

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 16px",
        background: "rgba(8,8,12,0.9)",
        borderRadius: 8,
      }}
    />
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<TimerBridgeProps> = {
  title: "Extensions/TabLedger/Components/Timer",
  component: TimerBridge,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  argTypes: {
    text: { control: "text" },
    tier: {
      control: "select",
      options: ["green", "amber", "red", "violet"],
    },
  },
}

export default meta
type Story = StoryObj<TimerBridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = { args: { text: "00:00", tier: "green" } }
export const FifteenMin: Story = { args: { text: "15:00", tier: "amber" } }
export const FortyFiveMin: Story = { args: { text: "45:00", tier: "red" } }
export const NinetyMin: Story = { args: { text: "1h 30m", tier: "violet" } }

export const AllTiers: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "rgba(8,8,12,0.9)",
        padding: 16,
        borderRadius: 10,
      }}
    >
      <TimerBridge text="00:00" tier="green" />
      <TimerBridge text="14:59" tier="green" />
      <TimerBridge text="15:00" tier="amber" />
      <TimerBridge text="45:00" tier="red" />
      <TimerBridge text="1h 30m" tier="violet" />
    </div>
  ),
}
