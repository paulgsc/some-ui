import { useEffect, useRef } from "react"
import type { CardState, MomentTag } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { Slideshow } from "."

import "@drama/styles/content.css"

// ── Bridge ───────────────────────────────────────────────────────────────────
// Mounts a bare Slideshow instance in a fixed-size circle viewport.
// Controls map to Slideshow's public applyXxxState methods so you can iterate
// each of the eight slides' visuals in isolation from card/panel concerns.

const ALL_TAGS: ReadonlyArray<MomentTag> = [
  "confession",
  "handTouch",
  "jealousy",
  "misunderstanding",
  "reveal",
  "argument",
  "reunion",
  "goodbye",
  "kiss",
  "promise",
  "sacrifice",
  "other",
]

const SLIDE_NAMES = [
  "axes",
  "transition",
  "poster",
  "tags",
  "momentum",
  "atmosphere",
  "rating",
  "summary",
] as const

type SlideIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

type BridgeProps = {
  activeSlide: SlideIndex
  autoAdvance: boolean
  // Poster slide
  posterUrl: string | null
  dramaTitle: string
  featuredQuote: string
  // Rating slide
  rating: number
  // Axes slide (flattened for individual range controls)
  axisConnection: number
  axisHope: number
  axisTrust: number
  axisControl: number
  // Transition slide
  transBefore: string
  transAfter: string
  // Tags slide
  tags: Array<MomentTag>
  peakLine: string
  // Momentum slide
  momentumValue: number
  momentumDirection: "rising" | "steady" | "falling"
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
  axisConnection = 70,
  axisHope = -30,
  axisTrust = -80,
  axisControl = 40,
  transBefore = "hopeful",
  transAfter = "devastated",
  tags = ["handTouch", "reveal"],
  peakLine = "The umbrella scene in the rain",
  momentumValue = 75,
  momentumDirection = "falling",
  showBubble = true,
  circleSize = 112,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const ssRef = useRef<Slideshow | null>(null)

  // Mount once (re-mounts only when circleSize changes)
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
  }, [circleSize])

  // Sync controls → instance
  useEffect(() => {
    const ss = ssRef.current
    if (!ss) return

    const axes = {
      connection: axisConnection,
      hope: axisHope,
      trust: axisTrust,
      control: axisControl,
    }
    const transition = { before: transBefore, after: transAfter }
    const momentum = { value: momentumValue, direction: momentumDirection }

    ss.applyAxesState(axes)
    ss.applyTransitionState(transition)
    ss.applyPosterState({ posterUrl, dramaTitle, featuredQuote })
    ss.applyTagsState(tags, peakLine)
    ss.applyMomentumState(momentum)
    ss.applyAtmosphereState(axes)
    ss.applyRatingState(rating)

    // Summary needs a full CardState — fill non-displayed fields with stubs.
    const summaryState: CardState = {
      dramaTitle,
      posterUrl,
      episode: "Ep 12 / 16",
      timestamp: "27:53",
      progress: 0.63,
      overallProgress: 0.74,
      rating,
      completionLikelihood: 0.9,
      activeMood: null,
      featuredQuote,
      emotionLabel: "",
      isPlaying: true,
      axes,
      transition,
      tags,
      peakLine,
      momentum,
    }
    ss.applySummaryState(summaryState)

    ss.setBubbleVisible(showBubble && activeSlide === ss.posterSlideIndex)
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
    axisConnection,
    axisHope,
    axisTrust,
    axisControl,
    transBefore,
    transAfter,
    tags,
    peakLine,
    momentumValue,
    momentumDirection,
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
        slide {activeSlide} / {SLIDE_NAMES[activeSlide]}
      </div>

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
      control: "select",
      options: [0, 1, 2, 3, 4, 5, 6, 7],
      description:
        "0 axes · 1 transition · 2 poster · 3 tags · 4 momentum · 5 atmosphere · 6 rating · 7 summary",
    },
    autoAdvance: { control: "boolean" },
    rating: { control: { type: "range", min: 0, max: 10, step: 0.1 } },
    axisConnection: {
      control: { type: "range", min: -100, max: 100, step: 5 },
    },
    axisHope: { control: { type: "range", min: -100, max: 100, step: 5 } },
    axisTrust: { control: { type: "range", min: -100, max: 100, step: 5 } },
    axisControl: { control: { type: "range", min: -100, max: 100, step: 5 } },
    transBefore: { control: "text" },
    transAfter: { control: "text" },
    tags: { control: "check", options: [...ALL_TAGS] },
    peakLine: { control: "text" },
    momentumValue: { control: { type: "range", min: 0, max: 100, step: 1 } },
    momentumDirection: {
      control: "inline-radio",
      options: ["rising", "steady", "falling"],
    },
    posterUrl: { control: "text" },
    dramaTitle: { control: "text" },
    featuredQuote: { control: "text" },
    showBubble: { control: "boolean" },
    circleSize: {
      control: { type: "range", min: 60, max: 180, step: 4 },
      description: "Circle px — mirrors compact (100) vs full (112) card sizes",
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Base args ────────────────────────────────────────────────────────────────

const BASE: BridgeProps = {
  activeSlide: 0,
  autoAdvance: false,
  posterUrl: null,
  dramaTitle: "Queen of Tears",
  featuredQuote: "Don't look at me like that",
  rating: 8.6,
  axisConnection: 70,
  axisHope: -30,
  axisTrust: -80,
  axisControl: 40,
  transBefore: "hopeful",
  transAfter: "devastated",
  tags: ["handTouch", "reveal"],
  peakLine: "The umbrella scene in the rain",
  momentumValue: 75,
  momentumDirection: "falling",
  showBubble: true,
  circleSize: 112,
}

// ── Stories ──────────────────────────────────────────────────────────────────

/** Slide 0 — emotional tension axes as mini bars, warm/cool by sign. */
export const AxesSlide: Story = {
  args: { ...BASE, activeSlide: 0, showBubble: false },
}

/** Slide 0 — all positive: every bar warm-gold. */
export const AxesAllPositive: Story = {
  args: {
    ...BASE,
    activeSlide: 0,
    showBubble: false,
    axisConnection: 80,
    axisHope: 60,
    axisTrust: 40,
    axisControl: 90,
  },
}

/** Slide 0 — all negative: every bar cool-violet. */
export const AxesAllNegative: Story = {
  args: {
    ...BASE,
    activeSlide: 0,
    showBubble: false,
    axisConnection: -80,
    axisHope: -60,
    axisTrust: -90,
    axisControl: -40,
  },
}

/** Slide 1 — before → after transition. */
export const TransitionSlide: Story = {
  args: { ...BASE, activeSlide: 1, showBubble: false },
}

/** Slide 1 — empty transition shows the "what changed?" prompt. */
export const TransitionEmpty: Story = {
  args: {
    ...BASE,
    activeSlide: 1,
    showBubble: false,
    transBefore: "",
    transAfter: "",
  },
}

/** Slide 2 — poster, no image (placeholder), bubble visible. */
export const PosterSlide: Story = {
  args: { ...BASE, activeSlide: 2, showBubble: true },
}

/** Slide 2 — poster with a real image to verify object-fit cover. */
export const PosterWithImage: Story = {
  args: {
    ...BASE,
    activeSlide: 2,
    showBubble: true,
    dramaTitle: "Alchemy of Souls",
    posterUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/Alchemy_of_Souls_poster.jpg/220px-Alchemy_of_Souls_poster.jpg",
  },
}

/** Slide 3 — key moment tags + peak line. */
export const TagsSlide: Story = {
  args: { ...BASE, activeSlide: 3, showBubble: false },
}

/** Slide 3 — overflow: more than 4 tags shows "+N". */
export const TagsOverflow: Story = {
  args: {
    ...BASE,
    activeSlide: 3,
    showBubble: false,
    tags: ["confession", "handTouch", "kiss", "reveal", "argument", "goodbye"],
  },
}

/** Slide 4 — momentum, falling. */
export const MomentumFalling: Story = {
  args: {
    ...BASE,
    activeSlide: 4,
    showBubble: false,
    momentumValue: 75,
    momentumDirection: "falling",
  },
}

/** Slide 4 — momentum, rising. */
export const MomentumRising: Story = {
  args: {
    ...BASE,
    activeSlide: 4,
    showBubble: false,
    momentumValue: 40,
    momentumDirection: "rising",
  },
}

/** Slide 4 — momentum, steady. */
export const MomentumSteady: Story = {
  args: {
    ...BASE,
    activeSlide: 4,
    showBubble: false,
    momentumValue: 50,
    momentumDirection: "steady",
  },
}

/** Slide 5 — atmosphere, net-warm vector. */
export const AtmosphereWarm: Story = {
  args: {
    ...BASE,
    activeSlide: 5,
    showBubble: false,
    axisConnection: 70,
    axisHope: 60,
    axisTrust: 50,
    axisControl: 40,
  },
}

/** Slide 5 — atmosphere, high-tension vector (betrayal/separation spike). */
export const AtmosphereTense: Story = {
  args: {
    ...BASE,
    activeSlide: 5,
    showBubble: false,
    axisConnection: -90,
    axisHope: -40,
    axisTrust: -95,
    axisControl: -20,
  },
}

/** Slide 6 — rating, with momentum badge below the stars. */
export const RatingSlide: Story = {
  args: { ...BASE, activeSlide: 6, showBubble: false, rating: 9.2 },
}

/** Slide 7 — summary: compressed read of all captured state. */
export const SummarySlide: Story = {
  args: { ...BASE, activeSlide: 7, showBubble: false },
}

/** Auto-advance — cycles through all eight slides. */
export const AutoAdvancing: Story = {
  args: { ...BASE, activeSlide: 0, autoAdvance: true, showBubble: true },
}

/** Compact circle — content legibility at the smaller card size. */
export const CompactSize: Story = {
  args: { ...BASE, activeSlide: 0, circleSize: 100, showBubble: false },
}
