import {
  MODULE_OPENS_SCHEMA,
  readModuleOpens,
  SILENT_WEEKS,
  silentModules,
} from "@engagement/lib/silence"
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

describe("reading a kept aggregate's modules (#3338)", () => {
  it("reads each module, and names the first that isn't one", () => {
    const modules = [
      { pipeline: "jobs", opened: { kind: "measured", weeksQuiet: 0 } },
      { pipeline: "bites", opened: { kind: "not-measured" } },
    ]
    expect(readModuleOpens({ schema: MODULE_OPENS_SCHEMA, modules })).toEqual({
      ok: true,
      modules,
    })
    expect(
      readModuleOpens({
        schema: MODULE_OPENS_SCHEMA,
        modules: [
          ...modules,
          { pipeline: "aph", opened: { kind: "measured" } },
        ],
      })
    ).toEqual({ ok: false, at: 2 })
    // /3 only added places' finished and left part-way: a /2 render's modules read.
    expect(readModuleOpens({ schema: "some-ui.friction/2", modules })).toEqual({
      ok: true,
      modules,
    })
    expect(readModuleOpens({ schema: "some-ui.friction/1", modules })).toEqual({
      ok: false,
      at: -1,
    })
  })
})
