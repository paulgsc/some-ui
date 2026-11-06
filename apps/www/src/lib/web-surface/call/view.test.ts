import { CALL_INDEX_SCHEMA, sampleCallWeek } from "@some-ui/video-render"
import type { CallIndex, CallWeek } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

import { callAt, weekFrom } from "./view"

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

describe("the week the stage asks for", () => {
  const index: CallIndex = {
    schema: CALL_INDEX_SCHEMA,
    keep: 8,
    weeks: [
      { from: "2026-11-06", to: "2026-11-12" },
      { from: "2026-10-30", to: "2026-11-05" },
    ],
  }

  it("is the one named, else the newest, and says when the one named isn't kept", () => {
    expect(weekFrom(index, "2026-10-30")).toEqual({
      from: "2026-10-30",
      missing: false,
    })
    expect(weekFrom(index, undefined)).toEqual({
      from: "2026-11-06",
      missing: false,
    })
    expect(weekFrom(index, "1999-01-01")).toEqual({
      from: "2026-11-06",
      missing: true,
    })
  })

  it("is none for the sample, before the index is read, or when it keeps none", () => {
    expect(weekFrom(index, "sample")).toEqual({ from: null, missing: false })
    expect(weekFrom(undefined, "2026-10-30")).toEqual({
      from: null,
      missing: false,
    })
    expect(weekFrom({ ...index, weeks: [] }, undefined)).toEqual({
      from: null,
      missing: false,
    })
  })
})
