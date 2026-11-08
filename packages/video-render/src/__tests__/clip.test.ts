/**
 * Clips (SFEED7): what paulgsc/testing's `clips/` may hold, and the reasons
 * `render clip-check` refuses it.
 */
import {
  CLIP_INDEX_SCHEMA,
  clipFolderProblems,
  WALK_SCHEMA,
} from "@video-render/clip"
import { describe, expect, it } from "vitest"

const walk = (labels: ReadonlyArray<string>): object => ({
  schema: WALK_SCHEMA,
  snips: labels.map((label, i) => ({ file: `snips/0${i + 1}.png`, label })),
})

const index = (clip: object = {}): object => ({
  schema: CLIP_INDEX_SCHEMA,
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

describe("a clips folder", () => {
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
