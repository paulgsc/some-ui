import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

// Assuming your vanilla file is named overlay-card.ts in the same directory
import type { OverlayCard, OverlaySong } from "."
import { createOverlayCard } from "."

import "@mujik/styles/content.css"

// ── Bridge ──────────────────────────────────────────────────────────────────

/**
 * The Bridge takes the OverlaySong props and manages the lifecycle
 * of the vanilla OverlayCard instance.
 */
const OverlayCardBridge = (props: OverlaySong) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardInstanceRef = useRef<OverlayCard | null>(null)

  // Initialization: Create the instance once
  useEffect(() => {
    if (containerRef.current && !cardInstanceRef.current) {
      const card = createOverlayCard()
      cardInstanceRef.current = card
      containerRef.current.appendChild(card.root)

      // Optional: If your canvas needs a specific size for waveform drawing
      card.canvas.width = 400
      card.canvas.height = 150
    }

    return () => {
      cardInstanceRef.current?.destroy()
      cardInstanceRef.current = null
    }
  }, [])

  // Update: Call the vanilla update method when props change
  useEffect(() => {
    if (cardInstanceRef.current) {
      cardInstanceRef.current.update(props)
    }
  }, [props])

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "400px",
        background: "#0a0a0a",
      }}
    />
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<OverlaySong> = {
  title: "Extensions/Mujik/OverlayCard",
  component: OverlayCardBridge,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  argTypes: {
    valence: { control: { type: "range", min: 0, max: 1, step: 0.1 } },
    arousal: { control: { type: "range", min: 0, max: 1, step: 0.1 } },
    intensity: { control: { type: "range", min: 0, max: 1, step: 0.1 } },
    currentTime: { control: "number" },
    duration: { control: "number" },
  },
}

export default meta
type Story = StoryObj<OverlaySong>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    title: "After Dark",
    artist: "Mr.Kitty",
    videoId: "sVx1mJDeUjY",
    thumbnailUrl: "",
    currentTime: 45,
    duration: 257,
    valence: 0.2,
    arousal: 0.3,
    tempo: 140,
    intensity: 0.6,
  },
}

export const EuphoricState: Story = {
  args: {
    ...Default.args,
    title: "Sunlight",
    artist: "Lane 8",
    valence: 0.9,
    arousal: 0.8,
  },
}

export const MelancholicState: Story = {
  args: {
    ...Default.args,
    title: "In the End",
    artist: "Linkin Park",
    valence: 0.1,
    arousal: 0.2,
  },
}

export const ComparisonView: Story = {
  render: (args) => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}
    >
      <div>
        <h4 style={{ color: "white", marginBottom: "10px" }}>Low Valence</h4>
        <OverlayCardBridge {...args} valence={0.1} title="Sad Vibes" />
      </div>
      <div>
        <h4 style={{ color: "white", marginBottom: "10px" }}>High Valence</h4>
        <OverlayCardBridge {...args} valence={0.9} title="Happy Vibes" />
      </div>
    </div>
  ),
}
