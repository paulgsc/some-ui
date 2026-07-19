import { describe, expect, it } from "vitest"

import { LayoutTreeNodeSchema, SceneConfigSchema } from "."
import type { LayoutTreeNode } from "."

const singleLeaf: LayoutTreeNode = { type: "leaf", id: "mainContent" }

const split: LayoutTreeNode = {
  type: "split",
  axis: "row",
  splitId: "split-0",
  children: [
    { node: { type: "leaf", id: "video" }, weight: 1 },
    { node: singleLeaf, weight: 1 },
  ],
}

describe("LayoutTreeNodeSchema", () => {
  it("accepts a single leaf", () => {
    expect(LayoutTreeNodeSchema.parse(singleLeaf)).toEqual(singleLeaf)
  })

  it("accepts a nested split", () => {
    expect(LayoutTreeNodeSchema.parse(split)).toEqual(split)
  })

  it("rejects a leaf with an unknown region id", () => {
    expect(() =>
      LayoutTreeNodeSchema.parse({ type: "leaf", id: "not-a-region" })
    ).toThrow()
  })
})

describe("SceneConfigSchema.layout", () => {
  const base = {
    scene_name: "honeycomb",
    duration: 60_000,
    start_time: 0,
    ui: [],
  }

  it("is optional - a scene with no layout still parses", () => {
    const scene = SceneConfigSchema.parse(base)
    expect(scene.layout).toBeUndefined()
  })

  it("accepts null (explicitly no topology yet)", () => {
    const scene = SceneConfigSchema.parse({ ...base, layout: null })
    expect(scene.layout).toBeNull()
  })

  it("round-trips a real topology", () => {
    const scene = SceneConfigSchema.parse({ ...base, layout: split })
    expect(scene.layout).toEqual(split)
  })
})
