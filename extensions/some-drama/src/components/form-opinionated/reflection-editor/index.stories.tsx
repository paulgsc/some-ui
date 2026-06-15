import "@drama/styles/popup.css"

import { useEffect, useRef, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildReflectionEditor } from "."

type BridgeProps = {
  reflection: string
}

const ReflectionEditorBridge = ({ reflection }: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [log, setLog] = useState("")

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { root } = buildReflectionEditor({ reflection }, (patch) => {
      setLog(patch.reflection ?? "")
    })

    container.innerHTML = ""
    container.appendChild(root)

    return () => root.remove()
  }, [reflection])

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
      <div
        style={{
          color: "rgba(255,255,255,0.4)",
          fontFamily: "monospace",
          fontSize: 11,
          maxWidth: 480,
        }}
      >
        last onChange: {log || "—"}
      </div>
    </div>
  )
}

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/JournalV3/ReflectionEditor",
  component: ReflectionEditorBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    reflection: { control: "text" },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

export const Empty: Story = {
  args: { reflection: "" },
}

export const Filled: Story = {
  args: {
    reflection:
      "The confession finally broke the emotional stalemate that existed for six episodes.",
  },
}

export const LongText: Story = {
  args: {
    reflection:
      "Every scene in this episode built toward the rooftop confrontation. The pacing, the score, the silence between lines — all of it landed exactly when it needed to, and the payoff justified every slow-burn moment that came before.",
  },
}
