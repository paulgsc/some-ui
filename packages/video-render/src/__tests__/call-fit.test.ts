/** CF1 (`call-fit.ts`): what is paged, what is refused, and that nothing is left out. */

import { sampleWeek } from "@video-render/__tests__/sample-week"
import {
  callChapterMarks,
  callCutList,
  callScenes,
  CallWeekSchema,
  parseCallWeek,
} from "@video-render/call"
import type { CallWeek } from "@video-render/call"
import { callFit, paragraphWords } from "@video-render/call-fit"
import type { CallPage } from "@video-render/call-fit"
import { readPinned } from "@video-render/node"
import { NOV_6_WEEK } from "@video-render/testing"
import { beforeAll, describe, expect, it } from "vitest"

let nov6: CallWeek | null = null

beforeAll(async () => {
  const raw = await readPinned(NOV_6_WEEK)
  if (raw !== null) nov6 = CallWeekSchema.parse(raw)
}, 60_000)

/** A copy of `week` changed by `change`, read back against the schema. */
function edited(week: CallWeek, change: (draft: CallWeek) => void): CallWeek {
  const draft = structuredClone<CallWeek>(week)
  change(draft)
  return CallWeekSchema.parse(draft)
}

const pull = (i: number): CallWeek["done"][number]["pulls"][number] => ({
  repo: "some-ui",
  kind: "pr",
  number: 9000 + i,
  title: "The render worker obeys the lane, and resumes from its kept steps",
  change: "story",
})

/**
 * Every group's entries across `pages`, in order: each page's `[from, to)`
 * must start where the last page of that group stopped.
 */
function covered(pages: ReadonlyArray<CallPage>): Record<string, number> {
  const upTo: Record<string, number> = {}
  for (const page of pages)
    for (const [group, range] of Object.entries(page.shows)) {
      const [from, to] = range
      expect(from, group).toBe(upTo[group] ?? 0)
      upTo[group] = to
    }
  return upTo
}

describe("the week of 2026-11-06 (#2918)", () => {
  it("is accepted as written: nothing in it is cut or refused", (context) => {
    if (nov6 === null) return context.skip()
    expect(parseCallWeek(nov6)).toMatchObject({ ok: true })
  })

  it("pages every list, each entry on exactly one page", (context) => {
    if (nov6 === null) return context.skip()
    const week = nov6
    const { pages } = callFit(week)
    expect(covered(pages["board"] ?? []).rows).toBe(week.board.rows.length)
    expect(covered(pages["close"] ?? []).later).toBe(week.later.length)
    for (const [i, batch] of week.done.entries())
      expect(covered(pages[`done-${i + 1}`] ?? []).pulls).toBe(
        batch.pulls.length
      )
    for (const [i, ask] of week.asks.entries())
      expect(covered(pages[`asks-${i + 1}`] ?? []).options).toBe(
        ask.options.length
      )
    for (const id of ["board", "done-1", "done-3", "asks-2", "close"])
      expect((pages[id] ?? []).length, id).toBeGreaterThan(1)
  })

  it("says each scene once, over its first page; the pages after hold silently", (context) => {
    if (nov6 === null) return context.skip()
    const scenes = callScenes(nov6)
    const done3 = scenes.filter((scene) => scene.id.startsWith("done-3"))
    expect(done3.map((scene) => scene.id)).toEqual([
      "done-3",
      "done-3-2",
      "done-3-3",
    ])
    const [first, ...rest] = done3
    expect(first?.said).toBe(nov6.done[2]?.said)
    for (const scene of rest) {
      expect(scene.said).toBe("")
      expect("holdMs" in scene ? scene.holdMs : 0).toBeGreaterThan(3_000)
    }
    const cut = callCutList(
      nov6,
      scenes.map(() => null)
    )
    const shot = cut.shots.find((each) => each.id === "done-3-2")
    const second = rest[0]
    const hold =
      second !== undefined && "holdMs" in second ? second.holdMs : undefined
    expect(hold).toBeDefined()
    expect(shot?.durationMs).toBe(hold)
    const marks = callChapterMarks(nov6).filter((mark) =>
      mark.scene.startsWith("asks-")
    )
    expect(marks.map((mark) => mark.scene)).toEqual([
      "asks-1",
      "asks-2",
      "asks-3",
      "asks-4",
    ])
  })
})

