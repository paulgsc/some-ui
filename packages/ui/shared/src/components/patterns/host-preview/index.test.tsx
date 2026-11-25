import type { Beat } from "@some-ui/styles/brand/host"
import { hostAt } from "@some-ui/styles/brand/host"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { HostPreview } from "./index"

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

  it("draws the same picture for the same beats, seed and time", () => {
    const a = render(<HostPreview beats={[BEAT]} seed={5} tMs={2400} />)
    const b = render(<HostPreview beats={[BEAT]} seed={5} tMs={2400} />)
    expect(pictureOf(a.container).outerHTML).toBe(
      pictureOf(b.container).outerHTML
    )
  })

  it("places the host as a scene does, as a share of its box", () => {
    const { container } = render(
      <HostPreview beats={[BEAT]} seed={1} tMs={0} aspect={16 / 9} />
    )
    const style = pictureOf(container).style
    // A long shot is 0.26 of the shorter side, flush to the bottom right.
    expect(style.height).toBe("26%")
    expect(style.top).toBe("74%")
    expect(style.left).toBe(
      `${String(Math.round((1 - (26 * 9) / 1600) * 10_000) / 100)}%`
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
