/**
 * BannerMarquee (Ribbon) stories
 *
 * Covers:
 *   - Unassigned (no segment, no text)
 *   - Flat string (no delimiter — detail-only rendering)
 *   - Structured string (action — detail parsing)
 *   - All segments (anchor glyph + accent)
 *   - Live clock (active node with running time)
 *   - Long content (marquee drift activation)
 *   - Error state
 *   - Hidden / toggle
 */

import "@tab/styles/banner.css"

import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { NodeState, Segment } from "@tab/types"
import { SEGMENTS } from "@tab/types"
import { BannerMarquee } from "@tab/ui/banner-marquee"

// ─── Factories ────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    tabId: 1,
    url: "https://github.com/anthropics/anthropic-sdk-python",
    segment: null,
    visits: [],
    lastActiveMs: 0,
    activeStart: null,
    lastPostError: null,
    ...overrides,
  }
}

// ─── Bridge ───────────────────────────────────────────────────────────────────

type BridgeProps = {
  segment?: Segment | null
  text?: string
  activeMs?: number
  running?: boolean
  simulateError?: string | null
}

const RibbonBridge = ({
  segment = null,
  text = "",
  activeMs = 0,
  running = false,
  simulateError = null,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<BannerMarquee | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const banner = new BannerMarquee({
      toggleCombo: { key: "b", alt: true },
    })

    instanceRef.current = banner

    // Mount into a scoped container (not document.body — Storybook)
    containerRef.current.style.position = "relative"
    containerRef.current.style.height = "40px"

    // Override fixed positioning for Storybook sandbox
    const el = banner.getElement()
    el.style.position = "absolute"
    el.style.bottom = "0"
    el.style.left = "0"
    el.style.right = "0"

    containerRef.current.appendChild(el)

    // Set initial state
    if (segment) banner.setSegment(segment)
    if (text) banner.setText(text)

    const node = makeNode({
      segment: segment ?? null,
      lastActiveMs: activeMs,
      activeStart: running ? Date.now() - activeMs : null,
    })
    banner.setNode(node)

    if (simulateError) {
      // Access private via cast for story simulation
      ;(banner as any).showError(simulateError)
    }

    return () => {
      banner.unmount()
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live prop updates
  useEffect(() => {
    const b = instanceRef.current
    if (!b) return
    b.setSegment(segment ?? null)
    if (text) b.setText(text)
  }, [segment, text])

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="w-1/2"
        style={{
          height: "80px",
          background: "linear-gradient(135deg, #060609 0%, #0d0d14 100%)",
          borderRadius: 8,
          overflow: "hidden",
          display: "flex",
          alignItems: "flex-end",
        }}
      />
    </div>
  )
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "Extensions/TabLedger/Ribbon",
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
}

export default meta
type Story = StoryObj

// ─── Stories ──────────────────────────────────────────────────────────────────

/** No segment, no text — unassigned state */
export const Unassigned: Story = {
  render: () => <RibbonBridge />,
}

/** Flat string — no delimiter, renders as detail-only at mid contrast */
export const FlatString: Story = {
  render: () => (
    <RibbonBridge
      segment="dsa"
      text="reading editorial on segment trees"
      activeMs={4 * 60 * 1000}
    />
  ),
}

/** Structured — action token + detail, high/low contrast split */
export const Structured: Story = {
  render: () => (
    <RibbonBridge
      segment="systems"
      text="debugging  —  heap invariant broken on push"
      activeMs={18 * 60 * 1000}
      running
    />
  ),
}

/** Pipe delimiter variant */
export const StructuredPipe: Story = {
  render: () => (
    <RibbonBridge
      segment="infra"
      text="deploying  |  rollout 40% complete, watching error rate"
      activeMs={7 * 60 * 1000}
      running
    />
  ),
}

/** All segments — anchor glyph + accent sweep */
export const AllSegments: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {SEGMENTS.map((seg) => (
        <RibbonBridge
          key={seg}
          segment={seg}
          text={`${seg}  —  active session`}
          activeMs={Math.floor(Math.random() * 30) * 60 * 1000}
        />
      ))}
    </div>
  ),
}

/** Running clock — activeStart set, clock ticks live */
export const RunningClock: Story = {
  render: () => (
    <RibbonBridge
      segment="math"
      text="solving  —  eigenvalue decomposition"
      activeMs={23 * 60 * 1000}
      running
    />
  ),
}

/** Long content — marquee drift activates on overflow */
export const LongContent: Story = {
  render: () => (
    <RibbonBridge
      segment="language"
      text="reading  —  chomsky hierarchy revisited: type-0 grammars, unrestricted rewriting systems, and what they tell us about computation limits"
      activeMs={12 * 60 * 1000}
    />
  ),
}

/** Error state — tooltip above ribbon */
export const ErrorState: Story = {
  render: () => (
    <RibbonBridge
      segment="systems"
      text="deploying  —  prod rollout"
      activeMs={5 * 60 * 1000}
      simulateError="Axum server unreachable (is it running on :3737?)"
    />
  ),
}

/** Unset segment — anchor shows muted fallback glyph */
export const NoSegment: Story = {
  render: () => (
    <RibbonBridge
      text="browsing  —  no segment assigned"
      activeMs={2 * 60 * 1000}
    />
  ),
}
