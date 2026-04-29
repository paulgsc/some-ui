
import "@tab/styles/content.css"

import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor } from "@storybook/test"
import type { NodeState, Outcome, Segment } from "@tab/types"
import { FloatingHUD } from "@tab/ui/floating-hud"

// ── Mock factory ─────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    tabId: 1,
    url: "https://github.com/anthropics/anthropic-sdk-python",
    segment: null,
    visits: [],
    lastActiveMs: 0,
    activeStart: null,
    lastPostError: null,
    ...overrides,
  }
}

function makeVisits(
  outcomes: Outcome[],
  baseMs = Date.now()
): NodeState["visits"] {
  return outcomes.map((outcome, i) => ({
    outcome,
    timestamp: baseMs - i * 3_600_000,
  }))
}

// ── Bridge component ─────────────────────────────────────────────────────────

type BridgeProps = {
  nodeState: NodeState
  activeMs?: number
  simulateRegisterResult?: "ok" | "err"
}

const HUDBridge = ({
  nodeState,
  activeMs = 0,
  simulateRegisterResult = "ok",
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<FloatingHUD | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const hud = new FloatingHUD({
      onSegmentSelect: (seg: Segment) => {
        console.log("[story] segment selected:", seg)
        // Simulate background response: update node state
        const updated: NodeState = { ...nodeState, segment: seg }
        hud.updateNode(updated, activeMs)
      },
      onOutcomeRegister: (outcome: Outcome) => {
        console.log("[story] outcome registered:", outcome)
        if (simulateRegisterResult === "ok") {
          hud.onRegisterSuccess(outcome)
          // Simulate visit being added
          const newVisit = { outcome, timestamp: Date.now() }
          const updated: NodeState = {
            ...nodeState,
            visits: [...nodeState.visits, newVisit],
          }
          hud.updateNode(updated, activeMs)
        } else {
          hud.onRegisterError("Axum server unreachable (is it running on :3737?)")
        }
      },
    })

    instanceRef.current = hud
    hud.mount(containerRef.current)
    hud.updateNode(nodeState, activeMs)

    return () => {
      hud.unmount()
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live update when props change
  useEffect(() => {
    instanceRef.current?.updateNode(nodeState, activeMs)
  }, [nodeState, activeMs])

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "340px",
        background:
          "linear-gradient(135deg, #060609 0%, #0d0d14 50%, #060609 100%)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    />
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "Extensions/TabLedger/FloatingHUD",
  parameters: {
    layout: "padded",
    backgrounds: { default: "dark" },
  },
}

export default meta
type Story = StoryObj

// ── Stories ──────────────────────────────────────────────────────────────────

/** Chip at rest — tab has never been assigned or visited */
export const Unassigned: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode()}
      activeMs={0}
    />
  ),
}

/** Click chip → segment picker opens */
export const PickerOpen: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode()}
      activeMs={0}
    />
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector(".__tl2_chip")).toBeInTheDocument()
    }, { timeout: 2000 })
    const chip = canvasElement.querySelector<HTMLElement>(".__tl2_chip")!
    await userEvent.click(chip)
    await waitFor(() => {
      expect(canvasElement.querySelector(".__tl2_panel.tl-open")).toBeInTheDocument()
      expect(canvasElement.querySelector(".__tl2_picker")).toBeInTheDocument()
    })
  },
}

/** DSA segment assigned, no visits yet, gate locked */
export const AssignedNoVisits: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode({ segment: "dsa" })}
      activeMs={0}
    />
  ),
}

/** Systems segment, gate 60% filled (3min of 5min) */
export const GatePartiallyOpen: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode({ segment: "systems" })}
      activeMs={3 * 60 * 1000}
    />
  ),
}

/** Gate fully unlocked — ready to register */
export const GateUnlocked: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode({ segment: "math" })}
      activeMs={6 * 60 * 1000}
    />
  ),
}

/** Chip shows visit count and freshness — visited recently */
export const FrequentlyVisited: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode({
        segment: "dsa",
        visits: makeVisits(["Progress", "Progress", "Stuck", "Progress", "Review"]),
      })}
      activeMs={6 * 60 * 1000}
    />
  ),
}

/** Infra segment, stale — last visit was 2 days ago */
export const StaleNode: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode({
        segment: "infra",
        visits: makeVisits(
          ["Progress", "Stuck"],
          Date.now() - 2 * 24 * 3_600_000
        ),
      })}
      activeMs={0}
    />
  ),
}

/** POST error typestate — server unreachable, visit recorded locally */
export const PostError: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode({
        segment: "systems",
        visits: makeVisits(["Progress"]),
        lastPostError: "Axum server unreachable (is it running on :3737?)",
      })}
      activeMs={6 * 60 * 1000}
      simulateRegisterResult="err"
    />
  ),
}

/** Language segment — rich outcome distribution */
export const OutcomeDistribution: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode({
        segment: "language",
        visits: makeVisits([
          "Progress", "Progress", "Review", "Stuck",
          "Progress", "Review", "Progress", "Progress",
          "Stuck", "Review",
        ]),
      })}
      activeMs={6 * 60 * 1000}
    />
  ),
}

/** Full interactive flow: click chip → pick segment → panel shows → register outcome */
export const FullFlow: Story = {
  render: () => (
    <HUDBridge
      nodeState={makeNode()}
      activeMs={6 * 60 * 1000}
    />
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector(".__tl2_chip")).toBeInTheDocument()
    }, { timeout: 2000 })

    // Open panel
    const chip = canvasElement.querySelector<HTMLElement>(".__tl2_chip")!
    await userEvent.click(chip)

    await waitFor(() => {
      expect(canvasElement.querySelector(".__tl2_picker")).toBeInTheDocument()
    })

    // Pick DSA
    const dsaBtn = Array.from(
      canvasElement.querySelectorAll<HTMLElement>(".__tl2_seg_btn")
    ).find((b) => b.textContent?.includes("DSA"))!
    await userEvent.click(dsaBtn)

    // Should now show node panel with gate unlocked (6min activeMs)
    await waitFor(() => {
      expect(canvasElement.querySelector(".__tl2_node")).toBeInTheDocument()
      // All outcome buttons should be enabled
      const btns = canvasElement.querySelectorAll<HTMLButtonElement>(".__tl2_outcome_btn")
      for (const btn of btns) {
        expect(btn.disabled).toBe(false)
      }
    })

    // Register Progress
    const progressBtn = canvasElement.querySelector<HTMLElement>(".__tl2_btn_progress")!
    await userEvent.click(progressBtn)

    await waitFor(() => {
      expect(canvasElement.querySelector(".__tl2_success")).toBeInTheDocument()
    })
  },
}
