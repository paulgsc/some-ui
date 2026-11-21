import { SILENT_WEEKS, silentModules } from "@engagement/lib/silence"
import { describe, expect, it } from "vitest"

describe("silence (#3338)", () => {
  it("names a measured module quiet for the window or longer, never-opened first", () => {
    expect(
      silentModules([
        { pipeline: "jobs", opened: { kind: "measured", weeksQuiet: 0 } },
        { pipeline: "leetype", opened: { kind: "measured", weeksQuiet: 6 } },
        { pipeline: "aph", opened: { kind: "measured", weeksQuiet: null } },
        {
          pipeline: "bites",
          opened: { kind: "measured", weeksQuiet: SILENT_WEEKS },
        },
        {
          pipeline: "topik",
          opened: { kind: "measured", weeksQuiet: SILENT_WEEKS - 1 },
        },
      ])
    ).toEqual([
      { pipeline: "aph", weeksQuiet: null },
      { pipeline: "leetype", weeksQuiet: 6 },
      { pipeline: "bites", weeksQuiet: SILENT_WEEKS },
    ])
  })

  it("never calls a module silent whose opening isn't measured", () => {
    expect(
      silentModules([{ pipeline: "studio", opened: { kind: "not-measured" } }])
    ).toEqual([])
  })
})
