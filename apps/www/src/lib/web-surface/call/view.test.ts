import { sampleCallWeek } from "@some-ui/video-render"
import type { CallWeek } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { callAt } from "./view"

const week = (): CallWeek => {
  const parsed = sampleCallWeek()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("the call's stage", () => {
  it("shows the scene named, with the item it draws", () => {
    const at = callAt(week(), "asks-2")
    expect(at.scene.id).toBe("asks-2")
    expect(at.view.section).toBe("asks")
    expect("item" in at.view && at.view.item.id).toBe("talk-d1")
    expect(at.index).toBe(at.scenes.length - 2)
  })

  it("opens on the first scene when the id names none", () => {
    for (const id of [undefined, "", "asks-9"]) {
      const at = callAt(week(), id)
      expect([at.index, at.scene.id, at.view]).toEqual([
        0,
        "open",
        { section: "open" },
      ])
    }
  })
})
