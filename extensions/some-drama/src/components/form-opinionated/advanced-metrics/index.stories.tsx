
import "@drama/styles/popup.css"

import { useEffect, useRef, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildAdvancedMetrics } from "."
import { defaultDraft } from "../use-drama-journal-state"

type BridgeProps = {
  rating: number
  momentumDirection: "rising" | "steady" | "falling"
  completionLikelihood: number
  connection: number
  hope: number
  trust: number
  control: number
  currentEpisode: number
  totalEpisodes: number
}

const AdvancedMetricsBridge = (props: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [log, setLog] = useState("")

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const base = defaultDraft({})
    const value = {
      rating: props.rating,
      momentum: { value: 50, direction: props.momentumDirection },
      completionLikelihood: props.completionLikelihood,
      axes: {
        connection: props.connection,
        hope: props.hope,
        trust: props.trust,
        control: props.control,
      },
      peakLine: base.peakLine,
      currentEpisode: props.currentEpisode,
      totalEpisodes: props.totalEpisodes,
    }

    const { root } = buildAdvancedMetrics(value, (patch) => setLog(JSON.stringify(patch)))

    container.innerHTML = ""
    container.appendChild(root)

    return () => root.remove()
  }, [props])

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "40px 0",
        background: "var(--moon-900)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480, background: "var(--dj-paper)", borderRadius: 12, padding: 16 }}>
        <div ref={containerRef} />
      </div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: 11, maxWidth: 480 }}>
        last onChange: {log || "—"}
      </div>
    </div>
  )
}

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/JournalV3/AdvancedMetrics",
  component: AdvancedMetricsBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    rating: { control: { type: "range", min: 0, max: 10, step: 2 } },
    momentumDirection: { control: "inline-radio", options: ["rising", "steady", "falling"] },
    completionLikelihood: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    connection: { control: { type: "range", min: -100, max: 100, step: 5 } },
    hope: { control: { type: "range", min: -100, max: 100, step: 5 } },
    trust: { control: { type: "range", min: -100, max: 100, step: 5 } },
    control: { control: { type: "range", min: -100, max: 100, step: 5 } },
    currentEpisode: { control: { type: "number", min: 0 } },
    totalEpisodes: { control: { type: "number", min: 1 } },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

export const Default: Story = {
  args: {
    rating: 8,
    momentumDirection: "rising",
    completionLikelihood: 0.9,
    connection: 70,
    hope: -30,
    trust: -80,
    control: 40,
    currentEpisode: 12,
    totalEpisodes: 16,
  },
}

export const FreshSlate: Story = {
  args: {
    rating: 0,
    momentumDirection: "steady",
    completionLikelihood: 0.5,
    connection: 0,
    hope: 0,
    trust: 0,
    control: 0,
    currentEpisode: 1,
    totalEpisodes: 16,
  },
}
