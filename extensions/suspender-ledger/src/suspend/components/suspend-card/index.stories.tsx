import { useEffect, useRef } from "react"

import "@suspender/suspend/suspend.css"

import type { Meta, StoryObj } from "@storybook/react-vite"

import { SuspendCard, type SuspendCardProps } from "."

// ── Bridge ──────────────────────────────────────────────────────────────────

const SuspendCardBridge = (props: SuspendCardProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    host.replaceChildren(SuspendCard(props))
    return () => host.replaceChildren()
  }, [props])

  return (
    <div
      ref={containerRef}
      style={{
        background: "#1a1a1a",
        padding: "40px",
        width: "440px",
      }}
    />
  )
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<SuspendCardProps> = {
  title: "Extensions/SuspenderLedger/Suspend/SuspendCard",
  component: SuspendCardBridge,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  args: {
    onRestore: () => undefined,
  },
  argTypes: {
    recovery: { control: "boolean" },
  },
}

export default meta
type Story = StoryObj<SuspendCardProps>

// ── Stories ────────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    title: "Mozilla Developer Network",
    url: "https://developer.mozilla.org/en-US/docs/Web/API",
    favIconUrl: "https://developer.mozilla.org/favicon-48x48.png",
    recovery: false,
  },
}

export const NoFavicon: Story = {
  args: {
    title: "Some long article title that wraps across two lines comfortably",
    url: "https://example.com/blog/a/very/long/path/segment/here",
    recovery: false,
  },
}

export const Recovery: Story = {
  args: {
    title: "",
    url: "",
    recovery: true,
  },
}
