import "@drama/styles/popup.css" // Assumes loading of the new .css engine

import { useEffect, useRef } from "react"
import type { DramaEntry, MomentTag } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildOpinionatedSection } from "."

// ── DOM Helper Bridge ────────────────────────────────────────────────────────
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
  "reunion",
  "betrayal",
  "sacrifice",
  "separation",
  "kiss",
  "rivalry",
  "other",
]

type BridgeProps = {
  /** Section 1: Metadata */
  title: string
  episode: number
  watchDate: string
  /** Section 2: What Happened? */
  tags: Array<MomentTag>
  /** Section 3: What Changed? */
  transitions: Array<{ before: string; after: string }>
  /** Section 4: Why Did It Matter? */
  whyItRimmed: string
  /** Section 5: Memorable Quote */
  featuredQuote: string
  /** Section 7: Advanced Metrics (Collapsed by default) */
  rating: number
  momentumDirection: "rising" | "steady" | "falling"
  completionLikelihood: number
}

const FormOpinionatedBridge = ({
  title,
  episode,
  watchDate,
  tags,
  transitions,
  whyItRimmed,
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
      episode,
      watchDate,
      tags,
      transitions,
      whyItRimmed,
      featuredQuote,
      rating,
      momentum: { value: 50, direction: momentumDirection },
      completionLikelihood,
    }

    // Mounts isolation component built strictly on the v2 single-column spec
    const { root } = buildOpinionatedSection(el, prefill)

    container.innerHTML = ""
    container.appendChild(root)

    return () => {
      root.remove()
    }
  }, [
    title,
    episode,
    watchDate,
    tags,
    transitions,
    whyItRimmed,
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
        background: "#121016",
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
        Journal Authoring Tool v2 — Single-Column Notebook Layout
      </div>

      {/* Main Authoring Wrapper Mimicking App Frame */}
      <div
        style={{
          width: "100%",
          maxWidth: "640px",
          background: "#fcfbf9",
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

// ── Meta ─────────────────────────────────────────────────────────────────────
const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/JournalAuthoringUI-v2",
  component: FormOpinionatedBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    title: { control: "text", name: "Drama Title" },
    episode: { control: { type: "number", min: 1 }, name: "Episode Number" },
    watchDate: { control: "text", name: "Watch Date (YYYY-MM-DD)" },
    tags: {
      control: "check",
      options: [...ALL_TAGS],
      name: "Key Moments (What Happened?)",
    },
    transitions: {
      control: "object",
      name: "Transitions Grid (Before → After)",
    },
    whyItRimmed: { control: "text", name: "Why It Mattered Description" },
    featuredQuote: { control: "text", name: "Memorable Quote Text" },
    rating: {
      control: { type: "range", min: 0, max: 10, step: 2 },
      description: "Maps internally to a 1–5 star display scale",
    },
    momentumDirection: {
      control: "inline-radio",
      options: ["rising", "steady", "falling"],
      name: "Advanced: Momentum Direction",
    },
    completionLikelihood: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      name: "Advanced: Likelihood",
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

/** Baseline spec goal: Simple, low friction, lightning-fast capture. */
export const StandardEntry: Story = {
  args: {
    title: "Crash Landing on You",
    episode: 12,
    watchDate: "2026-06-14",
    tags: ["confession", "reunion"],
    transitions: [{ before: "Distrust", after: "Trust" }],
    whyItRimmed:
      "The confession finally broke the emotional stalemate that existed for six episodes.",
    featuredQuote: "Stay. Just this once.",
    rating: 8, // Represents 4 out of 5 stars
    momentumDirection: "rising",
    completionLikelihood: 0.9,
  },
}

/** Fresh journal slate: Empty state demonstrating immediate cognitive ease. */
export const BlankSlate: Story = {
  args: {
    title: "",
    episode: 1,
    watchDate: new Date().toISOString().split("T")[0],
    tags: [],
    transitions: [{ before: "", after: "" }],
    whyItRimmed: "",
    featuredQuote: "",
    rating: 0,
    momentumDirection: "steady",
    completionLikelihood: 0.5,
  },
}

/** Demonstrates scalability with multiple parallel emotional movements. */
export const ComplexArcTransitions: Story = {
  args: {
    title: "Twenty-Five Twenty-One",
    episode: 14,
    watchDate: "2026-05-20",
    tags: ["separation", "sacrifice", "other"],
    transitions: [
      { before: "Isolation", after: "Belonging" },
      { before: "Enemies", after: "Partners" },
      { before: "Certainty", after: "Heartbreak" },
    ],
    whyItRimmed:
      "They promised forever but the realities of distance are changing their dynamic irrevocably.",
    featuredQuote: "Your support is the only thing I need to breathe.",
    rating: 10,
    momentumDirection: "falling",
    completionLikelihood: 0.95,
  },
}
