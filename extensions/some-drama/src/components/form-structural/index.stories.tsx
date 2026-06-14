import "@drama/styles/popup.css"

import { useEffect, useRef } from "react"
import type { DramaEntry } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildStructuralSection } from "."

// ── Bridge ───────────────────────────────────────────────────────────────────
// Mounts the structural (Facts) form panel in isolation so field layout,
// telemetry badges, color picker, and validation states can be verified
// without PopupRenderer or the FSM.
//
// Re-mounts on any prop change — buildStructuralSection has no update() API.

// Matches the El type alias used inside the builder.
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

type BridgeProps = {
  title: string
  episode: string
  network: string
  year: string
  genre: string
  note: string
  url: string
  /** Surfaces in the telemetry badge bar only when non-empty */
  timestamp: string
  /** Episode position (0–1) — shown in the telemetry badge bar */
  progress: number
  /** Controls 🟢 Live vs ⏸ Paused badge */
  isPlaying: boolean
}

const FormStructuralBridge = ({
  title,
  episode,
  network,
  year,
  genre,
  note,
  url,
  timestamp,
  progress,
  isPlaying,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const prefill: Partial<DramaEntry> = {
      title,
      episode,
      network,
      year,
      genre,
      note,
      url,
      timestamp,
      progress,
      isPlaying,
    }

    const { root } = buildStructuralSection(el, prefill)
    root.className = "pf-panel pf-panel-visible"

    container.innerHTML = ""
    container.appendChild(root)

    return () => {
      root.remove()
    }
  }, [
    title,
    episode,
    network,
    year,
    genre,
    note,
    url,
    timestamp,
    progress,
    isPlaying,
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
        FormStructural — Facts panel, isolated from PopupRenderer
      </div>

      {/* Popup chrome shell — mirrors the real popup viewport */}
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
        FormStructural — no FSM, no PopupRenderer
      </div>
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/FormStructural",
  component: FormStructuralBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    title: { control: "text" },
    episode: { control: "text" },
    network: { control: "text" },
    year: { control: "text" },
    genre: { control: "text" },
    note: { control: "text" },
    url: { control: "text" },
    timestamp: {
      control: "text",
      description: "Non-empty value shows the telemetry badge bar",
    },
    progress: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Episode progress (0–1) shown in the telemetry badge bar",
    },
    isPlaying: {
      control: "boolean",
      description: "Drives 🟢 Live vs ⏸ Paused badge",
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Base args ─────────────────────────────────────────────────────────────────

const BASE: BridgeProps = {
  title: "Queen of Tears",
  episode: "Ep 12 / 16",
  network: "tvN",
  year: "2024",
  genre: "Romance, Melodrama",
  note: "",
  url: "https://www.viki.com/tv/queen-of-tears",
  timestamp: "27:53",
  progress: 0.63,
  isPlaying: true,
}

// ── Stories ──────────────────────────────────────────────────────────────────

/** All fields pre-filled — baseline visual reference. */
export const Prefilled: Story = {
  args: { ...BASE },
}

/** Empty — no prefill; telemetry bar absent since timestamp is blank. */
export const Empty: Story = {
  args: {
    title: "",
    episode: "",
    network: "",
    year: "",
    genre: "",
    note: "",
    url: "",
    timestamp: "",
    progress: 0,
    isPlaying: false,
  },
}

/** With telemetry badges — scraper-supplied timestamp and progress visible. */
export const WithTelemetry: Story = {
  name: "With Telemetry (scraped)",
  args: {
    ...BASE,
    timestamp: "41:12",
    progress: 0.88,
    isPlaying: true,
  },
}

/** Paused — badge shows ⏸ Paused instead of 🟢 Live. */
export const Paused: Story = {
  args: {
    ...BASE,
    isPlaying: false,
  },
}

/** Long title — input must not overflow its container. */
export const LongTitle: Story = {
  args: {
    ...BASE,
    title:
      "Mr. Queen: The Philosopher's Stone of the Joseon Dynasty Special Director's Cut",
  },
}

/** Edit existing — all fields pre-populated as if opening a saved entry. */
export const EditExisting: Story = {
  name: "Edit Existing Entry",
  args: {
    title: "Alchemy of Souls",
    episode: "Ep 20 / 20",
    network: "tvN",
    year: "2022",
    genre: "Fantasy, Historical",
    note: "Finished both parts — part 2 recast was jarring",
    url: "https://www.netflix.com/title/81498462",
    timestamp: "52:08",
    progress: 0.95,
    isPlaying: false,
  },
}
