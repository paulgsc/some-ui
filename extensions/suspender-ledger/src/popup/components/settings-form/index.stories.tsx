import { useEffect, useRef } from "react"

import "@suspender/popup/popup.css"

import type { Meta, StoryObj } from "@storybook/react-vite"

import { SettingsForm, type SettingsFormProps } from "."

// ── Bridge ──────────────────────────────────────────────────────────────────

const SettingsFormBridge = (props: SettingsFormProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return
    host.replaceChildren(SettingsForm(props))
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

const meta: Meta<SettingsFormProps> = {
  title: "Extensions/SuspenderLedger/Popup/SettingsForm",
  component: SettingsFormBridge,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  args: {
    onChange: () => undefined,
    onWhitelistAdd: () => undefined,
    onWhitelistRemove: () => undefined,
  },
}

export default meta
type Story = StoryObj<SettingsFormProps>

// ── Stories ────────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    values: {
      idleTimeoutMinutes: 5,
      discardPeriodMinutes: 10,
      minTabs: 6,
      showFavicon: true,
      prepend: "💤",
      suspendPinned: false,
      whitelist: ["github.com", "re:^https://mail\\."],
    },
    shortcuts: [
      { description: "Suspend all discardable tabs", shortcut: "Alt+D" },
      { description: "Suspend the active tab", shortcut: "Alt+Shift+D" },
    ],
  },
}

export const Empty: Story = {
  args: {
    values: {
      idleTimeoutMinutes: 5,
      discardPeriodMinutes: 10,
      minTabs: 6,
      showFavicon: false,
      prepend: "💤",
      suspendPinned: false,
      whitelist: [],
    },
    shortcuts: [],
  },
}
