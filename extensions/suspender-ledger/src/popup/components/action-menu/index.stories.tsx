import { useEffect, useRef } from "react"

import "@suspender/popup/popup.css"

import type { Meta, StoryObj } from "@storybook/react-vite"

import { ActionMenu, type ActionMenuProps } from "."

// ── Bridge ──────────────────────────────────────────────────────────────────

const ActionMenuBridge = (props: ActionMenuProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    host.replaceChildren(ActionMenu(props))
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

const meta: Meta<ActionMenuProps> = {
  title: "Extensions/SuspenderLedger/Popup/ActionMenu",
  component: ActionMenuBridge,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  args: {
    onCommand: () => undefined,
  },
  argTypes: {
    whitelisted: { control: "boolean" },
    autoSuspendable: { control: "boolean" },
  },
}

export default meta
type Story = StoryObj<ActionMenuProps>

// ── Stories ────────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: { whitelisted: false, autoSuspendable: true },
}

export const WhitelistedHost: Story = {
  args: { whitelisted: true, autoSuspendable: false },
}
