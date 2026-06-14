import "@drama/styles/popup.css"

import { useEffect, useRef } from "react"
import type { DramaEntry, MomentTag } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildOpinionatedSection } from "."

// ── Bridge ───────────────────────────────────────────────────────────────────
// Mounts the opinionated (Feels) form panel in isolation so axis sliders,
// momentum controls, tag grid, and quote textarea can be verified without
// PopupRenderer or the FSM.
//
// Re-mounts on any prop change — buildOpinionatedSection has no update() API.

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

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

type BridgeProps = {
  /** Pre-selected star rating (0–10) */
  rating: number
  /** Series progress slider initial value (0–1) */
  overallProgress: number
  /** Completion likelihood slider initial value — drives emoji threshold */
  completionLikelihood: number
  /** Pre-fills the featured quote textarea */
  featuredQuote: string
  axisConnection: number
  axisHope: number
  axisTrust: number
  axisControl: number
  transBefore: string
  transAfter: string
  /** Pre-selected key moment tags */
  tags: Array<MomentTag>
  peakLine: string
  momentumValue: number
  momentumDirection: "rising" | "steady" | "falling"
}

const FormOpinionatedBridge = ({
  rating,
  overallProgress,
  completionLikelihood,
  featuredQuote,
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
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const prefill: Partial<DramaEntry> = {
      rating,
      overallProgress,
      completionLikelihood,
      featuredQuote,
      axes: {
        connection: axisConnection,
        hope: axisHope,
        trust: axisTrust,
        control: axisControl,
      },
      transition: { before: transBefore, after: transAfter },
      tags,
      peakLine,
      momentum: { value: momentumValue, direction: momentumDirection },
    }

    const { root } = buildOpinionatedSection(el, prefill)
    root.className = "pf-panel pf-panel-visible"

    container.innerHTML = ""
    container.appendChild(root)

    return () => {
      root.remove()
    }
  }, [
    rating,
    overallProgress,
    completionLikelihood,
    featuredQuote,
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
  ])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
        FormOpinionated — Feels panel, isolated from PopupRenderer
      </div>

      {/* Popup chrome shell */}
      <div
        style={{
          width: 340,
          maxHeight: 560,
          display: "flex",
          flexDirection: "column",
          background: "var(--p-bg)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 12px 48px hsl(340 50% 10% / 0.5)",
        }}
      >
        <div ref={containerRef} style={{ flex: 1, overflowY: "auto" }} />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.12)",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontSize: 11,
        }}
      >
        FormOpinionated — no FSM, no PopupRenderer
      </div>
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/FormOpinionated",
  component: FormOpinionatedBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    rating: { control: { type: "range", min: 0, max: 10, step: 1 } },
    overallProgress: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
    },
    completionLikelihood: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Drives emoji threshold: 😶 <25 · 🤔 <50 · 👀 <75 · 🔥 ≥75",
    },
    featuredQuote: { control: "text" },
    axisConnection: {
      control: { type: "range", min: -100, max: 100, step: 5 },
    },
    axisHope: { control: { type: "range", min: -100, max: 100, step: 5 } },
    axisTrust: { control: { type: "range", min: -100, max: 100, step: 5 } },
    axisControl: { control: { type: "range", min: -100, max: 100, step: 5 } },
    transBefore: { control: "text" },
    transAfter: { control: "text" },
    tags: {
      control: "check",
      options: [...ALL_TAGS],
      description: "Pre-selected key moment tags",
    },
    peakLine: { control: "text" },
    momentumValue: { control: { type: "range", min: 0, max: 100, step: 1 } },
    momentumDirection: {
      control: "inline-radio",
      options: ["rising", "steady", "falling"] satisfies Array<
        "rising" | "steady" | "falling"
      >,
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Base args ─────────────────────────────────────────────────────────────────

const BASE: BridgeProps = {
  rating: 9,
  overallProgress: 0.74,
  completionLikelihood: 0.92,
  featuredQuote: "Don't look at me like that",
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
}

// ── Stories ──────────────────────────────────────────────────────────────────

/** All fields pre-filled — mixed tension/hope baseline. */
export const Prefilled: Story = {
  args: { ...BASE },
}

/** Blank — no prefill; axes at zero, no tags, sliders at default. */
export const Blank: Story = {
  args: {
    rating: 0,
    overallProgress: 0,
    completionLikelihood: 0.5,
    featuredQuote: "",
    axisConnection: 0,
    axisHope: 0,
    axisTrust: 0,
    axisControl: 0,
    transBefore: "",
    transAfter: "",
    tags: [],
    peakLine: "",
    momentumValue: 50,
    momentumDirection: "steady",
  },
}

/** All-positive axes — every bar warm-gold, euphoric arc. */
export const AxesAllPositive: Story = {
  args: {
    ...BASE,
    axisConnection: 80,
    axisHope: 60,
    axisTrust: 70,
    axisControl: 90,
    transBefore: "hopeful",
    transAfter: "euphoric",
    momentumDirection: "rising",
    momentumValue: 85,
  },
}

/** All-negative axes — every bar cool-violet; despair/betrayal territory. */
export const AxesAllNegative: Story = {
  args: {
    ...BASE,
    axisConnection: -80,
    axisHope: -70,
    axisTrust: -90,
    axisControl: -60,
    transBefore: "steady",
    transAfter: "shattered",
    momentumDirection: "falling",
    momentumValue: 85,
  },
}

/** Likelihood high — 🔥 emoji; Finishing ✓ threshold. */
export const LikelihoodHigh: Story = {
  name: "Likelihood / High (🔥 Finishing)",
  args: {
    ...BASE,
    completionLikelihood: 0.94,
    overallProgress: 0.9,
    momentumDirection: "rising",
  },
}

/** Likelihood low — 😶 emoji; dropping candidate. */
export const LikelihoodLow: Story = {
  name: "Likelihood / Low (😶 Dropping?)",
  args: {
    ...BASE,
    completionLikelihood: 0.12,
    rating: 4,
    momentumDirection: "falling",
    momentumValue: 80,
  },
}

/** All tags selected — verify 4-col grid handles the full 12-tag set. */
export const AllTagsSelected: Story = {
  args: {
    ...BASE,
    tags: [...ALL_TAGS],
    peakLine: "Literally every trope fired in one episode",
  },
}

/** Finale collapse — axes mirror end-of-series emotional breakdown. */
export const FinaleCollapse: Story = {
  args: {
    ...BASE,
    rating: 9,
    axisConnection: -40,
    axisHope: -90,
    axisTrust: 60,
    axisControl: -70,
    transBefore: "holding on",
    transAfter: "let go",
    tags: ["goodbye", "sacrifice", "promise"],
    peakLine: "I'll find you wherever you go",
    momentumValue: 95,
    momentumDirection: "falling",
    featuredQuote: "I'll remember you in every life",
  },
}
