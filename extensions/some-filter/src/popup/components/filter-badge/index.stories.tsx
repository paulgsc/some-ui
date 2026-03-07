import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import "@censor/popup/popup.css"

// Assuming your vanilla component is exported from a local file
import { FilterBadge, type FilterBadgeProps } from "."

// ── Bridge ──────────────────────────────────────────────────────────────────

/**
 * Wraps the Vanilla HTMLElement FilterBadge into a React component
 * so Storybook (react-vite) can manage its state and props.
 */
const FilterBadgeBridge = (props: FilterBadgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (containerRef.current) {
      // Clear container and generate new element
      // For vanilla components without an .update() method,
      // we re-render on prop changes.
      containerRef.current.innerHTML = ""
      elementRef.current = FilterBadge(props)
      containerRef.current.appendChild(elementRef.current)
    }

    return () => {
      elementRef.current?.remove()
      elementRef.current = null
    }
  }, [props]) // Re-run whenever any prop changes

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#0d0d0f",
        fontFamily: "var(--font-sans, sans-serif)",
        borderRadius: "12px",
      }}
    />
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<FilterBadgeProps> = {
  title: "Extensions/TabFilter/Components/FilterBadge",
  component: FilterBadgeBridge,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  argTypes: {
    filteredCount: { control: { type: "range", min: 0, max: 20 } },
    selectedCount: { control: { type: "range", min: 0, max: 20 } },
    filterActive: { control: "boolean" },
  },
}

export default meta
type Story = StoryObj<FilterBadgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Idle: Story = {
  args: { filteredCount: 0, selectedCount: 0, filterActive: false },
}

export const ActiveFiltering: Story = {
  args: { filteredCount: 4, selectedCount: 0, filterActive: true },
}

export const SelectionInProgress: Story = {
  args: { filteredCount: 2, selectedCount: 3, filterActive: false },
}

export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <FilterBadgeBridge
        filteredCount={0}
        selectedCount={0}
        filterActive={false}
      />
      <FilterBadgeBridge
        filteredCount={5}
        selectedCount={0}
        filterActive={true}
      />
      <FilterBadgeBridge
        filteredCount={0}
        selectedCount={3}
        filterActive={false}
      />
      <FilterBadgeBridge
        filteredCount={8}
        selectedCount={8}
        filterActive={true}
      />
    </div>
  ),
}
