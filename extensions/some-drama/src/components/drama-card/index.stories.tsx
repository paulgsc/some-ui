import "@drama/styles/content.css"

import { useEffect, useRef } from "react"
import type { CardSize, CardState, MoodType } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { DramaCard } from "."

// ── Bridge ───────────────────────────────────────────────────────────────────
// Mounts a full DramaCard instance and bridges Storybook controls to the
// public update() / setSize() / setPosition() / setVisible() API.
//
// Bug fixes vs original bridge:
//   • useEffect deps are primitives, not the stateOverrides object reference —
//     prevents infinite re-render loops from object identity churn.
//   • destroy() is called on the instance directly; blossom teardown is now
//     internal to DramaCard so no external killBlossoms ref needed.
//   • setSize() is called with emit=false to avoid logging noise on every
//     control change while still exercising the size prop in isolation.

type BridgeProps = {
  // Layout
  size: CardSize
  x: number
  y: number
  // Visibility
  visible: boolean
  // CardState fields (spread individually for stable deps)
  dramaTitle: string
  posterUrl: string | null
  episode: string
  timestamp: string
  progress: number
  overallProgress: number
  rating: number
  completionLikelihood: number
  activeMood: MoodType | null
  featuredQuote: string
  emotionLabel: string
  isPlaying: boolean
}

const DEFAULT_STATE: CardState = {
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
}

const DramaCardBridge = ({
  size = "compact",
  x = 80,
  y = 80,
  visible = true,
  // CardState fields
  dramaTitle,
  posterUrl,
  episode,
  timestamp,
  progress,
  overallProgress,
  rating,
  completionLikelihood,
  activeMood,
  featuredQuote,
  emotionLabel,
  isPlaying,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<DramaCard | null>(null)

  // ── Mount once ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || cardRef.current) return

    cardRef.current = new DramaCard(
      containerRef.current,
      {
        ...DEFAULT_STATE,
        dramaTitle,
        posterUrl,
        episode,
        timestamp,
        progress,
        overallProgress,
        rating,
        completionLikelihood,
        activeMood,
        featuredQuote,
        emotionLabel,
        isPlaying,
      },
      {
        onMoodSelect: (mood) => console.log("[DramaCard] mood selected:", mood),
        onSizeChange: (s) => console.log("[DramaCard] size changed:", s),
        onDragEnd: (x, y) => console.log("[DramaCard] dragged to:", { x, y }),
      }
    )

    cardRef.current.setPosition(x, y)
    cardRef.current.setSize(size, /* emit */ false)
    cardRef.current.setVisible(visible)

    return () => {
      cardRef.current?.destroy()
      cardRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount once — subsequent changes handled by sync effects below

  // ── Sync state fields (primitive deps — no object churn) ───────────────────
  useEffect(() => {
    cardRef.current?.update({
      dramaTitle,
      posterUrl,
      episode,
      timestamp,
      progress,
      overallProgress,
      rating,
      completionLikelihood,
      activeMood,
      featuredQuote,
      emotionLabel,
      isPlaying,
    })
  }, [
    dramaTitle,
    posterUrl,
    episode,
    timestamp,
    progress,
    overallProgress,
    rating,
    completionLikelihood,
    activeMood,
    featuredQuote,
    emotionLabel,
    isPlaying,
  ])

  // ── Sync layout props ──────────────────────────────────────────────────────
  useEffect(() => {
    cardRef.current?.setSize(size, false)
  }, [size])
  useEffect(() => {
    cardRef.current?.setPosition(x, y)
  }, [x, y])
  useEffect(() => {
    cardRef.current?.setVisible(visible)
  }, [visible])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, hsl(220 30% 18%), hsl(240 25% 12%))",
      }}
    >
      {/* Stream context label */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 20,
          color: "rgba(255,255,255,0.2)",
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        🖥️ Viewer sees: coding session / study stream
      </div>

      {/* Bottom tagline */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.15)",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontSize: 11,
        }}
      >
        overlay communicates drama context independently of tab content
      </div>

      <div ref={containerRef} />
    </div>
  )
}

