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
  CALL_INDEX_SCHEMA,
  CALL_STAGE_WIDTH,
  CALL_VERSION,
  callCutList,
  callFolderProblems,
  callFormat,
  callIntro,
  callScenes,
  estimatedCallMs,
  parseCallIndex,
  parseCallWeek,
  sampleCallWeek,
} from "@video-render/call"
import type { CallWeek } from "@video-render/call"
import { parseCutList } from "@video-render/cut-list"
import { parseFormat } from "@video-render/format"
import { readSeries } from "@video-render/node"
import { refUrl } from "@video-render/refs"
import { versionOfFile } from "@video-render/series"
import { BRAND_MS, readingMs } from "@video-render/stills"
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
      expect(JSON.parse(readFileSync(join(DIR, file), "utf8"))).toEqual(
        callFormat(version)
      )
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

  it("is a scene per section and per item, in the format's order, in its shape", () => {
    const w = week()
    const scenes = callScenes(w)
    expect(scenes.map((s) => s.id)).toEqual([
      "intro",
      "brand-in",
      "open",
      "chapter-board",
      "board",
      "chapter-moved",
      "moved-1",
      "moved-2",
      "chapter-done",
      "done-1",
      "done-2",
      "done-3",
      "done-4",
      "chapter-gray",
      "gray-1",
      "chapter-mine",
      "mine-1",
      "chapter-asks",
      "asks-1",
      "asks-2",
      "close",
      "brand-out",
    ])
    const ask = scenes.find((s) => s.id === "asks-2")
    expect(ask && "item" in ask && ask.item).toBe("talk-d1")
    expect(scenes.find((s) => s.id === "chapter-done")).toMatchObject({
      of: "done",
      said: "What landed.",
    })
    expect(scenes.filter((s) => s.said === "").map((s) => s.id)).toEqual([
      "brand-in",
      "brand-out",
    ])
  })

  it("in a week written for version 1, has no intro, chapters or brand", () => {
    const w = week()
    const ids = callScenes({ ...w, template: { ...w.template, version: 1 } })
    expect(ids.map((s) => s.id)).toEqual(
      callScenes(w)
        .filter(
          (s) =>
            !["intro", "brand-in", "chapter", "brand-out"].includes(s.section)
        )
        .map((s) => s.id)
    )
  })

  it("opens on the locked intro, filled by code from the week alone", () => {
    const w = week()
    const intro = callIntro(w)
    expect(intro.rows.map((r) => r.label)).toEqual([
      "Written by",
      "Drawn by",
      "Voices",
      "Calls inside",
    ])
    expect(intro.rows[3]?.says).toBe(
      `${w.asks.length} questions wait on you · ${w.mine.length} call Claude made without you · ${w.gray.length} technical call in a gray area`
    )
    expect(intro.said).toContain("every voice you hear is synthetic")
    expect(callScenes(w)[0]).toEqual({
      section: "intro",
      id: "intro",
      said: intro.said,
    })
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
        "dna-strict: it chose an option it doesn't list",
        "board: a ledger item is listed twice",
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

describe("the call as a cut list", () => {
  it("is one the renderer draws: a still per scene, its take where said, else its words' reading time", () => {
    const w = week()
    const scenes = callScenes(w)
    const words = [{ text: "This", startMs: 100, endMs: 300 }]
    const takes = scenes.map((s, i) =>
      s.id === "board" || s.said === ""
        ? null
        : { ms: 4_000 + i, ...(i === 0 ? { words } : {}) }
    )
    const cut = parseCutList(callCutList(w, takes))
    if (!cut.ok) throw new Error(cut.problems.join("; "))
    const shot = (id: string): (typeof cut.value.shots)[number] | undefined =>
      cut.value.shots.find((s) => s.id === id)
    expect(shot("intro")).toMatchObject({
      picture: { kind: "still", source: "01-intro.png" },
      take: { file: "01-intro.wav", inMs: 0, outMs: 4_000, words },
      durationMs: 300 + 4_000 + 700,
    })
    expect(shot("board")?.take).toBeUndefined()
    expect(shot("board")?.durationMs).toBe(readingMs(w.board.said))
    expect(shot("brand-in")?.durationMs).toBe(BRAND_MS)
    expect(cut.value.shots).toHaveLength(scenes.length)
    expect(cut.value.burnIns).toEqual([{ kind: "captions", params: {} }])
    expect(cut.value.music).toBe("off")
    expect(callCutList(w, takes, { bed: true }).music).toBeUndefined()
  })
})

describe("a week's length, before it is said", () => {
  it("is each scene's reading time, so the policy can refuse a long week before the speaker", () => {
    const w = week()
    expect(estimatedCallMs(w)).toBe(
      callScenes(w).reduce(
        (t, s) => t + (s.said === "" ? BRAND_MS : readingMs(s.said)),
        0
      )
    )
    const long: CallWeek = {
      ...w,
      open: { ...w.open, said: "word ".repeat(5_000) },
    }
    expect(estimatedCallMs(long) - estimatedCallMs(w)).toBeGreaterThan(
      30 * 60_000
    )
  })
})

describe("the index of weeks kept", () => {
  const index = (
    weeks: Array<{ from: string; to: string }>,
    keep = 8
  ): ReturnType<typeof parseCallIndex> =>
    parseCallIndex({ schema: CALL_INDEX_SCHEMA, keep, weeks })

  it("lists its weeks newest first, each once, past `keep` while home holds them not yet", () => {
    const later = { from: "2026-11-06", to: "2026-11-12" }
    const first = { from: "2026-10-30", to: "2026-11-05" }
    expect(index([later, first]).ok).toBe(true)
    expect(index([first, later]).ok).toBe(false)
    expect(index([first, first]).ok).toBe(false)
    expect(index([later, first], 1).ok).toBe(true)
  })
})

describe("a call folder", () => {
  const w = (): CallWeek => week()
  const folder = (
    weeks: Array<{ from: string; to: string }>,
    files: Record<string, unknown>
  ): Map<string, unknown> =>
    new Map<string, unknown>([
      ["index.json", { schema: CALL_INDEX_SCHEMA, keep: 8, weeks }],
      ...Object.entries(files),
    ])

  it("is ready when its index lists every week it holds, each named for its days", () => {
    expect(
      callFolderProblems(folder([w().week], { "2026-10-30.json": w() }))
    ).toEqual([])
  })

  it("is refused for a week missing, misnamed, unread or forgotten", () => {
    expect(
      callFolderProblems(
        folder([w().week, { from: "2026-10-23", to: "2026-10-29" }], {
          "2026-10-30.json": {
            ...w(),
            week: { from: "2026-10-31", to: "2026-11-05" },
          },
          "2026-10-16.json": w(),
        })
      )
    ).toEqual([
      "2026-10-30.json: it holds 2026-10-31 to 2026-11-05, and the index says 2026-10-30 to 2026-11-05",
      "2026-10-23.json: the index lists it, and there is no such file",
      "2026-10-16.json: the index doesn't list it",
    ])
    expect(callFolderProblems(new Map())[0]).toMatch(/^index\.json: /)
  })

  it("is refused when its newest week is written for an older template; an older week keeps its own", () => {
    const old = (from: string, to: string): CallWeek => ({
      ...w(),
      template: { ...w().template, version: 1 },
      week: { from, to },
    })
    const older = { from: "2026-10-23", to: "2026-10-29" }
    expect(
      callFolderProblems(
        folder([w().week, older], {
          "2026-10-30.json": w(),
          "2026-10-23.json": old(older.from, older.to),
        })
      )
    ).toEqual([])
    expect(
      callFolderProblems(
        folder([w().week], {
          "2026-10-30.json": old(w().week.from, w().week.to),
        })
      )
    ).toEqual([
      `2026-10-30.json: it's written for version 1 of the template, and the newest week is written for version ${CALL_VERSION}`,
    ])
  })
})
