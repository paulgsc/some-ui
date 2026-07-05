import { useEffect, useRef } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { DragController } from "."

// ── Bridge ───────────────────────────────────────────────────────────────────
// Creates a draggable box and wires DragController to it so pointer behaviour
// (onMove, onDragEnd, ignore-selector suppression) can be verified in isolation
// without the full DramaCard shell.

type BridgeProps = {
  /** Initial left offset from the viewport origin (px) */
  startX: number
  /** Initial top offset from the viewport origin (px) */
  startY: number
  /** Comma-separated CSS selectors whose pointerdown should NOT start a drag */
  ignoreSelectors: string
}

const DragControllerBridge = ({
  startX = 100,
  startY = 100,
  ignoreSelectors = ".dc-ignore",
}: BridgeProps) => {
  const vpRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const vp = vpRef.current
    if (!vp) return

    const box = document.createElement("div")
    box.style.cssText = `
      position: absolute;
      left: ${startX}px;
      top: ${startY}px;
      width: 140px;
      padding: 16px 18px;
      background: linear-gradient(135deg, hsl(340 50% 20% / 0.9), hsl(220 40% 14% / 0.85));
      border: 1px solid hsl(340 50% 55% / 0.4);
      border-radius: 16px;
      color: hsl(30 20% 90%);
      font-family: Georgia, serif;
      font-size: 12px;
      font-style: italic;
      cursor: grab;
      user-select: none;
      touch-action: none;
      box-shadow: 0 8px 32px hsl(340 50% 30% / 0.3);
    `
    box.textContent = "drag me"

    // Nested button whose pointerdown the controller should suppress.
    const ignoredBtn = document.createElement("button")
    ignoredBtn.className = "dc-ignore"
    ignoredBtn.textContent = "don't drag"
    ignoredBtn.style.cssText = `
      display: block;
      margin-top: 10px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid hsl(340 50% 60% / 0.5);
      background: hsl(340 50% 95% / 0.08);
      color: hsl(340 40% 70%);
      font-size: 10px;
      cursor: pointer;
      font-style: normal;
      font-family: inherit;
    `
    ignoredBtn.addEventListener("click", () => {
      // eslint-disable-next-line no-console -- storybook mock; console output is the intended inspection surface
      console.log("[DragController] button click — drag suppressed")
    })
    box.appendChild(ignoredBtn)

    const posLabel = document.createElement("div")
    posLabel.style.cssText = `
      position: absolute;
      top: 16px;
      left: 0;
      right: 0;
      text-align: center;
      color: rgba(255,255,255,0.25);
      font-family: monospace;
      font-size: 11px;
      pointer-events: none;
    `
    posLabel.textContent = `x ${startX}  y ${startY}`

    vp.appendChild(box)
    vp.appendChild(posLabel)

    const selectors = ignoreSelectors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    const ctrl = new DragController(box, box, selectors)

    ctrl.onMove = (x, y) => {
      box.style.left = `${x}px`
      box.style.top = `${y}px`
      posLabel.textContent = `x ${Math.round(x)}  y ${Math.round(y)}`
    }

    ctrl.onDragEnd = (x, y) => {
      // eslint-disable-next-line no-console -- storybook mock; console output is the intended inspection surface
      console.log("[DragController] dragEnd:", {
        x: Math.round(x),
        y: Math.round(y),
      })
    }

    return () => {
      box.remove()
      posLabel.remove()
    }
  }, [startX, startY, ignoreSelectors])

  return (
    <div
      ref={vpRef}
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
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
          pointerEvents: "none",
        }}
      >
        DragController — live position above · nested button suppresses drag
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.12)",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          fontSize: 11,
          pointerEvents: "none",
        }}
      >
        DragController — isolated from DramaCard
      </div>
    </div>
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/DragController",
  component: DragControllerBridge,
  parameters: { layout: "fullscreen" },
  argTypes: {
    startX: { control: { type: "range", min: 0, max: 1200, step: 4 } },
    startY: { control: { type: "range", min: 0, max: 800, step: 4 } },
    ignoreSelectors: {
      control: "text",
      description:
        "Comma-separated CSS selectors that suppress drag on pointerdown (default: .dc-ignore)",
    },
  },
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

/** Default — draggable from top-left; nested button suppresses drag. */
export const Default: Story = {
  args: {
    startX: 100,
    startY: 100,
    ignoreSelectors: ".dc-ignore",
  },
}

/** Bottom-right start — verify viewport clamping keeps the box in view. */
export const BottomRightStart: Story = {
  args: {
    startX: 1100,
    startY: 650,
    ignoreSelectors: ".dc-ignore",
  },
}

/** No ignore selectors — the full box surface starts a drag, including the button. */
export const NoIgnoreSelectors: Story = {
  args: {
    startX: 300,
    startY: 200,
    ignoreSelectors: "",
  },
}
