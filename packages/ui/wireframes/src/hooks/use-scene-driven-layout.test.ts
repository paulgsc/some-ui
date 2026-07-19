import { renderHook } from "@testing-library/react"
import type { ActiveLifetime, LayoutTreeNode } from "some-types-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useSceneDrivenLayout } from "./use-scene-driven-layout"

const { usePrimaryScene } = vi.hoisted(() => ({
  usePrimaryScene: vi.fn<() => ActiveLifetime | null>(),
}))

vi.mock("some-ui-utils", () => ({ usePrimaryScene }))

const tree: LayoutTreeNode = { type: "leaf", id: "mainContent" }

function sceneLifetime(
  layout: LayoutTreeNode | null | undefined
): ActiveLifetime {
  return {
    id: 0,
    started_at: 0,
    kind: {
      Scene: {
        scene_id: "honeycomb#0",
        scene_name: "honeycomb",
        duration: 60_000,
        layout,
      },
    },
  }
}

describe("useSceneDrivenLayout", () => {
  beforeEach(() => {
    usePrimaryScene.mockReset()
  })

  it("returns null when there is no active scene", () => {
    usePrimaryScene.mockReturnValue(null)
    const { result } = renderHook(() => useSceneDrivenLayout())
    expect(result.current.currentLayout).toBeNull()
  })

  it("reads the primary scene's own persisted layout", () => {
    usePrimaryScene.mockReturnValue(sceneLifetime(tree))
    const { result } = renderHook(() => useSceneDrivenLayout())
    expect(result.current.currentLayout).toEqual(tree)
  })

  it("falls back to null for a scene with no layout, regardless of its name", () => {
    usePrimaryScene.mockReturnValue(sceneLifetime(null))
    const { result } = renderHook(() => useSceneDrivenLayout())
    expect(result.current.currentLayout).toBeNull()
  })
})
