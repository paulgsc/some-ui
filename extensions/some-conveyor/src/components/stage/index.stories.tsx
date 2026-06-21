/**
 * Stage — the standalone visual acceptance reference for the capstone.
 *
 * Reproduces the design-intent doc as a Storybook surface: ambient host hint →
 * header (eyebrow / title / thesis / legend) → the assembled conveyor zone
 * (rail + manifest + belt of projection cubes) → footer strap.
 *
 * This is DEMO-ONLY. None of the page frame (header/legend/footer/host hint)
 * is injected into host pages — the content script ships only the zone overlay
 * (see content.ts). Built entirely from the steel theme + M3–M5 components.
 */

import "@conveyor/styles/conveyor.css"

import type { JSX } from "react"
import { useEffect, useRef } from "react"
import { el, elText } from "@conveyor/components/dom"
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
    id: "reminder",
    render: () =>
      ProjectionCell({
        tag: "REMINDER",
        status: "warn",
        body: "stand up · 10:00",
        meta: "in 12 min",
      }),
  },
]

const MANIFEST = [
  { cube: "01", face: "front", source: "ci/some-ui", window: "6.0s" },
  { cube: "02", face: "right", source: "nvda/journal", window: "9.0s" },
  { cube: "03", face: "top", source: "kor/단어", window: "12.0s" },
  { cube: "04", face: "back", source: "rss/rust-blog", window: "8.0s" },
  { cube: "05", face: "bottom", source: "reminder/review", window: "9.0s" },
] as const

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

function buildHostHint(): HTMLElement {
  const host = el(
    "div",
    "pointer-events-none absolute inset-x-0 top-0 blur-[1.5px] px-[8%] pt-[40px] opacity-[0.14]"
  )
  host.append(
    el(
      "div",
      "mb-[26px] h-[14px] w-[46%] rounded-[3px] bg-[var(--cv-steel-550)]"
    )
  )
  for (const w of ["w-[94%]", "w-[72%]", "w-[94%]", "w-[88%]"]) {
    host.append(
      el("div", `mb-[14px] h-[9px] rounded-[3px] bg-[var(--cv-steel-600)] ${w}`)
    )
  }
  const cols = el("div", "mt-[40px] grid grid-cols-3 gap-[22px]")
  for (let i = 0; i < 3; i++) {
    cols.append(el("div", "h-[120px] rounded-[8px] bg-[var(--cv-steel-700)]"))
  }
  host.append(cols)
  return host
}

function legendRow(swatch: string, label: string): HTMLElement {
  const row = el("div", "flex items-center gap-[9px] whitespace-nowrap")
  row.append(
    el("span", `size-[9px] rounded-[2px] ${swatch}`),
    elText("span", label)
  )
  return row
}

function buildHeader(): HTMLElement {
  const header = el(
    "header",
    "flex flex-wrap items-start justify-between gap-[24px]"
  )

  const brand = el("div", "max-w-[560px]")
  const eyebrow = el(
    "p",
    "mb-[16px] flex items-center gap-[10px] font-mono text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--cv-ink-3)]"
  )
  eyebrow.append(
    el("span", "inline-block h-px w-[22px] bg-[var(--cv-signal)]"),
    elText("span", "Browser attention · scheduled")
  )
  const h1 = el(
    "h1",
    "m-0 font-display text-[clamp(30px,5vw,52px)] font-bold leading-[0.98] tracking-[-0.02em] text-[var(--cv-ink)]"
  )
  h1.append(
    elText("span", "some-", "font-mono font-medium text-[var(--cv-ink-2)]"),
    elText("span", "conveyor")
  )
  const thesis = el(
    "p",
    "mt-[18px] max-w-[48ch] text-[15px] leading-[1.6] text-[var(--cv-ink-2)]"
  )
  thesis.append(
    elText(
      "span",
      "A continuously moving strip of rotating cells, injected over any page. Content "
    ),
    elText("b", "enters the conveyor", "font-semibold text-[var(--cv-ink)]"),
    elText("span", ", is projected onto a rotating face, "),
    elText(
      "b",
      "holds for a scheduled window",
      "font-semibold text-[var(--cv-ink)]"
    ),
    elText(
      "span",
      ", and exits the viewport. The cube is the cell — the schedule is the authority."
    )
  )
  brand.append(eyebrow, h1, thesis)

  const legend = el(
    "div",
    "grid gap-[10px] pt-[6px] font-mono text-[11px] text-[var(--cv-ink-3)]"
  )
  legend.append(
    legendRow("bg-[var(--cv-signal)]", "scheduler tick"),
    legendRow("bg-[var(--cv-live)]", "face in-window"),
    legendRow("bg-[var(--cv-steel-550)]", "queued projection")
  )

  header.append(brand, legend)
  return header
}

