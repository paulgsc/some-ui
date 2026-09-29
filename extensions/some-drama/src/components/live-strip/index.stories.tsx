import "@drama/styles/content.css"

import { useEffect, useRef } from "react"
import type { BeatRecord, CardSize, Intensity, MoodType } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { LiveStrip } from "."

// ── Fixtures ─────────────────────────────────────────────────────────────────
// A 40-minute episode with the shape a rom-com hour usually has: warm open,
// a misunderstanding, a low, and a confession to close.

const DURATION = 2400

const at = (
  id: string,
  mood: MoodType,
  minute: number,
  intensity: Intensity = 1
): BeatRecord => ({
  id,
  dramaId: "d1",
  dramaTitle: "Love Between Fairy and Devil",
  episode: "Ep 12",
  mood,
  intensity,
  videoTime: minute * 60,
  duration: DURATION,
  capturedAt: minute * 60_000,
  updatedAt: minute * 60_000,
})

const MID_EPISODE: Array<BeatRecord> = [
  at("b1", "joy", 3),
  at("b2", "love", 8, 2),
  at("b3", "tension", 14),
  at("b4", "cringe", 17),
  at("b5", "sadness", 24, 3),
  at("b6", "tension", 29, 2),
  at("b7", "love", 36, 3),
]

// Replayed one press at a time; repeated ids are escalations of the same beat.
const REPLAY: Array<BeatRecord> = [
  at("r1", "joy", 2),
  at("r2", "love", 7),
  at("r2", "love", 7, 2),
  at("r3", "tension", 15),
  at("r4", "sadness", 22),
  at("r4", "sadness", 22, 2),
  at("r4", "sadness", 22, 3),
  at("r5", "love", 35, 3),
]

// ── Bridge ───────────────────────────────────────────────────────────────────

type BridgeProps = {
  size: CardSize
  seed: "empty" | "mid-episode"
  /** Push the REPLAY presses one by one, to watch the pulse and escalation. */
  replay: boolean
  replayIntervalMs: number
}

const LiveStripBridge = ({
  size,
  seed,
  replay,
  replayIntervalMs,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    // CSS scoping anchor — size rules key off #dc-root[data-size].
    const root = document.createElement("div")
    root.id = "dc-root"
    root.dataset.size = size
    root.style.cssText =
      "position:relative; display:inline-flex; flex-direction:column; align-items:flex-end; opacity:1; left:auto; top:auto;"

    const strip = new LiveStrip()
    strip.setBeats("Ep 12", seed === "mid-episode" ? MID_EPISODE : [])
    root.appendChild(strip.root)
    host.appendChild(root)

    let timer: ReturnType<typeof setInterval> | null = null
    if (replay) {
      let i = 0
      strip.setBeats("Ep 12", [])
      // Lifetime: this effect's. The cleanup below clears it when the story
      // unmounts or any control changes (size, seed, replay, interval).
      // eslint-disable-next-line extension-charter/require-named-lifetime -- lifetime stated above
      timer = setInterval(() => {
        const next = REPLAY[i % REPLAY.length]
        if (i > 0 && i % REPLAY.length === 0) strip.setBeats("Ep 12", [])
        if (next) strip.pushBeat(next)
        i++
      }, replayIntervalMs)
    }

    return () => {
      if (timer) clearInterval(timer)
      root.remove()
    }
  }, [size, seed, replay, replayIntervalMs])

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1a1a1a",
        padding: 48,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "flex-start",
      }}
    >
      <div ref={containerRef} />
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/LiveStrip",
  component: LiveStripBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    size: { control: "inline-radio", options: ["min", "compact", "full"] },
    seed: { control: "inline-radio", options: ["empty", "mid-episode"] },
    replay: {
      control: "boolean",
      description:
        "Push scripted presses (with escalations) one at a time to watch the pulse",
    },
    replayIntervalMs: { control: { type: "range", min: 600, max: 5000 } },
  },
  args: {
    size: "compact",
    seed: "mid-episode",
    replay: false,
    replayIntervalMs: 1800,
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

/** Before the first beat of the episode. */
export const Empty: Story = { args: { seed: "empty" } }

/** Seven beats in: the ride so far, resting after the last pulse. */
export const MidEpisode: Story = { name: "Mid-episode" }

/** Presses arriving live — pulse, escalation (●●●), and the curve extending. */
export const LiveReplay: Story = {
  name: "Live replay",
  args: { seed: "empty", replay: true },
}

/** Card shrunk to its pip: only the latest mood stays on stream. */
export const Minimised: Story = { args: { size: "min" } }
