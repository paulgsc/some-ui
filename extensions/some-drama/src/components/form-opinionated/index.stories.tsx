import "@drama/styles/popup.css"

import { useEffect, useRef } from "react"
import type { DramaEntry, MomentTag } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildOpinionatedSection } from "."

const ALL_TAGS: ReadonlyArray<MomentTag> = [
  "confession",
  "reunion",
  "betrayal",
  "sacrifice",
  "separation",
  "kiss",
  "rivalry",
  "other",
]

type BridgeProps = {
  title: string
  episode: number
  tags: Array<MomentTag>
  transitionBefore: string
  transitionAfter: string
  reflection: string
  featuredQuote: string
  rating: number
  momentumDirection: "rising" | "steady" | "falling"
  completionLikelihood: number
}

const FormOpinionatedBridge = ({
  title,
  episode,
  tags,
  transitionBefore,
  transitionAfter,
  reflection,
  featuredQuote,
  rating,
  momentumDirection,
  completionLikelihood,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const prefill: Partial<DramaEntry> = {
      title,
      episode: String(episode),
      tags,
      transition: { before: transitionBefore, after: transitionAfter },
      note: reflection,
      featuredQuote,
      rating,
      momentum: { value: 50, direction: momentumDirection },
      completionLikelihood,
    }

    const { root } = buildOpinionatedSection(prefill)

    container.innerHTML = ""
    container.appendChild(root)

    return () => {
      root.remove()
    }
  }, [
    title,
    episode,
    tags,
    transitionBefore,
    transitionAfter,
    reflection,
    featuredQuote,
    rating,
    momentumDirection,
    completionLikelihood,
  ])

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 0",
        background: "var(--moon-900)",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: 15,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.3)",
          fontFamily: "monospace",
          fontSize: 11,
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        Journal Authoring Tool v3 — Strawberry Moon · Accordion Layout
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          borderRadius: "16px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        <div ref={containerRef} />
      </div>
    </div>
  )
}

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/JournalAuthoringUI-v3",
  component: FormOpinionatedBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    title: { control: "text", name: "Drama Title" },
    episode: { control: { type: "number", min: 0 }, name: "Episode Number" },
    tags: { control: "check", options: [...ALL_TAGS], name: "Key Moments" },
    transitionBefore: { control: "text", name: "Transition: Before" },
    transitionAfter: { control: "text", name: "Transition: After" },
    reflection: { control: "text", name: "Why It Mattered" },
    featuredQuote: { control: "text", name: "Memorable Quote" },
    rating: {
      control: { type: "range", min: 0, max: 10, step: 2 },
      description: "Maps to 1–5 stars",
    },
    momentumDirection: {
      control: "inline-radio",
      options: ["rising", "steady", "falling"],
      name: "Advanced: Momentum",
    },
    completionLikelihood: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      name: "Advanced: Likelihood",
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

/** Baseline: pre-filled entry, "What Happened?" open by default. */
export const StandardEntry: Story = {
  args: {
    title: "Crash Landing on You",
    episode: 12,
    tags: ["confession", "reunion"],
    transitionBefore: "Distrust",
    transitionAfter: "Trust",
    reflection:
      "The confession finally broke the emotional stalemate that existed for six episodes.",
    featuredQuote: "Stay. Just this once.",
    rating: 8,
    momentumDirection: "rising",
    completionLikelihood: 0.9,
  },
}

/** Fresh journal slate — empty state, preview shows the empty hint. */
export const BlankSlate: Story = {
  args: {
    title: "",
    episode: 1,
    tags: [],
    transitionBefore: "",
    transitionAfter: "",
    reflection: "",
    featuredQuote: "",
    rating: 0,
    momentumDirection: "steady",
    completionLikelihood: 0.5,
  },
}

/** Complex arc — multiple tags, full preview card with chips. */
export const ComplexArc: Story = {
  args: {
    title: "Twenty-Five Twenty-One",
    episode: 14,
    tags: ["separation", "sacrifice", "other"],
    transitionBefore: "Isolation",
    transitionAfter: "Belonging",
    reflection:
      "They promised forever but the realities of distance are changing their dynamic irrevocably.",
    featuredQuote: "Your support is the only thing I need to breathe.",
    rating: 10,
    momentumDirection: "falling",
    completionLikelihood: 0.95,
  },
}