// ── Arg types ─────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/DramaCard",
  component: DramaCardBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    size: {
      control: "radio",
      options: ["min", "compact", "full"] satisfies Array<CardSize>,
      description: "Card size variant — min hides all content except the pip",
    },
    visible: {
      control: "boolean",
      description: "Toggles dc-hidden — tests enter/exit transition",
    },
    x: { control: { type: "range", min: 0, max: 1400, step: 4 } },
    y: { control: { type: "range", min: 0, max: 900, step: 4 } },
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
      description:
        "Sets --dc-mood-hue and active dot/emoji across all sub-components",
    },
    rating: {
      control: { type: "range", min: 0, max: 10, step: 0.1 },
    },
    progress: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Episode-level position (fills progress bar)",
    },
    overallProgress: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Series-level completion (% overall label)",
    },
    completionLikelihood: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Drives the Finish? stat label threshold",
    },
    isPlaying: { control: "boolean" },
    posterUrl: { control: "text" },
    featuredQuote: {
      control: "text",
      description: "Shown in chat bubble (full size, poster slide)",
    },
    emotionLabel: {
      control: "text",
      description: "Caption on the emotion slide",
    },
    dramaTitle: { control: "text" },
    episode: { control: "text" },
    timestamp: { control: "text" },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Helpers ───────────────────────────────────────────────────────────────────

const COMPACT_BASE: BridgeProps = {
  size: "compact",
  x: 80,
  y: 80,
  visible: true,
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
}

// ── Size variants ─────────────────────────────────────────────────────────────

/** Compact — bread-and-butter overlay state. Circle + right panel, no bubble. */
export const Compact: Story = {
  args: { ...COMPACT_BASE },
}

/**
 * Full — all metadata visible: progress, stats, chat bubble on poster slide.
 * Verify bubble sits BELOW the circle without overlapping right panel text.
 */
export const FullSize: Story = {
  args: {
    ...COMPACT_BASE,
    size: "full",
    dramaTitle: "Alchemy of Souls",
    episode: "Ep 20 / 20",
    progress: 0.95,
    overallProgress: 0.98,
    rating: 9.2,
    completionLikelihood: 1.0,
    activeMood: "joy",
    featuredQuote: "I'll remember you in every life",
    emotionLabel: "bittersweet finale",
  },
}

/** Minimized — just the spinning pip. Click to expand to compact. */
export const Minimized: Story = {
  args: {
    ...COMPACT_BASE,
    size: "min",
    activeMood: "tension",
    x: 20,
    y: 20,
  },
}

// ── Visibility ────────────────────────────────────────────────────────────────

/** Hidden — dc-hidden applied, tests fade+translate exit transition. */
export const Hidden: Story = {
  args: {
    ...COMPACT_BASE,
    visible: false,
  },
}

// ── Mood hue variants (compact) ───────────────────────────────────────────────

/** Joy — golden hue across ring, mood dot, emotion slide backdrop. */
export const MoodJoy: Story = {
  name: "Mood / Joy",
  args: {
    ...COMPACT_BASE,
    activeMood: "joy",
    emotionLabel: "best episode ever",
    dramaTitle: "Weightlifting Fairy Kim Bok-joo",
  },
}

/** Love — rose hue (default palette, baseline comparison). */
export const MoodLove: Story = {
  name: "Mood / Love",
  args: { ...COMPACT_BASE, activeMood: "love" },
}

/** Sadness — cool blue hue shift. */
export const MoodSadness: Story = {
  name: "Mood / Sadness",
  args: {
    ...COMPACT_BASE,
    size: "full",
    dramaTitle: "Moon Lovers: Scarlet Heart Ryeo",
    episode: "Ep 20 / 20",
    timestamp: "52:08",
    progress: 0.97,
    overallProgress: 0.99,
    rating: 9.0,
    completionLikelihood: 1.0,
    activeMood: "sadness",
    featuredQuote: "I'll find you wherever you go",
    emotionLabel: "crying rn",
  },
}

/** Tension — warm-orange hue. Full size so bubble is visible. */
export const MoodTension: Story = {
  name: "Mood / Tension",
  args: {
    ...COMPACT_BASE,
    dramaTitle: "The Glory",
    episode: "Ep 8 / 16",
    timestamp: "41:12",
    progress: 0.88,
    overallProgress: 0.49,
    rating: 9.5,
    completionLikelihood: 0.97,
    activeMood: "tension",
    featuredQuote: "You'll pay for every single thing",
    emotionLabel: "on edge",
  },
}

/** Cringe — purple hue. */
export const MoodCringe: Story = {
  name: "Mood / Cringe",
  args: {
    ...COMPACT_BASE,
    activeMood: "cringe",
    emotionLabel: "secondhand embarrassment",
    dramaTitle: "My Love from the Star",
    episode: "Ep 5 / 21",
    rating: 7.8,
  },
}

/** Neutral / Meh — desaturated blue-grey hue. */
export const MoodNeutral: Story = {
  name: "Mood / Neutral",
  args: {
    ...COMPACT_BASE,
    activeMood: "neutral",
    emotionLabel: "taking it in",
    dramaTitle: "Some Long Ongoing Drama",
    episode: "Ep 14 / 50",
    timestamp: "18:02",
    progress: 0.31,
    overallProgress: 0.27,
    rating: 6.4,
    completionLikelihood: 0.28,
    featuredQuote: "honestly not sure where this is going",
  },
}

