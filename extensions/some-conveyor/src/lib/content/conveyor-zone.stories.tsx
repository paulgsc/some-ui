/**
 * ConveyorZone — the assembled overlay: rail HUD → manifest ticker → belt.
 *
 * Composition: buildConveyorZone (rail + manifest) + a running belt of cubes
 * rendered with CubeRenderer and driven by the Storybook belt driver — the
 * cubes slide toroidally and rotate through their projections, the way
 * ConveyorEngine drives them in production (no WASM/scheduler here).
 */

import "@conveyor/styles/conveyor.css"

import type { JSX } from "react"
import { useEffect, useRef } from "react"
import { startBeltMotion } from "@conveyor/components/belt-motion"
import { ProjectionCell } from "@conveyor/components/projection-cell"
import { buildConveyorZone } from "@conveyor/lib/content/conveyor-zone"
import { CubeRenderer } from "@conveyor/lib/content/cube-renderer"
import {
  CONVEYOR_TOKENS,
  SteelTheme,
  ThemeEngine,
} from "@conveyor/lib/content/theme-engine"
import type { FaceContent, ViewportState } from "@conveyor/types"
import type { Meta, StoryObj } from "@storybook/react-vite"

const CUBE = 150
const GAP = 56
const STRIP_H = 196

const FRONTS: ReadonlyArray<FaceContent> = [
  {
    id: "ci",
    render: () =>
      ProjectionCell({
        tag: "CI",
        status: "live",
        body: "some-ui · build passing",
        meta: [{ text: "12 pkgs", tone: "pos" }, { text: "1m 48s" }],
      }),
  },
  {
    id: "nvda",
    render: () =>
      ProjectionCell({
        tag: "NVDA",
        status: "live",
        body: "long call · 6/20 140c",
        meta: [
          { text: "Δ +0.62", tone: "num" },
          { text: "θ −1.1", tone: "neg" },
        ],
      }),
  },
  {
    id: "kor",
    render: () =>
      ProjectionCell({
        tag: "단어",
        status: "live",
        body: "회의 — meeting",
        meta: "TOPIK II · noun",
      }),
  },
  {
    id: "rss",
    render: () =>
      ProjectionCell({
        tag: "RSS",
        status: "live",
        body: "Rust Blog · release",
        meta: "2h ago · 1 new",
      }),
  },
  {
    id: "metric",
    render: () =>
      ProjectionCell({
        tag: "METRIC",
        status: "warn",
        body: "MRR · $0",
        meta: "preview · pre-launch",
      }),
  },
]

// The face that actually points at the viewer for each cube:y quarter turn.
// yRotation = pos·90°, so positions 0→3 surface face indices 0,3,2,1. Keeping
// `activeFace` aligned to the front face is what keeps the projection legible
// (only the active face un-fades its content) as the cube rotates.
const FRONT_FACE_FOR_POS = [0, 3, 2, 1] as const

function rotatingState(cyclePosition: number): ViewportState {
  const pos = ((cyclePosition % 4) + 4) % 4
  return {
    faceLayout: [[0], [1], [2], [3]],
    activeFace: FRONT_FACE_FOR_POS[pos] ?? 0,
    activeItemInFace: 0,
    cursor: 0,
    cycleIndex: 0,
    cyclePosition,
    cycleLength: 4,
    cycleName: "cube:y",
    progress: 0,
  }
}

// Four projections per cube so a quarter turn reveals a fresh face rather than a
// blank steel side. Offsetting the slice per cube keeps neighbours out of sync.
function faceSetFor(index: number): Array<FaceContent> {
  return Array.from({ length: 4 }, (_, f) => {
    const front = FRONTS[(index + f) % FRONTS.length]
    return front ?? FRONTS[0]!
  })
}

const MANIFEST = [
  { cube: "01", face: "front", source: "ci/some-ui", window: "6.0s" },
  { cube: "02", face: "right", source: "nvda/journal", window: "9.0s" },
  { cube: "03", face: "top", source: "kor/단어", window: "12.0s" },
  { cube: "04", face: "back", source: "rss/rust-blog", window: "8.0s" },
  { cube: "05", face: "front", source: "metric/mrr", window: "6.0s" },
] as const

type ZoneProps = {
  cubeCount: number
  animate: boolean
  /** Preview the focus fade: the overlay dims while the window holds focus. */
  focusDimmed: boolean
}

const ZoneStory = (props: ZoneProps): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    host.innerHTML = ""

    const engine = new ThemeEngine(SteelTheme)
    const zone = buildConveyorZone({
      railChips: [
        { label: "scheduler", value: "running", tone: "live", dot: true },
        { label: "wasm", value: "✓ loaded", tone: "live" },
        { label: "tick", value: "0x3F", tone: "signal" },
        { label: "window", value: "9.0s" },
        { label: "cells", value: String(props.cubeCount) },
      ],
      manifestSegments: MANIFEST,
    })

    const strip = document.createElement("div")
    strip.className = "sc-strip relative w-full overflow-hidden"
    strip.style.height = `${STRIP_H}px`
    zone.beltMount.appendChild(strip)

    const renderers: Array<CubeRenderer> = []
    const count = Math.min(props.cubeCount, FRONTS.length)
    for (let i = 0; i < count; i++) {
      const r = new CubeRenderer(`zone-cube-${i}`, CUBE, CUBE)
      engine.applyToElement(r.el)
      r.setFaceContents(faceSetFor(i))
      strip.appendChild(r.el)
      renderers.push(r)
    }

    const stop = props.animate
      ? startBeltMotion({
          renderers,
          theme: SteelTheme,
          stride: CUBE + GAP,
          startX: 40,
          makeState: rotatingState,
        })
      : (renderers.forEach((r, i) => {
          r.setXPosition(40 + i * (CUBE + GAP))
          r.applyState(rotatingState(0), SteelTheme)
        }),
        (): void => {})

    host.appendChild(zone.root)
    return (): void => {
      stop()
      for (const r of renderers) r.dispose()
    }
  }, [props.cubeCount, props.animate])

  // The focus fade is a pure CSS effect (see conveyor.css): JS only toggles the
  // class. In the runtime the equivalent toggle lives on the shadow host; here a
  // class on the zone root previews the same transition.
  useEffect(() => {
    const zoneRoot = ref.current?.querySelector(".sc-zone")
    zoneRoot?.classList.toggle("sc-zone--dimmed", props.focusDimmed)
  }, [props.focusDimmed, props.cubeCount, props.animate])

  return (
    <div
      ref={ref}
      style={{
        width: "1000px",
        paddingTop: "32px",
        background:
          "radial-gradient(120% 80% at 50% -10%, #131925 0%, #0c0f14 60%)",
        ...CONVEYOR_TOKENS,
      }}
    />
  )
}

const meta: Meta<ZoneProps> = {
  title: "Extensions/Conveyor/ConveyorZone",
  component: ZoneStory,
  parameters: { layout: "centered", backgrounds: { default: "dark" } },
  argTypes: {
    cubeCount: { control: { type: "range", min: 1, max: 5, step: 1 } },
    animate: { control: "boolean" },
    focusDimmed: { control: "boolean" },
  },
}
export default meta
type Story = StoryObj<ZoneProps>

export const Assembled: Story = {
  args: { cubeCount: 5, animate: true, focusDimmed: false },
}

export const FocusDimmed: Story = {
  name: "Focus dimmed (window focused)",
  args: { cubeCount: 5, animate: true, focusDimmed: true },
}
