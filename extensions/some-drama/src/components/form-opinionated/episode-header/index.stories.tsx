
import "@drama/styles/popup.css"

import { useEffect, useRef, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildEpisodeHeader } from "."

type BridgeProps = {
  title: string
  episode: number
  watchDate: string
}

const EpisodeHeaderBridge = ({ title, episode, watchDate }: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [log, setLog] = useState("")

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { root } = buildEpisodeHeader(
      { title, episode, watchDate },
      (patch) => setLog(JSON.stringify(patch))
    )

    container.innerHTML = ""
    container.appendChild(root)

    return () => root.remove()
  }, [title, episode, watchDate])

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
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div ref={containerRef} />
      </div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: 11 }}>
        last onChange: {log || "—"}
      </div>
    </div>
  )
}

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/JournalV3/EpisodeHeader",
  component: EpisodeHeaderBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    title: { control: "text" },
    episode: { control: { type: "number", min: 0 } },
    watchDate: { control: "text" },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

export const Default: Story = {
  args: { title: "Crash Landing on You", episode: 12, watchDate: "2026-06-14" },
}

export const Empty: Story = {
  args: { title: "", episode: 0, watchDate: "2026-06-14" },
}
