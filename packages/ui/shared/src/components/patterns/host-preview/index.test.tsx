import type { CastNode } from "@some-ui/styles/brand/cast"
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

const pictureOf = (container: HTMLElement): HTMLElement => {
  const picture = container.querySelector<HTMLElement>("[data-host-frame]")
  if (picture === null) throw new Error("no picture")
  return picture
}

/** A drawn element as data: its tag and attributes, ids and their `url(#…)`s unprefixed. */
const asDrawn = (element: Element, prefix: string): CastNode => ({
  tag: element.tagName,
  attrs: Object.fromEntries(
    Array.from(element.attributes, ({ name, value }) => [
      name,
      value
        .replace(new RegExp(`^${prefix}-`), "")
        .replaceAll(`url(#${prefix}-`, "url(#"),
    ])
  ),
  children: Array.from(element.children, (child) => asDrawn(child, prefix)),
})

/** A frame's drawing as data the same shape as `asDrawn`'s. */
const asData = (node: CastNode): CastNode => ({
  tag: node.tag,
  attrs: Object.fromEntries(
    Object.entries(node.attrs).map(([name, value]) => [name, String(value)])
  ),
  children: (node.children ?? []).map(asData),
})

/** The drawing a preview drew, and the prefix it gave its ids. */
const drawnIn = (container: HTMLElement): CastNode => {
  const svg = pictureOf(container).querySelector("svg")
  if (svg === null) throw new Error("no drawing")
  const id = svg.querySelector("[id]")?.getAttribute("id") ?? ""
  const at = id.indexOf("-host-")
  if (at <= 0) throw new Error(`no prefixed host id: ${id}`)
  const prefix = id.slice(0, at)
  return asDrawn(svg, prefix)
}

describe("HostPreview", () => {
  it("draws hostAt's drawing for the beat at tMs, inline", () => {
    const { container } = render(
      <HostPreview beats={[BEAT]} seed={3} tMs={900} />
    )
    const frame = hostAt([BEAT], 3, 900, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    if (frame === null) throw new Error("no frame")
    expect(container.querySelector("img")).toBeNull()
    expect(drawnIn(container)).toEqual(asData(frame.drawing))
  })

  it("names its ids for itself, so two previews on a page paint with their own", () => {
    const { container } = render(
      <>
        <HostPreview beats={[BEAT]} seed={1} tMs={0} />
        <HostPreview
          beats={[{ ...BEAT, emotion: "anxious" }]}
          seed={2}
          tMs={0}
        />
      </>
    )
    const ids = Array.from(container.querySelectorAll("[id]"), (el) => el.id)
    expect(ids.length).toBeGreaterThan(2)
    expect(new Set(ids).size).toBe(ids.length)
    for (const picture of container.querySelectorAll("[data-host-frame]")) {
      const own = new Set(
        Array.from(picture.querySelectorAll("[id]"), (el) => el.id)
      )
      const pointed = Array.from(
        picture.innerHTML.matchAll(/url\(#([^)]+)\)/g),
        ([, id]) => id
      )
      expect(pointed.length).toBeGreaterThan(0)
      for (const id of pointed) expect(own.has(id ?? ""), id).toBe(true)
    }
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
    if (frame === null) throw new Error("no frame")
    expect(stillFor(237)).not.toBe(STILL_MS)
    expect(drawnIn(container)).toEqual(asData(frame.drawing))
  })

  it("draws nothing before the first beat", () => {
    const { container } = render(
      <HostPreview beats={[{ ...BEAT, atMs: 500 }]} seed={1} tMs={0} />
    )
    expect(container.querySelector("[data-host-frame]")).toBeNull()
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
