import {
  parseRegionRef,
  parseScreens,
  regionOf,
  regionRef,
  regionsOf,
  screenOfRef,
  SCREENS_SCHEMA,
} from "@video-render/screen"
import { describe, expect, it } from "vitest"

const screen = {
  id: "QM-311",
  file: "QM-311.png",
  width: 412,
  height: 1400,
  scale: 2,
  viewport: { width: 412, height: 915 },
  regions: [
    { ref: "QM-311:question", box: { x: 16, y: 40, width: 380, height: 120 } },
    {
      ref: "QM-311:diagnostic:1",
      box: { x: 16, y: 900, width: 380, height: 200 },
    },
  ],
}

const file = (
  screens: ReadonlyArray<unknown>
): {
  schema: string
  source: { kind: string; id: string }
  screens: ReadonlyArray<unknown>
} => ({
  schema: SCREENS_SCHEMA,
  source: { kind: "rust-week", id: "2026-w46" },
  screens,
})

const problems = (value: unknown): ReadonlyArray<string> => {
  const parsed = parseScreens(value)
  return parsed.ok ? [] : parsed.problems
}

describe("a region's name, any screen's", () => {
  it("is <screen>:<name>, the name one or more slugs", () => {
    expect(screenOfRef("QM-311:diagnostic:2")).toBe("QM-311")
    expect(screenOfRef("settings:theme-toggle")).toBe("settings")
    for (const ref of ["settings", "settings:", ":x", "a b:c", "x:y z"])
      expect(screenOfRef(ref), ref).toBeNull()
  })
})

describe("a Rust Rounds card's region name", () => {
  it("reads each kind, numbered ones from 1", () => {
    expect(parseRegionRef("QM-311:question")).toEqual({
      ticket: "QM-311",
      kind: "question",
      n: null,
    })
    expect(parseRegionRef("QM-311:diagnostic:2")).toEqual({
      ticket: "QM-311",
      kind: "diagnostic",
      n: 2,
    })
    expect(parseRegionRef("QM-311:point:1")?.kind).toBe("point")
    expect(parseRegionRef("QM-311:program")?.kind).toBe("program")
    expect(parseRegionRef("QM-311:run")?.kind).toBe("run")
  })

  it("names nothing else", () => {
    for (const ref of [
      "QM-311",
      "qm-311:program",
      "QM-311:program:1",
      "QM-311:point",
      "QM-311:diagnostic:0",
      "QM-311:figure:1",
      " QM-311:run",
    ])
      expect(parseRegionRef(ref), ref).toBeNull()
  })

  it("is written by regionRef and read back the same", () => {
    expect(regionRef("QM-311", "point", 3)).toBe("QM-311:point:3")
    expect(regionRef("QM-311", "program")).toBe("QM-311:program")
    expect(() => regionRef("QM-311", "point")).toThrow()
  })
})

describe("screens.json", () => {
  it("reads a capture, and finds a region by its name", () => {
    const parsed = parseScreens(file([screen]))
    if (!parsed.ok) throw new Error(parsed.problems.join("; "))
    expect(regionOf(parsed.value, "QM-311:diagnostic:1")?.region.box.y).toBe(
      900
    )
    expect(regionOf(parsed.value, "QM-311:program")).toBeNull()
    expect(regionOf(parsed.value, "nonsense")).toBeNull()
  })

  it("refuses a region named twice, another ticket's, or outside the picture", () => {
    const twice = { ...screen, regions: [screen.regions[0], screen.regions[0]] }
    expect(problems(file([twice])).join()).toContain("named twice")
    const other = {
      ...screen,
      regions: [{ ref: "AB-1:program", box: screen.regions[0]?.box }],
    }
    expect(problems(file([other])).join()).toContain("not a region of QM-311")
    const outside = {
      ...screen,
      regions: [
        { ref: "QM-311:run", box: { x: 0, y: 1300, width: 10, height: 200 } },
      ],
    }
    expect(problems(file([outside])).join()).toContain("outside the picture")
  })

  it("reads any screen's regions, with or without a source", () => {
    const cards = {
      id: "settings",
      file: "settings.png",
      width: 412,
      height: 900,
      scale: 2,
      viewport: { width: 412, height: 915 },
      regions: [
        {
          ref: "settings:theme:toggle",
          box: { x: 10, y: 10, width: 100, height: 40 },
        },
      ],
    }
    const parsed = parseScreens({ schema: SCREENS_SCHEMA, screens: [cards] })
    if (!parsed.ok) throw new Error(parsed.problems.join("; "))
    expect(regionOf(parsed.value, "settings:theme:toggle")?.screen.id).toBe(
      "settings"
    )
  })

  it("refuses two screens of one ticket", () => {
    expect(problems(file([screen, screen])).join()).toContain("two screens")
    expect(
      problems(file([screen, { ...screen, id: "QM-312", regions: [] }])).join()
    ).toContain("two screens' picture")
  })
})

describe("regions from what the page measured", () => {
  it("boxes one ref around every element carrying it, in first-shown order", () => {
    expect(
      regionsOf([
        {
          ref: "QM-311:question",
          box: { x: 16, y: 40, width: 300, height: 30 },
        },
        {
          ref: "QM-311:program",
          box: { x: 16, y: 300, width: 380, height: 200 },
        },
        {
          ref: "QM-311:question",
          box: { x: 16, y: 80, width: 380, height: 60 },
        },
      ])
    ).toEqual([
      {
        ref: "QM-311:question",
        box: { x: 16, y: 40, width: 380, height: 100 },
      },
      {
        ref: "QM-311:program",
        box: { x: 16, y: 300, width: 380, height: 200 },
      },
    ])
  })

  it("leaves out a ref that names nothing and an element with no size", () => {
    expect(
      regionsOf([
        { ref: "stray", box: { x: 0, y: 0, width: 10, height: 10 } },
        { ref: "QM-311:run", box: { x: 0, y: 0, width: 0, height: 10 } },
      ])
    ).toEqual([])
  })

  it("cuts each box to the picture, and leaves out a part outside it", () => {
    expect(
      regionsOf(
        [
          { ref: "QM-311:run", box: { x: -4, y: 900, width: 420, height: 40 } },
          {
            ref: "QM-311:diagnostic:1",
            box: { x: 16, y: 950, width: 380, height: 40 },
          },
        ],
        { width: 412, height: 915 }
      )
    ).toEqual([
      { ref: "QM-311:run", box: { x: 0, y: 900, width: 412, height: 15 } },
    ])
  })
})