function buildFooter(): HTMLElement {
  const footer = el(
    "footer",
    "mt-[18px] flex flex-wrap items-center justify-between gap-[16px] border-t border-[var(--cv-steel-800)] px-[8px] py-[18px] font-mono text-[11px] text-[var(--cv-ink-3)]"
  )
  const principle = el("span", "text-[var(--cv-ink-2)]")
  principle.append(
    elText(
      "b",
      "not a widget — a transport system.",
      "font-semibold text-[var(--cv-ink)]"
    ),
    elText("span", " content enters, is projected, holds, exits.")
  )
  const metaWrap = el("span", "flex flex-wrap gap-[18px]")
  for (const m of [
    "fixed · bottom · z 2147483647",
    "shadow-dom · isolated",
    "pointer-events · none",
  ]) {
    metaWrap.append(elText("span", m))
  }
  footer.append(principle, metaWrap)
  return footer
}

const StageStory = (): JSX.Element => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = ref.current
    if (!mount) return
    mount.innerHTML = ""

    const engine = new ThemeEngine(SteelTheme)

    const stage = el("div", "relative isolate flex flex-col gap-[32px]")
    stage.append(buildHostHint())
    stage.append(buildHeader())

    const zone = buildConveyorZone({
      railId: "some-conveyor",
      railChips: [
        { label: "scheduler", value: "running", tone: "live", dot: true },
        { label: "wasm", value: "✓ loaded", tone: "live" },
        { label: "tick", value: "0x3F", tone: "signal" },
        { label: "window", value: "9.0s" },
        { label: "cells", value: String(FRONTS.length) },
      ],
      manifestSegments: MANIFEST,
    })

    const strip = el("div", "sc-strip relative w-full overflow-hidden")
    strip.style.height = `${STRIP_H}px`
    zone.beltMount.appendChild(strip)

    const renderers: Array<CubeRenderer> = []
    FRONTS.forEach((front, i) => {
      const r = new CubeRenderer(`stage-cube-${i}`, CUBE, CUBE)
      engine.applyToElement(r.el)
      r.setFaceContents([front])
      r.setXPosition(40 + i * (CUBE + GAP))
      r.applyState(frontState(), SteelTheme)
      strip.appendChild(r.el)
      renderers.push(r)
    })

    stage.append(zone.root)
    stage.append(buildFooter())
    mount.appendChild(stage)

    return (): void => {
      for (const r of renderers) r.dispose()
    }
  }, [])

  return (
    <div
      ref={ref}
      style={{
        width: "1180px",
        minHeight: "760px",
        padding: "46px 40px 0",
        boxSizing: "border-box",
        fontFamily: "var(--font-sans)",
        color: "var(--cv-ink)",
        background:
          "radial-gradient(120% 80% at 50% -10%, #131925 0%, #0c0f14 46%, #0a0d12 100%)",
        ...CONVEYOR_TOKENS,
      }}
    />
  )
}

const meta: Meta = {
  title: "Extensions/Conveyor/Stage",
  component: StageStory,
  parameters: { layout: "fullscreen", backgrounds: { default: "dark" } },
}
export default meta
type Story = StoryObj

export const IntentFloor: Story = {}