// ── Completion likelihood thresholds ─────────────────────────────────────────

/** Finishing ✓ — likelihood ≥ 0.85. */
export const LikelihoodFinishing: Story = {
  name: "Likelihood / Finishing ✓",
  args: {
    ...COMPACT_BASE,
    completionLikelihood: 0.92,
    episode: "Ep 15 / 16",
    progress: 0.85,
  },
}

/** Likely — 0.60 ≤ likelihood < 0.85. */
export const LikelihoodLikely: Story = {
  name: "Likelihood / Likely",
  args: {
    ...COMPACT_BASE,
    completionLikelihood: 0.71,
    episode: "Ep 9 / 16",
    progress: 0.72,
    overallProgress: 0.55,
    activeMood: "tension",
  },
}

/** On the fence — 0.35 ≤ likelihood < 0.60. */
export const LikelihoodOnTheFence: Story = {
  name: "Likelihood / On the fence",
  args: {
    ...COMPACT_BASE,
    completionLikelihood: 0.45,
    episode: "Ep 11 / 24",
    progress: 0.5,
    overallProgress: 0.44,
    rating: 7.1,
    activeMood: "neutral",
  },
}

/** Dropping? — likelihood < 0.35. */
export const LikelihoodDropping: Story = {
  name: "Likelihood / Dropping?",
  args: {
    ...COMPACT_BASE,
    dramaTitle: "Some Long Ongoing Drama",
    episode: "Ep 6 / 50",
    timestamp: "08:15",
    progress: 0.14,
    overallProgress: 0.11,
    completionLikelihood: 0.08,
    rating: 4.2,
    activeMood: "cringe",
    featuredQuote: "not sure I can keep going",
    emotionLabel: "losing interest",
  },
}

// ── Poster variants ───────────────────────────────────────────────────────────

/** No poster — placeholder 🎬 emoji renders gracefully. */
export const NoPoster: Story = {
  args: {
    ...COMPACT_BASE,
    posterUrl: null,
    dramaTitle: "Unknown Drama Title That Is Quite Long Indeed",
  },
}

/** With poster image — verify object-fit cover inside circle clip. */
export const WithPosterImage: Story = {
  args: {
    ...COMPACT_BASE,
    size: "full",
    dramaTitle: "Alchemy of Souls",
    posterUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/Alchemy_of_Souls_poster.jpg/220px-Alchemy_of_Souls_poster.jpg",
    activeMood: "joy",
    emotionLabel: "bittersweet finale",
  },
}

// ── Text edge cases ───────────────────────────────────────────────────────────

/** Long title — title pill should truncate with ellipsis, not overflow. */
export const LongTitle: Story = {
  args: {
    ...COMPACT_BASE,
    dramaTitle:
      "Mr. Queen: The Philosopher's Stone of the Joseon Dynasty Special Director's Cut",
    episode: "Ep 3 / 20",
  },
}

/** Long quote — full size, bubble should clamp at 3 lines. */
export const LongQuote: Story = {
  args: {
    ...COMPACT_BASE,
    size: "full",
    featuredQuote:
      "I searched every corner of every lifetime and I would do it again without hesitation, even knowing how it ends",
  },
}

/**
 * Long episode label — badge should stay on one line;
 * verify it doesn't push timestamp off-screen.
 */
export const LongEpisodeLabel: Story = {
  args: {
    ...COMPACT_BASE,
    episode: "Special Director's Cut Ep 3 / 20",
    timestamp: "1:04:22",
  },
}

// ── Progress extremes ─────────────────────────────────────────────────────────

/** Progress zero — empty bar, glint dot anchored at far left. */
export const ProgressZero: Story = {
  args: {
    ...COMPACT_BASE,
    progress: 0,
    overallProgress: 0,
    episode: "Ep 1 / 16",
    timestamp: "00:00",
  },
}

/** Progress full — bar fills end-to-end, glint dot at far right. */
export const ProgressFull: Story = {
  args: {
    ...COMPACT_BASE,
    progress: 1,
    overallProgress: 1,
    completionLikelihood: 1,
    episode: "Ep 16 / 16",
    timestamp: "58:40",
  },
}

// ── Positioned variants ───────────────────────────────────────────────────────

/**
 * Top-left corner — verify card doesn't clip; drag clamping holds it in view.
 */
export const PositionedTopLeft: Story = {
  args: { ...COMPACT_BASE, x: 12, y: 12 },
}

/**
 * Bottom-right corner — typical livestream overlay position.
 */
export const PositionedBottomRight: Story = {
  args: { ...COMPACT_BASE, x: 1200, y: 640 },
}
