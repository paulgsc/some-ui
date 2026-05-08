import { useEffect, useRef } from "react"
import type { MoodType } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { Slideshow } from "."

import "@drama/styles/content.css"

// ── Bridge ───────────────────────────────────────────────────────────────────
// Mounts a bare Slideshow instance in a fixed-size circle viewport.
// Controls map 1:1 to Slideshow's public applyXxxState methods so you can
// iterate each slide's visual in complete isolation from card/panel concerns.

type BridgeProps = {
  activeSlide: 0 | 1 | 2
  autoAdvance: boolean
  // Poster slide
  posterUrl: string | null
  dramaTitle: string
  featuredQuote: string
  // Rating slide
  rating: number
  // Emotion slide
  activeMood: MoodType | null
  emotionLabel: string
  // Full-size bubble
  showBubble: boolean
  // Circle size (mirrors card size tokens)
  circleSize: number
}

const SlideshowBridge = ({
  activeSlide = 0,
  autoAdvance = false,
  posterUrl = null,
  dramaTitle = "Queen of Tears",
  featuredQuote = "Don't look at me like that",
  rating = 8.6,
  activeMood = "love",
  emotionLabel = "heart eyes",
  showBubble = true,
  circleSize = 112,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const ssRef = useRef<Slideshow | null>(null)

  // Mount once
  useEffect(() => {
    if (!containerRef.current || ssRef.current) return

    // We need a #dc-root ancestor for CSS custom-property scoping
    const root = document.createElement("div")
    root.id = "dc-root"
    root.dataset.size = "full"
    root.style.cssText = "position:relative; display:inline-block;"

    const ss = new Slideshow()
    Object.assign(ss.wrap.style, {
      width: `${circleSize}px`,
      height: `${circleSize}px`,
    })

    root.appendChild(ss.wrap)
    containerRef.current.appendChild(root)
    ssRef.current = ss

    return () => {
      ss.destroy()
      ssRef.current = null
      root.remove()
    }
  }, [])

  // Sync controls → instance
  useEffect(() => {
    const ss = ssRef.current
    if (!ss) return

    ss.applyPosterState({ posterUrl, dramaTitle, featuredQuote })
    ss.applyRatingState(rating)
    ss.applyEmotionState(activeMood, emotionLabel)
    ss.setBubbleVisible(showBubble && activeSlide === 0)
    ss.setBubbleQuote(featuredQuote)
    ss.setSlide(activeSlide)

    if (autoAdvance) ss.startAutoAdvance()
    else ss.stopAutoAdvance()
  }, [
    activeSlide,
    autoAdvance,
    posterUrl,
    dramaTitle,
    featuredQuote,
    rating,
    activeMood,
    emotionLabel,
    showBubble,
  ])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 64,
        background:
          "linear-gradient(135deg, hsl(220 30% 14%), hsl(240 25% 8%))",
      }}
    >
      {/* Slide label overlay */}
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
        slide {activeSlide} / {["poster", "rating", "emotion"][activeSlide]}
      </div>

      {/* Component under test */}
      <div ref={containerRef} />

      <div
        style={{
          color: "rgba(255,255,255,0.12)",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontSize: 11,
        }}
      >
        Slideshow — isolated from card shell and right panel
      </div>
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/Slideshow",
  component: SlideshowBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    activeSlide: {
      control: "radio",
      options: [0, 1, 2],
      description: "0 = poster, 1 = rating, 2 = emotion",
    },
    autoAdvance: { control: "boolean" },
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
    rating: {
      control: { type: "range", min: 0, max: 10, step: 0.1 },
    },
    posterUrl: { control: "text" },
    dramaTitle: { control: "text" },
    featuredQuote: { control: "text" },
    emotionLabel: { control: "text" },
    showBubble: { control: "boolean" },
    circleSize: {
      control: { type: "range", min: 60, max: 180, step: 4 },
      description: "Circle px — mirrors compact (100) vs full (112) card sizes",
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

/** Poster slide — shows drama title, featured quote bubble. */
export const PosterSlide: Story = {
  args: {
    activeSlide: 0,
    autoAdvance: false,
    posterUrl: null,
    dramaTitle: "Queen of Tears",
    featuredQuote: "Don't look at me like that",
    showBubble: true,
    circleSize: 112,
    rating: 8.6,
    activeMood: "love",
    emotionLabel: "heart eyes",
  },
}

/** Poster slide — with an actual image URL to verify object-fit cover. */
export const PosterWithImage: Story = {
  args: {
    ...PosterSlide.args,
    dramaTitle: "Alchemy of Souls",
    posterUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/Alchemy_of_Souls_poster.jpg/220px-Alchemy_of_Souls_poster.jpg",
    showBubble: true,
  },
}

/** Rating slide — mid-range score. */
export const RatingMid: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 1,
    rating: 7.2,
    showBubble: false,
  },
}

/** Rating slide — near-perfect score, star row should show 5 filled. */
export const RatingPerfect: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 1,
    rating: 9.8,
    dramaTitle: "Alchemy of Souls",
    showBubble: false,
  },
}

/** Rating slide — low score, dropping candidate. */
export const RatingLow: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 1,
    rating: 4.1,
    showBubble: false,
  },
}

/** Emotion slide — love mood, rose hue backdrop. */
export const EmotionLove: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 2,
    activeMood: "love",
    emotionLabel: "heart eyes",
    showBubble: false,
  },
}

/** Emotion slide — sadness, blue hue shift. */
export const EmotionSadness: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 2,
    activeMood: "sadness",
    emotionLabel: "crying rn",
    showBubble: false,
    dramaTitle: "Moon Lovers: Scarlet Heart Ryeo",
  },
}

/** Emotion slide — tension, warm-orange hue. */
export const EmotionTension: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 2,
    activeMood: "tension",
    emotionLabel: "on edge",
    dramaTitle: "The Glory",
    showBubble: false,
  },
}

/** Emotion slide — cringe, purple hue. */
export const EmotionCringe: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 2,
    activeMood: "cringe",
    emotionLabel: "secondhand embarrassment",
    showBubble: false,
  },
}

/** Auto-advance — verifies all three slides cycle with transitions. */
export const AutoAdvancing: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 0,
    autoAdvance: true,
    showBubble: true,
  },
}

/** Bubble hidden — poster slide without quote, used in compact size. */
export const PosterNoBubble: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 0,
    showBubble: false,
  },
}

/** Long quote — verify three-line clamp and no overflow. */
export const LongQuote: Story = {
  args: {
    ...PosterSlide.args,
    activeSlide: 0,
    showBubble: true,
    featuredQuote:
      "I searched every corner of every lifetime for you and I would do it again without hesitation",
  },
}

/** Small circle (compact size) — ring and content scale correctly. */
export const CompactSize: Story = {
  args: {
    ...PosterSlide.args,
    circleSize: 100,
    autoAdvance: false,
    showBubble: false,
  },
}

/** Minimized circle — extreme small size stress test. */
export const MinSize: Story = {
  args: {
    ...PosterSlide.args,
    circleSize: 42,
    activeSlide: 0,
    showBubble: false,
  },
}
