import "@drama/styles/popup.css"

import { useEffect, useRef, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { buildQuoteCapture } from "."

type BridgeProps = {
  quote: string
}

const QuoteCaptureBridge = ({ quote }: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [log, setLog] = useState("")

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { root } = buildQuoteCapture({ quote }, (patch) => {
      setLog(patch.quote ?? "")
    })

    container.innerHTML = ""
    container.appendChild(root)

    return () => root.remove()
  }, [quote])

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
  title: "Extensions/Drama/Components/JournalV3/QuoteCapture",
  component: QuoteCaptureBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    quote: { control: "text" },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

export const Empty: Story = {
  args: { quote: "" },
}

export const Filled: Story = {
  args: { quote: "Stay. Just this once." },
}
