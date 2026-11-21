/**
 * @vitest-environment node
 *
 * The snips desk's core (SNIPS3, #3364): a capture grouped by module in a
 * fixed order, each snip with the owner's newest mark, and words in the
 * owner's terms.
 */
import type { SnipRecord, SnipsManifest } from "@some-ui/video-render/snip"
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { SnipMark } from "@/lib/snips-desk"
import {
  deskOf,
  latestMarks,
  readManifest,
  SnipMarkSchema,
  SNIPS_DESK_WORDS,
  tally,
} from "@/lib/snips-desk"

const COMMIT = "a6e171f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6"

function snip(hash: string, module: string, shows: string): SnipRecord {
  return {
    id: `web:/journal:desktop:2.4.0:${hash}`,
    surface: "web",
    build: "release",
    route: "/journal",
    path: "/journal",
    viewport: "desktop",
    width: 1440,
    height: 900,
    scale: 1,
    regions: [],
    appVersion: "2.4.0",
    module,
    shows,
    description: `${module}: ${shows}, on a desktop browser, with sample data.`,
    image: {
      name: `web/desktop/journal-${hash}.png`,
      kind: "png",
      bytes: 1000,
      sha256: hash + "0".repeat(52),
    },
  }
}

const SNIPS = [
  snip("aaaaaaaaaaaa", "Studio", "Takes"),
  snip("bbbbbbbbbbbb", "Korean", "Lessons"),
  snip("cccccccccccc", "Studio", "Clips"),
]
const MANIFEST: SnipsManifest = {
  schema: "some-ui.snips/1",
  appVersion: "2.4.0",
  commit: COMMIT,
  run: "https://github.com/paulgsc/some-ui/actions/runs/1",
  frozenAt: "2026-11-02T09:30:00.000Z",
  data: "sample",
  snips: SNIPS,
  unreached: [],
}

const mark = (
  id: string,
  choice: SnipMark["mark"],
  at: string,
  note = ""
): SnipMark => ({ id, mark: choice, note, at })

describe("the snips desk", () => {
  it("reads a capture's manifest, and nothing else", () => {
    expect(readManifest(JSON.parse(JSON.stringify(MANIFEST)))).toEqual(MANIFEST)
    expect(readManifest({ ...MANIFEST, schema: "some-ui.snips/2" })).toBeNull()
    expect(readManifest({ ...MANIFEST, data: "home" })).toBeNull()
    expect(readManifest({ ...MANIFEST, commit: "main" })).toBeNull()
  })

  it("groups by module, and orders modules and snips the same each time", () => {
    const desk = deskOf(MANIFEST, [])
    expect(desk.map((m) => m.module)).toEqual(["Korean", "Studio"])
    expect(desk[1]?.snips.map((s) => s.snip.shows)).toEqual(["Clips", "Takes"])
    expect(deskOf({ ...MANIFEST, snips: [...SNIPS].reverse() }, [])).toEqual(
      desk
    )
  })

  it("shows each snip's newest mark, keeps every older one, and leaves out marks on other captures", () => {
    const id = SNIPS[0]?.id ?? ""
    const marks = [
      mark(id, "keep", "2026-11-21T10:00:00.000Z", "opening shot"),
      mark(id, "drop", "2026-11-21T09:00:00.000Z"),
      mark(
        "web:/gone:desktop:2.3.0:dddddddddddd",
        "keep",
        "2026-11-20T09:00:00.000Z"
      ),
    ]
    expect(latestMarks(marks).get(id)?.note).toBe("opening shot")
    expect(latestMarks(marks).size).toBe(2)
    const studio = deskOf(MANIFEST, marks).find((m) => m.module === "Studio")
    if (studio === undefined) throw new Error("no Studio module")
    expect(studio.snips.find((s) => s.snip.id === id)?.mark?.mark).toBe("keep")
    expect(tally(studio)).toEqual({
      keep: 1,
      drop: 0,
      open: 1,
    })
    expect(marks).toHaveLength(3)
  })

  it("takes a mark of a known choice, a short note and a moment", () => {
    const ok = mark("x", "keep", "2026-11-21T10:00:00.000Z", "a note")
    expect(SnipMarkSchema.safeParse(ok).success).toBe(true)
    expect(SnipMarkSchema.safeParse({ ...ok, mark: "maybe" }).success).toBe(
      false
    )
    expect(
      SnipMarkSchema.safeParse({ ...ok, note: "x".repeat(501) }).success
    ).toBe(false)
    expect(SnipMarkSchema.safeParse({ ...ok, at: "yesterday" }).success).toBe(
      false
    )
  })

  it("says what is kept where, never the machinery", () => {
    const words = Object.values(SNIPS_DESK_WORDS).map((w) =>
      typeof w === "string" ? w : w({ keep: 2, drop: 1, open: 3 })
    )
    for (const line of words) expect(line).not.toMatch(MACHINERY)
    expect(SNIPS_DESK_WORDS.tally({ keep: 2, drop: 1, open: 3 })).toBe(
      "2 kept, 1 dropped, 3 not chosen yet"
    )
  })
})
