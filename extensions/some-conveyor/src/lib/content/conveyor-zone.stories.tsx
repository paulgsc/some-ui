/**
 * ConveyorZone — the assembled overlay: rail HUD → manifest ticker → belt.
 *
 * Composition: buildConveyorZone (rail + manifest) + a static belt of cubes
 * rendered with CubeRenderer. No WASM/scheduler — the belt is static here; the
 * running belt is storied separately under ConveyorStrip.
 */

import "@conveyor/styles/conveyor.css"

import type { JSX } from "react"
import { useEffect, useRef } from "react"
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

function frontState(): ViewportState {
  return {
    faceLayout: [[0], [1], [2], [3]],
    activeFace: 0,
    activeItemInFace: 0,
    cursor: 0,
    cycleIndex: 0,
    cyclePosition: 0,
    cycleLength: 4,
    cycleName: "cube:y",
    progress: 0,
  }
}

const MANIFEST = [
  { cube: "01", face: "front", source: "ci/some-ui", window: "6.0s" },
  { cube: "02", face: "right", source: "nvda/journal", window: "9.0s" },
  { cube: "03", face: "top", source: "kor/단어", window: "12.0s" },
  { cube: "04", face: "back", source: "rss/rust-blog", window: "8.0s" },
  { cube: "05", face: "front", source: "metric/mrr", window: "6.0s" },
] as const

type ZoneProps = { cubeCount: number }

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
      const front = FRONTS[i]
      if (front) r.setFaceContents([front])
      r.setXPosition(40 + i * (CUBE + GAP))
      r.applyState(frontState(), SteelTheme)
      strip.appendChild(r.el)
      renderers.push(r)
    }

    host.appendChild(zone.root)
    return (): void => {
      for (const r of renderers) r.dispose()
    }
  }, [props.cubeCount])

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
  },
}
export default meta
type Story = StoryObj<ZoneProps>

export const Assembled: Story = { args: { cubeCount: 5 } }
