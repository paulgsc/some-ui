import { useEffect, useRef } from "react"

import "@suspender/popup/popup.css"

import type { Meta, StoryObj } from "@storybook/react-vite"

import { TabStatus, type TabStatusProps } from "."

// ── Bridge ──────────────────────────────────────────────────────────────────

const TabStatusBridge = (props: TabStatusProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    host.replaceChildren(TabStatus(props))
    return () => host.replaceChildren()
  }, [props])

  return (
    <div
      ref={containerRef}
      style={{ background: "#1a1a1a", padding: "12px", width: "320px" }}
    />
  )
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<TabStatusProps> = {
  title: "Extensions/SuspenderLedger/Popup/TabStatus",
  component: TabStatusBridge,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  argTypes: {
    state: { control: "inline-radio", options: ["active", "suspended"] },
    whitelisted: { control: "boolean" },
  },
}

export default meta
type Story = StoryObj<TabStatusProps>

// ── Stories ────────────────────────────────────────────────────────────────────

export const Active: Story = {
  args: {
    title: "Mozilla Developer Network",
    favIconUrl: "https://developer.mozilla.org/favicon-48x48.png",
    state: "active",
    whitelisted: false,
  },
}

export const Suspended: Story = {
  args: {
    title: "A very long tab title that should be truncated with an ellipsis",
    state: "suspended",
    whitelisted: false,
  },
}

export const Whitelisted: Story = {
  args: {
    title: "github.com",
    state: "active",
    whitelisted: true,
  },
}
