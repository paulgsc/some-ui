import { useEffect, useRef } from "react"

import "@censor/popup/popup.css"

import type { Meta, StoryObj } from "@storybook/react-vite"

import { ActionBar, type ActionBarProps } from "."

// ── Bridge ──────────────────────────────────────────────────────────────────

const ActionBarBridge = (props: ActionBarProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (containerRef.current) {
      // Clear container for fresh mount
      containerRef.current.innerHTML = ""
      // Generate the vanilla DOM element
      instanceRef.current = ActionBar(props)
      containerRef.current.appendChild(instanceRef.current)
    }

    return () => {
      instanceRef.current?.remove()
      instanceRef.current = null
    }
  }, [props]) // Re-render on any prop change to re-bind listeners

  return (
    <div
      ref={containerRef}
      style={{
        background: "#141417",
        minHeight: "80px",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
      }}
    />
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<ActionBarProps> = {
  title: "Extensions/TabFilter/Components/ActionBar",
  component: ActionBarBridge,
  parameters: {
    layout: "fullscreen",
    backgrounds: { default: "dark" },
  },
  argTypes: {
    selectedCount: { control: { type: "range", min: 0, max: 50 } },
    statusFilter: {
      control: "select",
      options: [null, "active", "audible", "pinned"],
    },
  },
}

export default meta
type Story = StoryObj<ActionBarProps>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: { selectedCount: 0, statusFilter: null },
}

export const SelectionActive: Story = {
  args: { selectedCount: 7, statusFilter: null },
}

export const FilterApplied: Story = {
  args: { selectedCount: 2, statusFilter: "audible" },
}

export const ComparisonView: Story = {
  render: (args) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        background: "#000",
      }}
    >
      <ActionBarBridge {...args} statusFilter={null} />
      <ActionBarBridge {...args} statusFilter="active" />
      <ActionBarBridge {...args} statusFilter="pinned" />
    </div>
  ),
}
