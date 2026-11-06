/**
 * The weekly call (ST29's first template): every pinned version of its
 * format parses and the newest is the code's, so a change to the sections
 * fails here until a new version is pinned; the sample week, the template's
 * sample data, parses against its own schema and makes one scene per
 * section and per item; and a week that contradicts itself is refused with
 * every reason.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CALL_ID,
  CALL_STAGE_WIDTH,
  CALL_VERSION,
  callFormat,
  callScenes,
  parseCallWeek,
  refUrl,
  sampleCallWeek,
} from "@video-render/call"
import type { CallWeek } from "@video-render/call"
import { parseFormat } from "@video-render/format"
import { readSeries } from "@video-render/node"
import { versionOfFile } from "@video-render/series"
import { describe, expect, it } from "vitest"

const DIR = join(import.meta.dirname, "../templates", CALL_ID)

const week = (): CallWeek => {
  const parsed = sampleCallWeek()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("the call's format", () => {
  it("every pinned version parses, and the newest is the code's", () => {
    const pinned = readdirSync(DIR)
      .map((file) => ({ file, version: versionOfFile(file) }))
      .filter((f): f is { file: string; version: number } => f.version !== null)
      .sort((a, b) => a.version - b.version)
    expect(pinned.length).toBeGreaterThan(0)
    for (const { file, version } of pinned) {
      const parsed = parseFormat(
        JSON.parse(readFileSync(join(DIR, file), "utf8"))
      )
      expect(parsed.ok && parsed.value.version).toBe(version)
    }
    const newest = pinned.at(-1)!
    expect(newest.version).toBe(CALL_VERSION)
    expect(JSON.parse(readFileSync(join(DIR, newest.file), "utf8"))).toEqual(
      callFormat()
    )
  })

  it("is drawn in its own series", async () => {
    const series = await readSeries(
      join(import.meta.dirname, "../sample/series", CALL_ID),
      callFormat().series.version
    )
    if (!series.ok) throw new Error(series.problems.join("; "))
    expect(series.value.id).toBe(callFormat().series.id)
    expect(series.value.frame.width).toBe(CALL_STAGE_WIDTH)
  })
})

describe("the sample week", () => {
  it("parses against its own schema, for the version the code makes", () => {
    expect(week().template).toEqual({ id: CALL_ID, version: CALL_VERSION })
  })

  it("is a scene per section and per item, in the format's order", () => {
    const w = week()
    const scenes = callScenes(w)
    expect(scenes.map((s) => s.id)).toEqual([
      "open",
      "board",
      "moved-1",
      "moved-2",
      "done-1",
      "done-2",
      "done-3",
      "done-4",
      "gray-1",
      "mine-1",
      "asks-1",
      "asks-2",
      "close",
    ])
    expect(scenes.find((s) => s.id === "asks-2")?.item).toBe("talk-d1")
  })
})

describe("a week that contradicts itself", () => {
  it("is refused, with every reason", () => {
    const w = week()
    const bad = {
      ...w,
      week: { from: "2026-11-05", to: "2026-10-30" },
      done: [
        w.done[0]!,
        { ...w.done[1]!, pulls: [...w.done[1]!.pulls, w.done[0]!.pulls[0]!] },
      ],
      board: { ...w.board, rows: [...w.board.rows, w.board.rows[0]] },
      later: [...w.later, { ...w.later[0]!, id: w.asks[0]!.id }],
      mine: [{ ...w.mine[0]!, chose: 2, options: ["Same", "Same"] }],
      asks: [{ ...w.asks[0]!, recommended: 5 }, w.asks[1]],
    }
    expect(parseCallWeek(bad)).toEqual({
      ok: false,
      problems: [
        "week: it ends before it starts",
        "redeploy-home: two items share this id",
        "some-ui#2614: it is in two batches",
        "my-data-where: some-ui#2596 landed, and no batch has it",
        "my-data-where: server#678 landed, and no batch has it",
        "dna-strict: two options say the same",
        "board: a ledger item is listed twice",
        "dna-strict: it chose an option it doesn't list",
        "redeploy-home: it recommends an option it doesn't list",
      ],
    })
  })

  it("is refused for a week of more than two, or a batch that lists a pull twice", () => {
    const w = week()
    expect(
      parseCallWeek({ ...w, week: { from: "2026-10-01", to: "2026-11-05" } })
    ).toEqual({ ok: false, problems: ["week: it runs more than 14 days"] })
    const twice = {
      ...w.done[0]!,
      pulls: [...w.done[0]!.pulls, w.done[0]!.pulls[0]!],
    }
    expect(parseCallWeek({ ...w, done: [twice, ...w.done.slice(1)] })).toEqual({
      ok: false,
      problems: ["take-library: it lists a pull request twice"],
    })
  })
})

it("links a reference to where it is on GitHub", () => {
  expect(refUrl({ repo: "server", kind: "pr", number: 681 })).toBe(
    "https://github.com/paulgsc/server/pull/681"
  )
  expect(refUrl({ repo: "some-ui", kind: "issue", number: 2248 })).toBe(
    "https://github.com/paulgsc/some-ui/issues/2248"
  )
})
