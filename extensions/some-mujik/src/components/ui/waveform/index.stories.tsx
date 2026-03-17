import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

// Assuming the file is waveform-renderer.ts
import type { WaveformParams, WaveformRenderer } from "."
import { createWaveformRenderer } from "."

// ── Bridge ──────────────────────────────────────────────────────────────────

const WaveformBridge = (props: WaveformParams) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<WaveformRenderer | null>(null)

  // Initialization: Mount the renderer once
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = createWaveformRenderer(canvasRef.current, props)
    }

    return () => {
      rendererRef.current?.destroy()
      rendererRef.current = null
    }
  }, []) // Empty dependency array: mount once

  // Updates: Push param changes to the existing renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.updateParams(props)
    }
  }, [props.tempo, props.intensity, props.valence, props.arousal])

  return (
    <div
      style={{
        background: "#000",
        padding: "20px",
        borderRadius: "8px",
        display: "inline-block",
        border: "1px solid #333",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "400px",
          height: "150px",
          display: "block",
        }}
      />
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<WaveformParams> = {
  title: "Extensions/Mujik/Visualizer/WaveformRenderer",
  component: WaveformBridge,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  argTypes: {
    tempo: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    intensity: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    valence: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    arousal: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
  },
}

export default meta
type Story = StoryObj<WaveformParams>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Chill: Story = {
  args: {
    tempo: 0.2,
    intensity: 0.2,
    valence: 0.8,
    arousal: 0.2,
  },
}

export const Aggressive: Story = {
  args: {
    tempo: 0.8,
    intensity: 0.9,
    valence: 0.1,
    arousal: 0.9,
  },
}

export const Euphoric: Story = {
  args: {
    tempo: 0.6,
    intensity: 0.7,
    valence: 0.9,
    arousal: 0.7,
  },
}

export const Comparison: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <div style={{ color: "#888", marginBottom: "4px", fontSize: "12px" }}>
          HIGH AROUSAL (TENSE/ACTIVE)
        </div>
        <WaveformBridge {...args} arousal={0.9} intensity={0.8} />
      </div>
      <div>
        <div style={{ color: "#888", marginBottom: "4px", fontSize: "12px" }}>
          LOW AROUSAL (CALM/DREAMY)
        </div>
        <WaveformBridge {...args} arousal={0.1} intensity={0.2} />
      </div>
    </div>
  ),
}
