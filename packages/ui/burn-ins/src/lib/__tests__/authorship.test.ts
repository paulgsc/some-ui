/** @vitest-environment node */
import {
  authorshipAt,
  MOST_SCENES,
  type AuthoredScene,
  type AuthorshipDrawing,
} from "@burn-ins/lib/authorship"
import {
  recordCode,
  recordLink,
  recordParams,
  scenesOf,
} from "@burn-ins/lib/authorship-link"
import { prepare } from "@burn-ins/lib/burn-in"
import { LANDSCAPE, PORTRAIT } from "@burn-ins/lib/geometry"
import { describe, expect, it } from "vitest"

const ORIGINS = ["you", "agent", "source"] as const
const WORDINGS = ["you", "agent"] as const
const HAND_SETS = [
  [],
  ["you"],
  ["agent"],
  ["code"],
  ["you", "agent"],
  ["you", "code"],
  ["agent", "code"],
  ["you", "agent", "code"],
] as const

/** Every idea path over every set of hands, 48 scenes in batches of `MOST_SCENES`. */
const EVERY: ReadonlyArray<Omit<AuthoredScene, "startMs">> = ORIGINS.flatMap(
  (origin) =>
    WORDINGS.flatMap((wording) =>
      HAND_SETS.map((hands) => ({ origin, wording, hands: [...hands] }))
    )
)

const bare: Omit<AuthoredScene, "startMs"> = {
  origin: "agent",
  wording: "agent",
  hands: ["code"],
}

const drawn = (
  between: ReadonlyArray<Omit<AuthoredScene, "startMs">>
): AuthorshipDrawing => {
  const p = prepare(
    {
      kind: "authorship",
      design: "cells-v1",
      params: recordParams(between),
    },
    PORTRAIT
  )
  if (!p.ok) throw new Error(p.problems.join("; "))
  if (p.value.kind !== "authorship") throw new Error("not the mark")
  return p.value.drawing
}

const batches = (): ReadonlyArray<
  ReadonlyArray<Omit<AuthoredScene, "startMs">>
> =>
  Array.from({ length: Math.ceil(EVERY.length / MOST_SCENES) }, (_, i) =>
    EVERY.slice(i * MOST_SCENES, (i + 1) * MOST_SCENES)
  )

describe("the authorship mark", () => {
  it("shows the intro, then each scene's mark, then the end card", () => {
    const d = drawn(EVERY.slice(0, 2))
    expect(
      [0, 999, 1000, 2500, 3000, 3999].map((t) => authorshipAt(d, t).part)
    ).toEqual(["intro", "intro", "mark", "mark", "end", "end"])
  })

  it("never lights the owner beyond what a scene's data says, in any part", () => {
    for (const batch of batches()) {
      const d = drawn(batch)
      const scenes = d.scenes
      for (const [i, s] of scenes.entries()) {
        const mark = authorshipAt(d, s.startMs)
        const claims = mark.cells.filter((c) => c.role === "claim")
        if (mark.part === "mark") {
          expect(claims.map((c) => [c.actor, c.idea, c.hand])).toEqual([
            [
              "you",
              s.origin === "you"
                ? "origin"
                : s.wording === "you"
                  ? "wording"
                  : null,
              s.hands.includes("you"),
            ],
            [
              "agent",
              s.origin === "agent"
                ? "origin"
                : s.wording === "agent"
                  ? "wording"
                  : null,
              s.hands.includes("agent"),
            ],
            ["code", null, s.hands.includes("code")],
            ["source", s.origin === "source" ? "origin" : null, false],
          ])
        } else {
          expect([i, claims.length]).toEqual([
            i,
            mark.part === "end" ? (scenes.length - 2) * 4 : 0,
          ])
        }
      }
      // The end card's record: each scene between, in order, as it says.
      const record = d.end.cells.filter((c) => c.role === "claim")
      const you = record.filter((c) => c.actor === "you")
      expect(you.map((c) => [c.idea !== null, c.hand])).toEqual(
        scenes
          .slice(1, -1)
          .map((s) => [
            s.origin === "you" || s.wording === "you",
            s.hands.includes("you"),
          ])
      )
    }
  })

  it("refuses params the renderer would never write", () => {
    const backwards = prepare(
      {
        kind: "authorship",
        design: "cells-v1",
        params: {
          scenes: [0, 400, 300].map((startMs) => ({ ...bare, startMs })),
          endMs: 800,
        },
      },
      PORTRAIT
    )
    expect(backwards.ok ? [] : backwards.problems).toEqual([
      "the authorship burn-in (cells-v1): each scene starts after the one before, and before the end",
    ])
  })
})

describe("the end card's link", () => {
  it("reads back every idea path over every set of hands", () => {
    expect(scenesOf(recordCode(EVERY))).toEqual(EVERY)
  })

  it("refuses what no record writes, look-alikes included", () => {
    for (const code of ["A!", "~", "z", "-", "I", "l", "O", "0", "1"])
      expect(scenesOf(code)).toBeNull()
    expect(scenesOf("")).toEqual([])
  })

  it("is printed on every end card, under what it is", () => {
    for (const batch of batches()) {
      const rows = drawn(batch).end.blocks.flatMap((b) => b.rows)
      expect(rows).toContain(recordLink(batch))
    }
  })
})

describe("the authorship mark in the 16:9 video", () => {
  const inVideo = (
    between: ReadonlyArray<Omit<AuthoredScene, "startMs">>
  ): ReturnType<typeof prepare> =>
    prepare(
      {
        kind: "authorship",
        design: "cells-v1",
        params: recordParams(between),
      },
      LANDSCAPE
    )

  it("sets its intro's actors two to a row and its grammar on one row", () => {
    const p = inVideo([bare])
    if (!p.ok || p.value.kind !== "authorship")
      throw new Error(p.ok ? "not the mark" : p.problems.join("; "))
    const keys = p.value.drawing.intro.cells
    const actorRows = new Set(keys.slice(0, 4).map((c) => c.box.y))
    const grammarRows = new Set(keys.slice(4).map((c) => c.box.y))
    expect([actorRows.size, grammarRows.size]).toEqual([2, 1])
  })

  it("holds a record of eight scenes on its shorter end card, and refuses nine", () => {
    expect(inVideo(EVERY.slice(0, 8)).ok).toBe(true)
    const nine = inVideo(EVERY.slice(0, 9))
    expect(nine.ok ? [] : nine.problems).toEqual([
      "the authorship burn-in (cells-v1): the end card's record doesn't fit",
    ])
  })

  it("holds the short's whole record of `MOST_SCENES` in the short", () => {
    expect(drawn(EVERY.slice(0, MOST_SCENES)).end.part).toBe("end")
  })
})
