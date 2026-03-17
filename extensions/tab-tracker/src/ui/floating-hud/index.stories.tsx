import "@tab/styles/content.css"

import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "@storybook/test"
import type { TabRecord } from "@tab/types"
import type { HUDUpdatePayload } from "@tab/ui/floating-hud"
import { FloatingHUD } from "@tab/ui/floating-hud"

// ── Mock record factory ──────────────────────────────────────────────────────

function makeMockRecord(overrides: Partial<TabRecord> = {}): TabRecord {
  return {
    tabId: 1,
    url: "https://github.com/anthropics/anthropic-sdk-python",
    title: "anthropics/anthropic-sdk-python — GitHub",
    favicon: "https://github.com/favicon.ico",
    totalMs: 0,
    sessionMs: 0,
    lastActivated: Date.now(),
    isActive: true,
    intentional: false,
    buckets: [2, 5, 12, 8, 15, 10, 7, 4],
    bucketStart: Date.now() - 2 * 60 * 60 * 1000,
    ...overrides,
  }
}

// ── Bridge ──────────────────────────────────────────────────────────────────

type HUDBridgeProps = {
  payload: HUDUpdatePayload
  showFlash?: boolean
}

const HUDBridge = ({ payload, showFlash = false }: HUDBridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const instance = useRef<FloatingHUD | null>(null)

  useEffect(() => {
    if (containerRef.current && !instance.current) {
      instance.current = new FloatingHUD()
      instance.current.mount(containerRef.current)
    }
    if (showFlash) {
      instance.current?.flashSession(payload.sessionElapsed)
    }
    instance.current?.update(payload)

    return () => {
      instance.current?.unmount()
      instance.current = null
    }
  }, [payload, showFlash])

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "300px",
        position: "relative",
        background:
          "radial-gradient(ellipse at 70% 40%, rgba(124,58,237,0.08) 0%, transparent 60%), linear-gradient(135deg, #0d0d14 0%, #13131e 100%)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    />
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "Extensions/TabLedger/Components/FloatingHUD",
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
}
export default meta
type Story = StoryObj

// ── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  render: () => (
    <HUDBridge
      payload={{
        record: makeMockRecord(),
        elapsed: 4 * 60 * 1000,
        sessionElapsed: 4 * 60 * 1000,
        neglect: null,
        tags: ["live"],
      }}
    />
  ),
}

export const AmberTier: Story = {
  render: () => (
    <HUDBridge
      payload={{
        record: makeMockRecord(),
        elapsed: 20 * 60 * 1000,
        sessionElapsed: 20 * 60 * 1000,
        neglect: null,
        tags: ["live", "deep_work"],
      }}
    />
  ),
}

export const RedTier: Story = {
  render: () => (
    <HUDBridge
      payload={{
        record: makeMockRecord({ title: "Reddit · r/programming" }),
        elapsed: 50 * 60 * 1000,
        sessionElapsed: 50 * 60 * 1000,
        neglect: null,
        tags: ["live", "rabbit_hole"],
      }}
    />
  ),
}

export const VioletTier: Story = {
  render: () => (
    <HUDBridge
      payload={{
        record: makeMockRecord({
          title: "Linear — sprint planning",
          intentional: true,
        }),
        elapsed: 95 * 60 * 1000,
        sessionElapsed: 95 * 60 * 1000,
        neglect: null,
        tags: ["live", "deep_work", "intentional"],
      }}
    />
  ),
}

export const WithNeglect: Story = {
  render: () => (
    <HUDBridge
      payload={{
        record: makeMockRecord({ title: "Twitter" }),
        elapsed: 47 * 60 * 1000,
        sessionElapsed: 47 * 60 * 1000,
        neglect: "github.com",
        tags: ["live", "rabbit_hole", "neglected"],
      }}
    />
  ),
}

export const SessionFlash: Story = {
  render: () => (
    <HUDBridge
      showFlash
      payload={{
        record: makeMockRecord(),
        elapsed: 12 * 60 * 1000,
        sessionElapsed: 12 * 60 * 1000,
        neglect: null,
        tags: ["live"],
      }}
    />
  ),
}

export const Inactive: Story = {
  render: () => (
    <HUDBridge
      payload={{
        record: makeMockRecord({ isActive: false, lastActivated: 0 }),
        elapsed: 33 * 60 * 1000,
        sessionElapsed: 8 * 60 * 1000,
        neglect: null,
        tags: [],
      }}
    />
  ),
}

// Click to expand context panel
export const ExpandedPanel: Story = {
  render: () => (
    <HUDBridge
      payload={{
        record: makeMockRecord({
          title: "anthropics/anthropic-sdk-python — GitHub",
          buckets: [1, 3, 7, 12, 15, 11, 9, 6, 4, 8],
          intentional: true,
        }),
        elapsed: 68 * 60 * 1000,
        sessionElapsed: 68 * 60 * 1000,
        neglect: null,
        tags: ["live", "deep_work", "intentional"],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    await waitFor(
      () => {
        const chip = canvasElement.querySelector(".__tl_chip")
        expect(chip).toBeInTheDocument()
      },
      { timeout: 2000 }
    )
    const chip = canvasElement.querySelector<HTMLElement>(".__tl_chip")!
    await userEvent.click(chip)
    await waitFor(() => {
      expect(
        canvasElement.querySelector(".__tl_context_panel.open")
      ).toBeInTheDocument()
    })
  },
}
