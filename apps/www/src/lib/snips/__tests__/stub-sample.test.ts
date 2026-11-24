/**
 * The snips' sample (`apps/mobile/snips/sample-routes.json`, #3476): what
 * Snips Capture's stand-in home answers beside its base routes, so the APK's
 * pictures show a Monday at FROZEN_AT rather than empty screens. Every answer
 * is read by the phone's own readers, as the screens read it, and each Rust
 * Rounds week is held to the sample week it moves, so the sample has one
 * source.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { HeldWeek } from "@some-ui/rust-rounds"
import {
  currentWeek,
  exchangeRustRounds,
  heldFromHome,
  keptRounds,
  keptWeeks,
  QUILLMOSS_WEEK,
  TALLOWBROOK_HELD,
} from "@some-ui/rust-rounds"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { readBoard } from "@/lib/renders/model"
import { failedLine, RENDERS_WORDS } from "@/lib/renders/words"
import { FROZEN_AT } from "@/lib/snips"
import { readTakes } from "@/lib/take-library/model"
import { readAttention } from "@/lib/take-reconcile/model"

const MOBILE = resolve(import.meta.dirname, "../../../../../mobile")

/** A routes file as `stub-home.mjs` reads it. */
const RoutesSchema = z.object({
  routes: z.record(
    z.string(),
    z.object({
      status: z.number().optional(),
      body: z.unknown().optional(),
      echo: z.string().optional(),
    })
  ),
})
type Route = z.infer<typeof RoutesSchema>["routes"][string]

const read = (path: string): Readonly<Record<string, Route>> =>
  RoutesSchema.parse(JSON.parse(readFileSync(resolve(MOBILE, path), "utf8")))
    .routes

const SAMPLE = read("snips/sample-routes.json")
/** As `capture-apk.sh` lays them: the sample over the base routes. */
const ROUTES = { ...read("compat/stub-routes.json"), ...SAMPLE }

/** A route key's path as a pattern, as `stub-home.mjs` reads it. */
const matches = (key: string, asked: string): boolean =>
  new RegExp(
    `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[a-z]+/gi, "[^/]+")}$`
  ).test(asked)

/** The stand-in home, answering as `stub-home.mjs` does, under home's `/api/v1`. */
const home: HomeCall = (method, path) => {
  const asked = `${method} /api/v1${path.split("?")[0] ?? ""}`
  const route = Object.hasOwn(ROUTES, asked)
    ? ROUTES[asked]
    : (Object.entries(ROUTES).find(([key]) => matches(key, asked))?.[1] ?? {
        status: 200,
        body: {},
      })
  const answer: HomeAnswer = {
    status: route.status ?? 200,
    body: JSON.stringify(route.body ?? null),
  }
  return Promise.resolve(answer)
}

const ask = (path: string): Promise<HomeAnswer> => home("GET", path)

describe("the snips' sample (#3476)", () => {
  it("gives Renders a board the phone reads: both Monday essays expected today, the call on Friday", async () => {
    const read = readBoard(await ask("/renders"))
    if (read.kind !== "read") throw new Error(`unread: ${read.kind}`)
    const { board } = read
    expect(board.now).toBeNull()
    expect(board.waiting).toEqual([])
    expect(board.coming).toEqual([
      { feed: "rust-essay", on: FROZEN_AT.slice(0, 10) },
      { feed: "interview-essay", on: FROZEN_AT.slice(0, 10) },
      { feed: "call", on: "2026-11-06" },
    ])
    // Before the page's clock, every one.
    for (const row of [...board.done, ...board.failed])
      expect(row.at * 1000).toBeLessThan(Date.parse(FROZEN_AT))
    // Couldn't finish says why, in the owner's terms.
    expect(board.failed.map(failedLine)).toEqual([
      expect.stringMatching(/^Home couldn't make out 1 recording /),
    ])
    expect(RENDERS_WORDS.expected(board.coming[0]?.on ?? "")).toMatch(
      /^Expected /
    )
  })

  it("lists on Needs your attention the take a held cards essay plays, and a Rust Rounds one", async () => {
    const read = readAttention(await ask("/voice-notes/attention"))
    if (read.kind !== "read") throw new Error(`unread: ${read.kind}`)
    expect(read.page.total).toBe(read.page.takes.length)
    expect(read.page.takes.map((take) => [take.of, take.verdict.kind])).toEqual(
      [
        ["rust-round", "garbled"],
        ["studio", "failed"],
      ]
    )
    const board = readBoard(await ask("/renders"))
    const held = board.kind === "read" ? board.board.failed[0]?.items : []
    expect(read.page.takes.map((take) => take.id)).toEqual(
      expect.arrayContaining(held ?? ["none"])
    )
  })

  it("lists on Takes week 44's takes: one heard, one home couldn't make out, one not heard yet", async () => {
    const read = readTakes(await ask("/voice-notes/takes?kind=all"))
    if (read.kind !== "read") throw new Error(`unread: ${read.kind}`)
    const takes = read.page.takes
    expect(
      takes.map((take) => [take.of, take.ref, take.heard === null])
    ).toEqual([
      ["rust-round", "2026-w44:QM-313", true],
      ["rust-round", "2026-w44:QM-312", true],
      ["rust-round", "2026-w44:QM-311", false],
    ])
    for (const take of takes)
      expect(Date.parse(take.storedAt)).toBeLessThan(Date.parse(FROZEN_AT))
  })

  it("moves the sample weeks to the week that ended and the week that opened, and nothing else", async () => {
    const week = async (id: string): Promise<HeldWeek | null> =>
      heldFromHome(JSON.parse((await ask(`/rust-weeks/${id}`)).body))
    const w44 = await week("2026-w44")
    const w45 = await week("2026-w45")
    expect(w44?.week).toEqual({
      ...QUILLMOSS_WEEK,
      id: "2026-w44",
      opens: "2026-10-26T00:00:00-07:00",
      due: "2026-11-01T23:59:00-08:00",
    })
    expect(w45?.week).toEqual({
      ...TALLOWBROOK_HELD.week,
      id: "2026-w45",
      opens: "2026-11-02T00:00:00-08:00",
      due: "2026-11-08T23:59:00-08:00",
    })
    expect(w45?.runs).toEqual(TALLOWBROOK_HELD.runs)
  })

  it("lets a fresh phone take both weeks, and the one open at FROZEN_AT is Tallowbrook's", async () => {
    const weeks = keptWeeks(inMemoryStorage())
    expect(
      await exchangeRustRounds(keptRounds(inMemoryStorage()), weeks, home)
    ).toEqual({ kind: "synced" })
    const held = weeks.held()
    expect(held.unread).toEqual([])
    expect(held.weeks.map((each) => each.week.id).sort()).toEqual([
      "2026-w44",
      "2026-w45",
    ])
    expect(
      currentWeek(held.weeks, Date.parse(FROZEN_AT))?.week.company.name
    ).toBe("Tallowbrook")
  })

  it("answers only reads, and lays over the base routes without changing the ones it doesn't name", () => {
    for (const key of Object.keys(SAMPLE))
      expect(key).toMatch(/^GET \/api\/v1\//)
    const base = read("compat/stub-routes.json")
    for (const [key, route] of Object.entries(base))
      if (!Object.hasOwn(SAMPLE, key)) expect(ROUTES[key]).toEqual(route)
  })
})
