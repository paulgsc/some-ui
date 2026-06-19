/**
 * Layer 2: CubeRenderer
 *
 * Stories for the 3-D cube DOM primitive — no WASM, no platform API.
 * ViewportState is mocked locally; face content uses real face components
 * with static data so we story the UI/UX, not the logic.
 *
 * Composition: CubeRenderer ← FaceContent[] ← face factories (Clock, Streak, …)
 * Parent context: none — each cube is self-contained.
 */

import "@conveyor/styles/conveyor.css"

import type { JSX } from "react"
import { useEffect, useRef } from "react"
import { ClockFace } from "@conveyor/components/faces/clock"
import { LastActivityFace } from "@conveyor/components/faces/last-activity"
import { StreakCountFace } from "@conveyor/components/faces/streak-count"
import { TodayProgressFace } from "@conveyor/components/faces/today-progress"
import { CubeRenderer } from "@conveyor/lib/content/cube-renderer"
import { TerminalTheme, ThemeEngine } from "@conveyor/lib/content/theme-engine"
import type { FaceContent, ViewportState } from "@conveyor/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

// ── Static mock face contents ──────────────────────────────────────────────────

const MOCK_FACES: Array<FaceContent> = [
  {
    id: "clock",
    render: () => ClockFace({ time: "14:32:07", date: "Wed, Jun 10" }),
  },
  {
    id: "streak",
    render: () => StreakCountFace({ complete: 5, total: 8 }),
  },
  {
    id: "today",
    render: () =>
      TodayProgressFace({
        tasks: [
          { label: "Design review", done: true },
          { label: "PR feedback", done: true },
          { label: "Unit tests", done: false },
        ],
      }),
  },
  {
    id: "last-activity",
    render: () =>
      LastActivityFace({
        lastActiveText: "3 min ago",
        focusIcon: "⚙",
        focusName: "some-ui",
      }),
  },
  {
    id: "clock-2",
    render: () => ClockFace({ time: "14:32:07", date: "Wed, Jun 10" }),
  },
  {
    id: "streak-2",
    render: () => StreakCountFace({ complete: 12, total: 20 }),
  },
]

// ── Base ViewportState ─────────────────────────────────────────────────────────

function makeState(overrides: Partial<ViewportState> = {}): ViewportState {
  return {
    faceLayout: [[0], [1], [2], [3], [4], [5]],
    activeFace: 0,
    activeItemInFace: 0,
    cursor: 0,
    cycleIndex: 0,
    cyclePosition: 0,
    cycleLength: 4,
    cycleName: "cube:y",
    progress: 0,
    ...overrides,
  }
}

// ── Story props ────────────────────────────────────────────────────────────────

type CubeStoryProps = {
  activeFace: number
  cyclePosition: number
  cycleLength: number
  animate: boolean
  suspended: boolean
}

// ── Renderer component ─────────────────────────────────────────────────────────

const CubeStory = (props: CubeStoryProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<CubeRenderer | null>(null)
  const rafRef = useRef<number | null>(null)
  const cyclePos = useRef(props.cyclePosition)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const engine = new ThemeEngine(TerminalTheme)
    const renderer = new CubeRenderer("story-cube", 180, 180)
    rendererRef.current = renderer
    renderer.setFaceContents(MOCK_FACES)
    engine.applyToElement(renderer.el)

    container.innerHTML = ""
    container.appendChild(renderer.el)

    let pos = cyclePos.current

    const tick = (): void => {
      if (!props.animate) {
        const state = makeState({
          activeFace: props.activeFace,
          cyclePosition: props.cyclePosition,
          cycleLength: props.cycleLength,
        })
        renderer.applyState(state, TerminalTheme)
        return
      }

      pos = (pos + 1) % props.cycleLength
      cyclePos.current = pos

      const state = makeState({
        activeFace: pos % 4,
        cyclePosition: pos,
        cycleLength: props.cycleLength,
        cycleName: "cube:y",
      })
      renderer.applyState(state, TerminalTheme)
      rafRef.current = requestAnimationFrame(() => {
        setTimeout(tick, TerminalTheme.transitionDuration + 200)
      })
    }

    tick()

    return (): void => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      renderer.dispose()
    }
  }, [props.activeFace, props.cyclePosition, props.cycleLength, props.animate])

  return (
    <div
      style={{
        width: "180px",
        height: "200px",
        background: "var(--strip-bg, rgba(6,10,6,0.92))",
        borderTop: "var(--strip-border-top, 1px solid #1a2e1a)",
        backdropFilter: "var(--strip-backdrop, blur(8px))",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        ...Object.fromEntries(
          Object.entries(TerminalTheme.cssVariables).map(([k, v]) => [k, v])
        ),
      }}
    >
      <div
        ref={containerRef}
        style={{ position: "relative", width: "180px", height: "180px" }}
      />
    </div>
  )
}

// ── Meta ───────────────────────────────────────────────────────────────────────

const meta: Meta<CubeStoryProps> = {
  title: "Extensions/Conveyor/CubeRenderer",
  component: CubeStory,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  argTypes: {
    activeFace: { control: { type: "range", min: 0, max: 5, step: 1 } },
    cyclePosition: { control: { type: "range", min: 0, max: 7, step: 1 } },
    cycleLength: { control: { type: "range", min: 2, max: 8, step: 1 } },
    animate: { control: "boolean" },
    suspended: { control: "boolean" },
  },
}
export default meta
type Story = StoryObj<CubeStoryProps>

// ── Stories ────────────────────────────────────────────────────────────────────

export const FrontFace: Story = {
  args: {
    activeFace: 0,
    cyclePosition: 0,
    cycleLength: 4,
    animate: false,
    suspended: false,
  },
}

export const RightFace: Story = {
  args: {
    activeFace: 1,
    cyclePosition: 1,
    cycleLength: 4,
    animate: false,
    suspended: false,
  },
}

export const BackFace: Story = {
  args: {
    activeFace: 2,
    cyclePosition: 2,
    cycleLength: 4,
    animate: false,
    suspended: false,
  },
}

export const LeftFace: Story = {
  args: {
    activeFace: 3,
    cyclePosition: 3,
    cycleLength: 4,
    animate: false,
    suspended: false,
  },
}

export const AutoRotating: Story = {
  args: {
    activeFace: 0,
    cyclePosition: 0,
    cycleLength: 4,
    animate: true,
    suspended: false,
  },
}

export const SixFaceHex: Story = {
  name: "Hex (6 faces)",
  args: {
    activeFace: 0,
    cyclePosition: 0,
    cycleLength: 6,
    animate: true,
    suspended: false,
  },
}
