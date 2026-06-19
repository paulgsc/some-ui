/**
 * Layer 3: ConveyorStrip
 *
 * Stories for the full carousel strip — N rotating cubes scrolling toroidally.
 * No WASM, no platform API. Each cube is an independent CubeRenderer with its
 * own face set and viewport state. The strip container applies the terminal
 * backdrop styling from ThemeEngine CSS variables.
 *
 * Composition: ConveyorStrip ← CubeRenderer[] ← FaceContent[] ← face factories
 * Parent context: shadow root viewport edge — the strip docks to the bottom.
 */

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

// ── Per-cube face factories ────────────────────────────────────────────────────

const CUBE_FACE_SETS: Array<Array<FaceContent>> = [
  [
    {
      id: "clock",
      render: () => ClockFace({ time: "14:32:07", date: "Wed, Jun 10" }),
    },
    { id: "streak", render: () => StreakCountFace({ complete: 5, total: 8 }) },
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
  ],
  [
    {
      id: "streak-2",
      render: () => StreakCountFace({ complete: 12, total: 20 }),
    },
    {
      id: "clock-2",
      render: () => ClockFace({ time: "09:15:44", date: "Thu, Jun 11" }),
    },
    {
      id: "today-2",
      render: () =>
        TodayProgressFace({
          tasks: [
            { label: "Standup", done: true },
            { label: "Code review", done: false },
            { label: "Deploy", done: false },
          ],
        }),
    },
    {
      id: "last-activity-2",
      render: () =>
        LastActivityFace({
          lastActiveText: "12 min ago",
          focusIcon: "📝",
          focusName: "docs",
        }),
    },
  ],
  [
    {
      id: "clock-3",
      render: () => ClockFace({ time: "22:07:01", date: "Fri, Jun 12" }),
    },
    {
      id: "streak-3",
      render: () => StreakCountFace({ complete: 3, total: 8 }),
    },
    {
      id: "last-activity-3",
      render: () =>
        LastActivityFace({
          lastActiveText: "1 hr ago",
          focusIcon: "🔬",
          focusName: "research",
        }),
    },
    {
      id: "today-3",
      render: () =>
        TodayProgressFace({
          tasks: [
            { label: "Retro", done: true },
            { label: "Sprint plan", done: true },
            { label: "Backlog", done: true },
          ],
        }),
    },
  ],
]

// ── State helpers ──────────────────────────────────────────────────────────────

function makeState(cyclePos: number, activeFace: number): ViewportState {
  return {
    faceLayout: [[0], [1], [2], [3]],
    activeFace,
    activeItemInFace: 0,
    cursor: 0,
    cycleIndex: 0,
    cyclePosition: cyclePos,
    cycleLength: 4,
    cycleName: "cube:y",
    progress: 0,
  }
}

// ── Strip geometry ─────────────────────────────────────────────────────────────

const CUBE_WIDTH = 180
const CUBE_GAP = 16
const STRIP_HEIGHT = 200
const CUBE_STRIDE = CUBE_WIDTH + CUBE_GAP

// ── Story props ────────────────────────────────────────────────────────────────

type StripStoryProps = {
  cubeCount: number
  animate: boolean
  suspended: boolean
  viewportWidth: number
}

// ── Strip component ────────────────────────────────────────────────────────────

const ConveyorStripStory = (props: StripStoryProps): JSX.Element => {
  const stripRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return

    strip.innerHTML = ""

    const engine = new ThemeEngine(TerminalTheme)
    const count = Math.min(props.cubeCount, CUBE_FACE_SETS.length)
    const renderers: Array<CubeRenderer> = []

    for (let i = 0; i < count; i++) {
      const renderer = new CubeRenderer(
        `cube-${i}`,
        CUBE_WIDTH,
        STRIP_HEIGHT - 20
      )
      engine.applyToElement(renderer.el)
      const faces = CUBE_FACE_SETS[i % CUBE_FACE_SETS.length]
      if (faces) renderer.setFaceContents(faces)
      renderer.setXPosition(i * CUBE_STRIDE)

      // Each cube starts on a different face for variety.
      const initPos = i % 4
      renderer.applyState(makeState(initPos, initPos), TerminalTheme)

      strip.appendChild(renderer.el)
      renderers.push(renderer)
    }

    if (!props.animate || props.suspended) {
      return (): void => {
        for (const r of renderers) r.dispose()
      }
    }

    // Toroidal scroll: shift strip left, wrap at stride boundary.
    let offset = 0
    let lastTime = 0
    const SPEED_PX_PER_SEC = 40

    const cyclePosPerCube = renderers.map((_, i) => i % 4)
    let faceTickCounter = 0

    const animate = (now: number): void => {
      const dt = lastTime === 0 ? 0 : now - lastTime
      lastTime = now

      offset += (SPEED_PX_PER_SEC * dt) / 1000
      const totalWidth = count * CUBE_STRIDE

      // Rotate face every ~2.5 s.
      faceTickCounter += dt
      let didTick = false
      if (faceTickCounter > 2500) {
        faceTickCounter = 0
        didTick = true
      }

      for (let i = 0; i < renderers.length; i++) {
        const renderer = renderers[i]
        if (!renderer) continue

        // Toroidal position.
        let x = i * CUBE_STRIDE - offset
        x = ((x % totalWidth) + totalWidth) % totalWidth
        if (x > totalWidth - CUBE_STRIDE) x -= totalWidth
        renderer.setXPosition(x)

        if (didTick) {
          cyclePosPerCube[i] = (cyclePosPerCube[i]! + 1) % 4
          const pos = cyclePosPerCube[i]!
          renderer.applyState(makeState(pos, pos), TerminalTheme)
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return (): void => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      for (const r of renderers) r.dispose()
    }
  }, [props.cubeCount, props.animate, props.suspended])

  return (
    <div
      style={{
        width: `${props.viewportWidth}px`,
        height: `${STRIP_HEIGHT}px`,
        position: "relative",
        background: "var(--strip-bg, rgba(6,10,6,0.92))",
        borderTop: "var(--strip-border-top, 1px solid #1a2e1a)",
        backdropFilter: "var(--strip-backdrop, blur(8px))",
        overflow: "hidden",
        ...Object.fromEntries(
          Object.entries(TerminalTheme.cssVariables).map(([k, v]) => [k, v])
        ),
      }}
    >
      <div
        ref={stripRef}
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  )
}

// ── Meta ───────────────────────────────────────────────────────────────────────

const meta: Meta<StripStoryProps> = {
  title: "Extensions/Conveyor/ConveyorStrip",
  component: ConveyorStripStory,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  argTypes: {
    cubeCount: { control: { type: "range", min: 1, max: 3, step: 1 } },
    animate: { control: "boolean" },
    suspended: { control: "boolean" },
    viewportWidth: { control: { type: "range", min: 300, max: 900, step: 50 } },
  },
}
export default meta
type Story = StoryObj<StripStoryProps>

// ── Stories ────────────────────────────────────────────────────────────────────

export const SingleCube: Story = {
  name: "Single Cube (static)",
  args: { cubeCount: 1, animate: false, suspended: false, viewportWidth: 300 },
}

export const TwoCubes: Story = {
  name: "Two Cubes (static)",
  args: { cubeCount: 2, animate: false, suspended: false, viewportWidth: 500 },
}

export const ThreeCubesScrolling: Story = {
  name: "Three Cubes (scrolling)",
  args: { cubeCount: 3, animate: true, suspended: false, viewportWidth: 700 },
}

export const Suspended: Story = {
  name: "Suspended (frozen)",
  args: { cubeCount: 3, animate: true, suspended: true, viewportWidth: 700 },
}