describe("the captioned frame (version 2 on)", () => {
  it("holds the sample week on one page a scene", () => {
    const week = sampleWeek()
    const { pages, problems } = callFit(week)
    expect(problems).toEqual([])
    for (const [id, each] of Object.entries(pages))
      expect(each.length, id).toBe(1)
  })

  it("pages a long list, leaving nothing out", () => {
    const week = edited(sampleWeek(), (w) => {
      w.board.rows = Array.from({ length: 60 }, (_, i) => ({
        ledger: `row-${i}`,
        title: "Studio takes on a conveyor",
        status: "open" as const,
        waitsOnYou: 0,
      }))
      const [first] = w.done
      if (first === undefined) throw new Error("done")
      first.pulls = [
        ...first.pulls,
        ...Array.from({ length: 30 }, (_, i) => pull(i)),
      ]
      w.later = Array.from({ length: 40 }, (_, i) => ({
        id: `later-${i}`,
        question: "Run home's deploy once more, for the Renders board",
        refs: [
          { repo: "server" as const, kind: "issue" as const, number: i + 1 },
        ],
      }))
    })
    expect(parseCallWeek(week)).toMatchObject({ ok: true })
    const { pages } = callFit(week)
    expect(covered(pages["board"] ?? []).rows).toBe(60)
    expect(covered(pages["done-1"] ?? []).pulls).toBe(
      week.done[0]?.pulls.length
    )
    expect(covered(pages["close"] ?? []).later).toBe(40)
    expect((pages["done-1"] ?? []).length).toBeGreaterThan(1)
  })

  it("carries a paragraph too long for a page onto the next, word by word", () => {
    const why = "Only you can say which of these matters more. ".repeat(40)
    const week = edited(sampleWeek(), (w) => {
      const [ask] = w.asks
      if (ask === undefined) throw new Error("asks")
      ask.whyYours = why
    })
    expect(parseCallWeek(week)).toMatchObject({ ok: true })
    const pages = callFit(week).pages["asks-1"] ?? []
    expect(pages.length).toBeGreaterThan(2)
    expect(covered(pages).why).toBe(paragraphWords(why).length)
  })

  it("moves a paragraph whole to the next page in a week before version 5, as it always did", () => {
    const why = "Only you can say which of these matters more. ".repeat(18)
    const week = (version: number): CallWeek =>
      edited(sampleWeek(), (w) => {
        w.template.version = version
        const [call] = w.mine
        if (call === undefined) throw new Error("mine")
        call.why = why
      })
    const whole = paragraphWords(why).length
    const shows = (version: number): ReadonlyArray<unknown> =>
      (callFit(week(version), { words: version >= 5 }).pages["mine-1"] ?? [])
        .map((page) => page.shows.why)
        .filter((range) => range !== undefined)
    expect(shows(4)).toEqual([[0, whole]])
    expect(shows(5).length).toBeGreaterThan(1)
  })

  it("refuses only a part no page break can split, naming the scene and the item", () => {
    const week = edited(sampleWeek(), (w) => {
      const [ask] = w.asks
      if (ask === undefined) throw new Error("asks")
      const [option] = ask.options
      if (option === undefined) throw new Error("options")
      option.says = "One option that runs on and on. ".repeat(60)
    })
    const parsed = parseCallWeek(week)
    expect(parsed.ok).toBe(false)
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      expect.stringMatching(
        /^asks-1 \(.+\): one part of it runs past a whole frame by about \d+ lines; shorten its question or its longest option$/
      ),
    ])
  })
})

describe("a version 1 week, with no caption band", () => {
  const v1 = (): CallWeek =>
    edited(sampleWeek(), (w) => {
      w.template.version = 1
      const [first] = w.done
      if (first === undefined) throw new Error("done")
      first.pulls = [
        ...first.pulls,
        ...Array.from({ length: 30 }, (_, i) => pull(i)),
      ]
      const [ask] = w.asks
      if (ask === undefined) throw new Error("asks")
      ask.whyYours = "Only you can say which of these matters more. ".repeat(40)
    })

  it("is drawn as it always was: a scene each, unpaged", () => {
    const scenes = callScenes(v1())
    expect(scenes.some((scene) => "page" in scene && scene.page)).toBe(false)
    expect(scenes.filter((scene) => scene.section === "done")).toHaveLength(
      v1().done.length
    )
  })

  it("is not held to the captioned frame", () => {
    expect(parseCallWeek(v1())).toMatchObject({ ok: true })
  })
})
