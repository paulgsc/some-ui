import "@tab/styles/content.css"

import { useEffect, useRef, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "@storybook/test"
import { Toast } from "@tab/ui/toast"

// ── Bridge ──────────────────────────────────────────────────────────────────

type ToastBridgeProps = {
  text?: string
  color?: string
  autoShow?: boolean
}

const ToastBridge = ({
  text = "15m on this tab",
  color = "#f59e0b",
  autoShow = true,
}: ToastBridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const instance = useRef<Toast | null>(null)

  useEffect(() => {
    if (containerRef.current && !instance.current) {
      instance.current = new Toast()
      instance.current.mount(containerRef.current)
    }
    if (autoShow) {
      instance.current?.show(text, color)
    }

    return () => {
      instance.current?.getElement().remove()
      instance.current = null
    }
  }, [text, color, autoShow])

  const trigger = () => instance.current?.show(text, color)

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "120px",
        background: "rgba(20,20,28,0.6)",
        borderRadius: 8,
        display: "flex",
        alignItems: "flex-end",
        padding: "0 0 12px 12px",
      }}
    >
      <button
        onClick={trigger}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          padding: "6px 10px",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 5,
          color: "rgba(255,255,255,0.7)",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "monospace",
        }}
      >
        trigger
      </button>
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<ToastBridgeProps> = {
  title: "Extensions/TabLedger/Components/Toast",
  component: ToastBridge,
  parameters: { layout: "padded", backgrounds: { default: "dark" } },
  argTypes: {
    text: { control: "text" },
    color: { control: "color" },
    autoShow: { control: "boolean" },
  },
}

export default meta
type Story = StoryObj<ToastBridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: { text: "15m on this tab", color: "#f59e0b", autoShow: true },
}

export const FortyFive: Story = {
  args: { text: "45m on this tab", color: "#ef4444", autoShow: true },
}

export const NinetyMin: Story = {
  args: { text: "1h 30m on this tab", color: "#7c3aed", autoShow: true },
}

export const AllToasts: Story = {
  render: () => {
    const toasts = [
      { text: "15m on this tab", color: "#f59e0b" },
      { text: "45m on this tab", color: "#ef4444" },
      { text: "1h 30m on this tab", color: "#7c3aed" },
    ]
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <ToastBridge key={t.text} {...t} autoShow />
        ))}
      </div>
    )
  },
}
