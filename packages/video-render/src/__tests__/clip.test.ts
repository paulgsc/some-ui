/**
 * Clips (SFEED7): what paulgsc/testing's `clips/` may hold, and the reasons
 * `render clip-check` refuses it.
 */
import {
  CLIP_INDEX_SCHEMA,
  CLIP_INDEX_SCHEMA_V1,
  clipFolderProblems,
  parseClipIndex,
  WALK_SCHEMA,
} from "@video-render/clip"
import { describe, expect, it } from "vitest"

const walk = (labels: ReadonlyArray<string>): object => ({
  schema: WALK_SCHEMA,
  snips: labels.map((label, i) => ({ file: `snips/0${i + 1}.png`, label })),
})

const index = (clip: object = {}): object => ({
  schema: CLIP_INDEX_SCHEMA_V1,
  clips: [
    {
      id: "never-suspend",
      title: "Never suspend a site, from the popup",
      app: "suspender-ledger",
      change: { repo: "some-ui", kind: "pr", number: 2600 },
      landed: "2026-11-01",
      before: {
        made: "walk",
        snips: [{ file: "before/snips/01.png", label: "Opens" }],
      },
      after: {
        made: "walk",
        snips: [
          { file: "after/snips/01.png", label: "Opens" },
          { file: "after/snips/02.png", label: "Never suspend" },
        ],
      },
      ...clip,
    },
  ],
})

const FILES = new Set([
  "never-suspend/before/snips/01.png",
  "never-suspend/after/snips/01.png",
  "never-suspend/after/snips/02.png",
  "never-suspend/after/shot.png",
])
const exists = (path: string): boolean => FILES.has(path)

const folder =
  (raw: object) =>
  (path: string): unknown =>
    new Map<string, unknown>([
      ["index.json", raw],
      ["never-suspend/before/walk.json", walk(["Opens"])],
      ["never-suspend/after/walk.json", walk(["Opens", " Never suspend "])],
    ]).get(path)

describe("a clips folder of the first index (/1)", () => {
  it("is ready when every walk's snips are its walk.json's, and there", () => {
    expect(clipFolderProblems(folder(index()), exists)).toEqual([])
  })

  it("takes stills the session took, with nothing before", () => {
    const made = index({
      before: null,
      after: {
        made: "session",
        snips: [{ file: "after/shot.png", label: "Opens" }],
      },
    })
    expect(clipFolderProblems(folder(made), exists)).toEqual([])
  })

  it("names a walk.json that isn't one", () => {
    const raw = index()
    const read = (path: string): unknown =>
      path.endsWith("after/walk.json") ? undefined : folder(raw)(path)
    expect(clipFolderProblems(read, exists)).toEqual([
      "never-suspend: never-suspend/after/walk.json isn't a walk",
    ])
  })

  it("names a walk the index lists differently, and a file that isn't there", () => {
    const raw = index({
      after: {
        made: "walk",
        snips: [{ file: "after/snips/03.png", label: "Opens" }],
      },
    })
    expect(clipFolderProblems(folder(raw), exists)).toEqual([
      "never-suspend: after/snips/03.png isn't there",
      "never-suspend: its after lists other snips than never-suspend/after/walk.json",
    ])
  })

  it("refuses a file outside the clip's folder", () => {
    const raw = index({
      after: {
        made: "session",
        snips: [{ file: "../secret.png", label: "x" }],
      },
    })
    expect(clipFolderProblems(folder(raw), exists)[0]).toMatch(/^index\.json: /)
  })
})

/** An index as written now: frames on home, testing holding the index and its legacy frames. */
const indexV2 = (clip: object = {}): object => ({
  schema: CLIP_INDEX_SCHEMA,
  clips: [
    {
      id: "never-suspend",
      title: "Never suspend a site, from the popup",
      app: "suspender-ledger",
      change: { repo: "some-ui", kind: "pr", number: 2600 },
      landed: "2026-11-01",
      before: null,
      after: {
        made: "walk",
        walk: { app: "suspender-ledger", sample: "after/sample.json" },
        snips: [
          {
            file: "after/snips/01.png",
            label: "Opens",
            sha256: "a".repeat(64),
          },
        ],
      },
      ...clip,
    },
  ],
})

const folderV2 =
  (raw: object, files: Record<string, unknown> = {}) =>
  (path: string): unknown =>
    new Map<string, unknown>([
      ["index.json", raw],
      ["never-suspend/after/sample.json", { sample: true }],
      ...Object.entries(files),
    ]).get(path)

const nothing = (): boolean => false

describe("a clips folder of the index now (/2)", () => {
  it("is ready holding no frames: home makes a walk's from its sample", () => {
    expect(clipFolderProblems(folderV2(indexV2()), nothing)).toEqual([])
  })

  it("keeps only the labels of stills the session took", () => {
    const raw = indexV2({
      after: {
        made: "session",
        snips: [{ file: "after/01.png", label: "Opens" }],
      },
    })
    expect(clipFolderProblems(folderV2(raw), nothing)).toEqual([])
  })

  it("names a walk whose sample isn't there", () => {
    const raw = indexV2()
    const read = (path: string): unknown =>
      path.endsWith("sample.json") ? undefined : folderV2(raw)(path)
    expect(clipFolderProblems(read, nothing)).toEqual([
      "never-suspend: never-suspend/after/sample.json isn't a sample home can replay",
    ])
  })

  it("names a frame kept in testing that isn't legacy", () => {
    const exists = (path: string): boolean =>
      path === "never-suspend/after/snips/01.png"
    expect(clipFolderProblems(folderV2(indexV2()), exists)).toEqual([
      "never-suspend: after/snips/01.png is a frame, and home keeps those",
    ])
  })

  it("still looks for a legacy frame, and names one missing", () => {
    const raw = indexV2({
      id: "studio-release-promo",
      before: {
        made: "session",
        snips: [{ file: "before/01-templates.png", label: "Templates" }],
      },
      after: {
        made: "session",
        snips: [{ file: "after/01-templates.png", label: "Templates" }],
      },
    })
    const exists = (path: string): boolean =>
      path === "studio-release-promo/before/01-templates.png"
    expect(clipFolderProblems(folderV2(raw), exists)).toEqual([
      "studio-release-promo: after/01-templates.png isn't there",
    ])
  })

  it("refuses a walk with no sample, and a sha256 that isn't one", () => {
    const noSample = indexV2({
      after: { made: "walk", snips: [{ file: "after/01.png", label: "x" }] },
    })
    const badSum = indexV2({
      after: {
        made: "session",
        snips: [{ file: "after/01.png", label: "x", sha256: "ABC" }],
      },
    })
    expect(parseClipIndex(noSample).ok).toBe(false)
    expect(parseClipIndex(badSum).ok).toBe(false)
  })
})
