import "@drama/styles/popup.css"

import { useEffect, useRef, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildTransitionEditor } from "."

type BridgeProps = {
  before: string
  after: string
}

const TransitionEditorBridge = ({ before, after }: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [log, setLog] = useState("")

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { root } = buildTransitionEditor(
      { transition: { before, after } },
      (patch) => {
        setLog(JSON.stringify(patch.transition))
      }
    )

    container.innerHTML = ""
    container.appendChild(root)

    return () => root.remove()
  }, [before, after])

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
        }}
      >
        last onChange: {log || "—"}
      </div>
    </div>
  )
}

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/JournalV3/TransitionEditor",
  component: TransitionEditorBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    before: { control: "text" },
    after: { control: "text" },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

export const Empty: Story = {
  args: { before: "", after: "" },
}

export const Filled: Story = {
  args: { before: "Lonely", after: "Loved" },
}
