import "@drama/components/drama-tracker/index.css"

import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import type { WidgetSize, WidgetState } from "."
import { SentimentWidget } from "."

// ── Bridge Component ─────────────────────────────────────────────────────────

type SentimentBridgeProps = {
  size?: WidgetSize
  x?: number
  y?: number
} & Partial<WidgetState>

const SentimentBridge = ({
  size = "compact",
  x = 100,
  y = 100,
  ...stateOverrides
}: SentimentBridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<SentimentWidget | null>(null)

  const defaultState: WidgetState = {
    dramaTitle: "The Glory",
    episode: "Ep 8",
    timestamp: "12:04",
    progress: 0.35, // New in v2
    activeEmotion: null,
    intensity: 0.7,
    isPlaying: true,
    ...stateOverrides,
  }

  useEffect(() => {
    if (containerRef.current && !widgetRef.current) {
      widgetRef.current = new SentimentWidget(
        containerRef.current,
        defaultState,
        {
          onEmotionSelect: (em, int, note) =>
            console.log("✨ Moment Captured:", { em, int, note }),
          onSizeChange: (s) => console.log("Size Changed:", s),
          onDragEnd: (nx, ny) => console.log("New Position:", { nx, ny }),
        }
      )

      widgetRef.current.setPosition(x, y)
      widgetRef.current.setSize(size, false)
    }

    return () => {
      widgetRef.current?.destroy()
      widgetRef.current = null
    }
  }, [])

  // Sync controls + handle the new progress property
  useEffect(() => {
    if (widgetRef.current) {
      widgetRef.current.update(stateOverrides)
      widgetRef.current.setSize(size, false)
      widgetRef.current.setPosition(x, y)
    }
  }, [stateOverrides, size, x, y])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background to simulate video player context */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          left: "40px",
          color: "rgba(255,255,255,0.2)",
          fontFamily: "sans-serif",
        }}
      >
        🎬 Video Player Context
      </div>

      <div ref={containerRef} />
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<SentimentBridgeProps> = {
  title: "Extensions/Drama/Components/SentimentWidget",
  component: SentimentBridge,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    activeEmotion: {
      control: "select",
      options: ["joy", "love", "sadness", "rage", "fear", "neutral", null],
    },
    size: {
      control: "radio",
      options: ["min", "compact", "full"],
    },
    progress: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
    },
    intensity: {
      control: { type: "range", min: 0, max: 1, step: 0.1 },
    },
  },
}

export default meta
type Story = StoryObj<SentimentBridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

/** * Demonstrates the marquee effect for long titles and the progress bar
 */
export const LongTitleMarquee: Story = {
  args: {
    dramaTitle: "The World of the Married: Deluxe Special Edition Episode",
    episode: "Ep 16",
    timestamp: "1:02:45",
    progress: 0.85,
    size: "compact",
    isPlaying: true,
  },
}

/** * Demonstrates the 'full' size mode with Sigil SVGs
 */
export const FullModeWithSigil: Story = {
  args: {
    dramaTitle: "Alchemy of Souls",
    episode: "Ep 20",
    activeEmotion: "love",
    size: "full",
    progress: 0.5,
    x: 150,
    y: 150,
  },
}

/** * Test the 'Rage' particle burst
 */
export const RageBurstEffect: Story = {
  args: {
    dramaTitle: "The Penthouse",
    episode: "S3 Ep 1",
    activeEmotion: "rage",
    intensity: 1.0,
    size: "full",
    progress: 0.98,
  },
}

/** * Demonstrates the new drip trails and shuddering pill
 */
export const SadnessDrip: Story = {
  args: {
    dramaTitle: "Moon Lovers: Scarlet Heart Ryeo",
    episode: "Ep 20",
    activeEmotion: "sadness",
    size: "compact",
    progress: 0.99,
  },
}

/** * Minimized state (progress bar still visible at bottom of small pill)
 */
export const MinimizedProgress: Story = {
  args: {
    size: "min",
    progress: 0.42,
    x: 20,
    y: 20,
  },
}
