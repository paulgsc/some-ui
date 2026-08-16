import { useEffect, useRef } from "react"

import "@suspender/popup/popup.css"

import type { Meta, StoryObj } from "@storybook/react-vite"

import { DiscardBanner, type DiscardBannerProps } from "."

// ── Bridge ──────────────────────────────────────────────────────────────────

const DiscardBannerBridge = (props: DiscardBannerProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    host.replaceChildren(DiscardBanner(props))
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

const meta: Meta<DiscardBannerProps> = {
  title: "Extensions/SuspenderLedger/Popup/DiscardBanner",
  component: DiscardBannerBridge,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
}

export default meta
type Story = StoryObj<DiscardBannerProps>

// ── Stories ────────────────────────────────────────────────────────────────────

export const Empty: Story = {
  args: { reasons: [] },
}

export const ProtectedOnly: Story = {
  args: { reasons: ["This page asked not to be interrupted"] },
}

export const ProtectedAndMedia: Story = {
  args: {
    reasons: [
      "This page asked not to be interrupted",
      "Playing audio or video",
    ],
  },
}
