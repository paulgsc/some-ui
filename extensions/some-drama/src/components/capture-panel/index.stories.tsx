import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { CapturePanel } from "."

// ── Bridge ───────────────────────────────────────────────────────────────────
// Mounts a bare CapturePanel so the open/close animation, emotion button
// grid, and selection highlight can be validated in complete isolation.
// The panel starts open by default here since its natural state is hidden
// inside the card stack — open is what you're actually designing.

type BridgeProps = {
  /** Start the panel open so the animation is visible from mount */
  startOpen: boolean
  /** Log selected mood to action instead of auto-closing after 800ms */
  inhibitAutoClose: boolean
}

const CapturePanelBridge = ({
  startOpen = true,
  inhibitAutoClose = false,
}: BridgeProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<CapturePanel | null>(null)

  useEffect(() => {
    if (!containerRef.current || panelRef.current) return

    // CSS scoping anchor
    const root = document.createElement("div")
    root.id = "dc-root"
    root.dataset.size = "full"
    root.style.cssText =
      "position:relative; display:inline-flex; flex-direction:column; align-items:flex-end;"

    const panel = new CapturePanel()

    panel.onMoodSelect = (mood) => {
      console.log("Mood selected:", mood)
      // When inhibitAutoClose is on, bypass the internal 800ms close timer
      // by doing nothing here — the button highlight stays visible for inspection.
    }

    // Patch: intercept auto-close when inhibitAutoClose is on.
    // We override close() after mount for demo purposes.
    if (inhibitAutoClose) {
      const original = panel.close.bind(panel)
      panel.close = () => {
        // no-op: keep panel open so button states are inspectable
        console.log("auto-close suppressed for story inspection")
      }
    }

    root.appendChild(panel.root)
    containerRef.current.appendChild(root)
    panelRef.current = panel

    if (startOpen) {
      // Defer so CSS transition has a frame to start from
      requestAnimationFrame(() => panel.open())
    }

    return () => {
      panelRef.current = null
      root.remove()
    }
  }, [])

  // Sync startOpen control
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    startOpen ? panel.open() : panel.close()
  }, [startOpen])

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 24,
        background:
          "linear-gradient(135deg, hsl(220 30% 14%), hsl(240 25% 8%))",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.25)",
          fontFamily: "monospace",
          fontSize: 11,
        }}
      >
        CapturePanel — click any emoji to trigger onMoodSelect (logged to
        console)
      </div>

      {/* Simulated card stub above panel (mirrors real DOM order) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(135deg, hsl(30 60% 97% / 0.93), hsl(350 55% 96% / 0.89))",
            backdropFilter: "blur(20px)",
            border: "1px solid hsl(20 60% 80% / 0.40)",
            borderRadius: 24,
            padding: "12px 16px",
            color: "hsl(25 35% 28%)",
            fontFamily: "Georgia, serif",
            fontStyle: "italic",
            fontSize: 12,
            boxShadow: "0 8px 40px hsl(340 50% 30% / 0.32)",
            minWidth: 260,
            textAlign: "center",
          }}
        >
          ↑ card would sit here
        </div>

        {/* Panel under test */}
        <div ref={containerRef} style={{ width: "100%" }} />
      </div>

      {/* Toggle buttons for manual interaction testing */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["Open", "Close", "Toggle"] as const).map((action) => (
          <button
            key={action}
            onClick={() => {
              const p = panelRef.current
              if (!p) return
              if (action === "Open") p.open()
              if (action === "Close") p.close()
              if (action === "Toggle") p.toggle()
            }}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid hsl(340 50% 60% / 0.5)",
              background: "hsl(340 50% 95% / 0.12)",
              color: "hsl(340 40% 80%)",
              fontFamily: "Georgia, serif",
              fontStyle: "italic",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {action}
          </button>
        ))}
      </div>

      <div
        style={{
          color: "rgba(255,255,255,0.12)",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontSize: 11,
        }}
      >
        CapturePanel — isolated from card shell and slideshow
      </div>
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/CapturePanel",
  component: CapturePanelBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    startOpen: {
      control: "boolean",
      description:
        "Panel starts expanded — toggle to test open/close animation",
    },
    inhibitAutoClose: {
      control: "boolean",
      description:
        "Suppress the 800ms auto-close after emoji selection so you can inspect the selected state",
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

/** Default — panel open, auto-close active (normal UX flow). */
export const OpenDefault: Story = {
  name: "Open (default)",
  args: {
    startOpen: true,
    inhibitAutoClose: false,
  },
}

/** Closed — panel collapsed, tests the max-height:0 state. */
export const Closed: Story = {
  args: {
    startOpen: false,
    inhibitAutoClose: false,
  },
}

/** Inspect selection — auto-close suppressed so button highlight stays visible. */
export const InspectSelection: Story = {
  name: "Inspect Selection State",
  args: {
    startOpen: true,
    inhibitAutoClose: true,
  },
}
