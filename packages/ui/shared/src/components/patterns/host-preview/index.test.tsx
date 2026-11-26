import type { Beat } from "@some-ui/styles/brand/host"
import { hostAt, idleAt, SHOT_SIZE } from "@some-ui/styles/brand/host"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { STILL_MS } from "../../../lib/loop-clock"
import { HostPreview, stillFor } from "./index"

const BEAT: Beat = {
  atMs: 0,
  character: "mochi",
  emotion: "happy",
  shot: "long",
  placement: "bottom-right",
  speaking: false,
}

const pictureOf = (container: HTMLElement): HTMLImageElement => {
  const img = container.querySelector("img")
  if (img === null) throw new Error("no picture")
  return img
}

describe("HostPreview", () => {
  it("draws hostAt's very bytes for the beat at tMs", () => {
    const { container } = render(
      <HostPreview beats={[BEAT]} seed={3} tMs={900} />
    )
    const frame = hostAt([BEAT], 3, 900, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    expect(pictureOf(container).getAttribute("src")).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(frame?.svg ?? "")}`
    )
  })

  it("places the host as a scene does, as a share of its box", () => {
    const { container } = render(
      <HostPreview beats={[BEAT]} seed={1} tMs={0} aspect={16 / 9} />
    )
    const style = pictureOf(container).style
    // A long shot is its SHOT_SIZE share of the shorter side, flush to the bottom right.
    const pct = Math.round(SHOT_SIZE.long * 10_000) / 100
    expect(style.height).toBe(`${String(pct)}%`)
    expect(style.top).toBe(`${String(Math.round((100 - pct) * 100) / 100)}%`)
    expect(style.left).toBe(
      `${String(Math.round((1 - (pct * 9) / 1600) * 10_000) / 100)}%`
    )
  })

  it("holds a still preview with its eyes open, whatever its seed", () => {
    for (let seed = 0; seed < 400; seed += 1) {
      expect(idleAt(seed, stillFor(seed)).blink, String(seed)).toBe(0)
    }
    const { container } = render(
      <HostPreview beats={[BEAT]} seed={237} tMs="still" />
    )
    const frame = hostAt([BEAT], 237, stillFor(237), {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    expect(stillFor(237)).not.toBe(STILL_MS)
    expect(pictureOf(container).getAttribute("src")).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(frame?.svg ?? "")}`
    )
  })

  it("draws nothing before the first beat", () => {
    const { container } = render(
      <HostPreview beats={[{ ...BEAT, atMs: 500 }]} seed={1} tMs={0} />
    )
    expect(container.querySelector("img")).toBeNull()
  })

  it("names the picture only when given a label", () => {
    const named = render(
      <HostPreview beats={[BEAT]} seed={1} tMs={0} label="Mochi, happy" />
    )
    expect(named.getByRole("img", { name: "Mochi, happy" })).toBeTruthy()
    const plain = render(<HostPreview beats={[BEAT]} seed={1} tMs={0} />)
    expect(plain.container.querySelector('[role="img"]')).toBeNull()
  })
})
