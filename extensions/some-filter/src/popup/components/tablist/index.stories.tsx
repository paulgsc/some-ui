import { useEffect, useRef } from "react"
import { WindowGroupHeader } from "@filter/popup/components/window-group-header"
import type { TabEntry, WindowGroup } from "@filter/types/popup"
import type { Meta, StoryObj } from "@storybook/react-vite"

import "@filter/popup/popup.css"

import { TabList, type TabListProps } from "."

// ── Bridge ──────────────────────────────────────────────────────────────────

const TabListBridge = (props: TabListProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = ""
      elementRef.current = TabList(props)
      containerRef.current.appendChild(elementRef.current)
    }
    return () => {
      elementRef.current?.remove()
      elementRef.current = null
    }
  }, [props])

  return (
    <div
      ref={containerRef}
      style={{
        background: "#0d0d0f",
        width: "360px",
        maxHeight: "600px",
        overflowY: "auto",
        border: "1px solid #222",
        borderRadius: "8px",
      }}
    />
  )
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeTabs = (windowId: number, startId: number): Array<TabEntry> => [
  {
    id: startId,
    windowId,
    title: "GitHub – Your repositories",
    url: "https://github.com",
    favIconUrl: "https://github.com/favicon.ico",
    active: true,
    audible: false,
    pinned: false,
    status: "complete",
  },
  {
    id: startId + 1,
    windowId,
    title: "Google Docs – Project Brief",
    url: "https://docs.google.com/document/d/abc",
    favIconUrl: "https://docs.google.com/favicon.ico",
    active: false,
    audible: false,
    pinned: true,
    status: "complete",
  },
  {
    id: startId + 2,
    windowId,
    title: "Spotify Web Player",
    url: "https://spotify.com",
    favIconUrl: "https://spotify.com/favicon.ico",
    active: false,
    audible: true,
    pinned: false,
    status: "complete",
  },
  {
    id: startId + 3,
    windowId,
    title: "Stack Overflow – React hooks",
    url: "https://stackoverflow.com",
    favIconUrl: "",
    active: false,
    audible: false,
    pinned: false,
    status: "loading",
  },
]

const groups: Array<WindowGroup> = [
  { windowId: 1, windowIndex: 1, tabs: makeTabs(1, 100) },
  { windowId: 2, windowIndex: 2, tabs: makeTabs(2, 200) },
]

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<TabListProps> = {
  title: "Extensions/TabFilter/Components/TabList",
  component: TabListBridge,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  args: {
    // These are actions
    onTabToggle: () => {},
    onWindowSelectAll: () => {},
    onWindowDeselect: () => {},
    // This MUST be the actual function, not an action()
    WindowGroupHeader: WindowGroupHeader,
  },
}

export default meta
type Story = StoryObj<TabListProps>

// ── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: {
    groups,
    selectedTabIds: new Set([100, 201]),
    filteredTabIds: new Set([100]),
  },
}

export const Empty: Story = {
  args: {
    groups: [],
    selectedTabIds: new Set(),
    filteredTabIds: new Set(),
  },
}
