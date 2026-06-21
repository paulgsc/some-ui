import { useEffect, useRef } from "react"
import type { CardState, MoodType } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { RightPanel } from "."

// ── Bridge ───────────────────────────────────────────────────────────────────
// Mounts a bare RightPanel in isolation so progress variants, stat labels,
// and mood dot interactions can be validated without the full card stack.

type BridgeProps = Partial<CardState> & {
  /** Simulate an active mood dot selection from outside (parent would do this) */
  forceMoodActive: MoodType | null
}

const defaultState: CardState = {
  dramaTitle: "Queen of Tears",
  posterUrl: null,
  episode: "Ep 12 / 16",
  timestamp: "27:53",
  progress: 0.63,
  overallProgress: 0.74,
  rating: 8.6,
  completionLikelihood: 0.92,
  activeMood: "love",
  featuredQuote: "Don't look at me like that",
  emotionLabel: "heart eyes",
  isPlaying: true,
  axes: { connection: 0, hope: 0, trust: 0, control: 0 },
  transition: { before: "", after: "" },
  tags: [],
  peakLine: "",
  momentum: { value: 50, direction: "steady" },
}

const RightPanelBridge = ({
  forceMoodActive = null,
  ...stateOverrides
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<RightPanel | null>(null)

  // Mount once
  useEffect(() => {
    if (!containerRef.current || panelRef.current) return

    const root = document.createElement("div")
    root.id = "dc-root"
    root.dataset.size = "full"
    root.style.cssText = "position:relative; display:inline-block;"

    const panel = new RightPanel()

    panel.onMoodSelect = (mood) => {
      // eslint-disable-next-line no-console
      console.log("Mood selected:", mood)
      panel.setMoodActive(mood)
    }

    root.appendChild(panel.root)
    containerRef.current.appendChild(root)
    panelRef.current = panel

    return () => {
      panelRef.current = null
      root.remove()
    }
  }, [])

  // Sync state controls
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const merged: CardState = { ...defaultState, ...stateOverrides }
    panel.applyState(merged)
  }, [stateOverrides])

  // Sync forced mood active
  useEffect(() => {
    if (!panelRef.current || !forceMoodActive) return
    panelRef.current.setMoodActive(forceMoodActive)
  }, [forceMoodActive])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 32,
        background:
          "linear-gradient(135deg, hsl(220 30% 14%), hsl(240 25% 8%))",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.25)",
          fontFamily: "monospace",
          fontSize: 11,
        }}
      >
        RightPanel — click mood dots to test onMoodSelect (logged to console)
      </div>

      {/* Render on a card-like glass surface so text contrast is accurate */}
      <div
        style={{
          background:
            "linear-gradient(135deg, hsl(30 60% 97% / 0.93), hsl(350 55% 96% / 0.89))",
          backdropFilter: "blur(20px)",
          border: "1px solid hsl(20 60% 80% / 0.40)",
          borderRadius: 24,
          padding: "16px 18px",
          boxShadow: "0 8px 40px hsl(340 50% 30% / 0.32)",
        }}
      >
        <div ref={containerRef} />
      </div>

      <div
        style={{
          color: "rgba(255,255,255,0.12)",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontSize: 11,
        }}
      >
        RightPanel — isolated from slideshow and capture panel
      </div>
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/RightPanel",
  component: RightPanelBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    episode: { control: "text" },
    timestamp: { control: "text" },
    progress: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Position within current episode (0–1)",
    },
    overallProgress: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Episodes watched / total (0–1)",
    },
    rating: {
      control: { type: "range", min: 0, max: 10, step: 0.1 },
    },
    completionLikelihood: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Drives the Finish? label threshold",
    },
    activeMood: {
      control: "select",
      options: [
        null,
        "joy",
        "love",
        "sadness",
        "tension",
        "cringe",
        "neutral",
      ] satisfies Array<MoodType | null>,
    },
    forceMoodActive: {
      control: "select",
      options: [
        null,
        "joy",
        "love",
        "sadness",
        "tension",
        "cringe",
        "neutral",
      ] satisfies Array<MoodType | null>,
      description:
        "Simulate setMoodActive() called from a parent (e.g. CapturePanel selection)",
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

/** Default mid-drama state with love mood active. */
export const Default: Story = {
  args: {
    episode: "Ep 12 / 16",
    timestamp: "27:53",
    progress: 0.63,
    overallProgress: 0.74,
    rating: 8.6,
    completionLikelihood: 0.92,
    activeMood: "love",
    forceMoodActive: null,
  },
}

/** Nearly finished — progress fills almost full, Finishing ✓ label. */
export const NearFinale: Story = {
  args: {
    ...Default.args,
    episode: "Ep 20 / 20",
    timestamp: "52:08",
    progress: 0.97,
    overallProgress: 0.99,
    completionLikelihood: 1.0,
    rating: 9.2,
    activeMood: "joy",
  },
}

/** Dropping candidate — low progress, low likelihood, On the fence label. */
export const OnTheFence: Story = {
  args: {
    ...Default.args,
    episode: "Ep 14 / 50",
    timestamp: "18:02",
    progress: 0.31,
    overallProgress: 0.27,
    completionLikelihood: 0.28,
    rating: 6.4,
    activeMood: "neutral",
  },
}

/** Hard dropping — Dropping? label at very low likelihood. */
export const Dropping: Story = {
  args: {
    ...Default.args,
    episode: "Ep 6 / 24",
    timestamp: "08:15",
    progress: 0.14,
    overallProgress: 0.22,
    completionLikelihood: 0.08,
    rating: 4.2,
    activeMood: "cringe",
  },
}

/** Likely to finish — mid-range likelihood. */
export const Likely: Story = {
  args: {
    ...Default.args,
    episode: "Ep 9 / 16",
    timestamp: "34:01",
    progress: 0.72,
    overallProgress: 0.55,
    completionLikelihood: 0.71,
    activeMood: "tension",
  },
}

/** Tension mood — hue shifts to warm-orange across dots and label. */
export const TensionMood: Story = {
  args: {
    ...Default.args,
    activeMood: "tension",
    rating: 9.5,
    completionLikelihood: 0.97,
    episode: "Ep 8 / 16",
    progress: 0.88,
  },
}

/** Sadness mood — hue shifts to cool-blue. */
export const SadnessMood: Story = {
  args: {
    ...Default.args,
    activeMood: "sadness",
    episode: "Ep 20 / 20",
    progress: 0.97,
    completionLikelihood: 1.0,
    rating: 9.0,
  },
}

/** forceMoodActive — simulates parent (CapturePanel) driving the active dot. */
export const ForcedMoodFromParent: Story = {
  name: "Forced Mood (parent-driven)",
  args: {
    ...Default.args,
    activeMood: "neutral",
    forceMoodActive: "joy",
  },
}

/** Progress at zero — empty bar, glint dot at far left. */
export const ProgressZero: Story = {
  args: {
    ...Default.args,
    progress: 0,
    overallProgress: 0,
    episode: "Ep 1 / 16",
    timestamp: "00:00",
  },
}

/** Long episode string — verify badge truncation doesn't break layout. */
export const LongEpisodeLabel: Story = {
  args: {
    ...Default.args,
    episode: "Special Director's Cut Ep 3 / 20",
    timestamp: "1:04:22",
  },
}
