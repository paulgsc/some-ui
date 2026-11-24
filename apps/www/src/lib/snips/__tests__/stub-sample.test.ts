/**
 * The snips' sample (`apps/mobile/snips/sample-routes.json`, #3476): what
 * Snips Capture's stand-in home answers beside its base routes, so the APK's
 * pictures show a Monday at FROZEN_AT rather than empty screens. Every answer
 * is read by the phone's own readers, as the screens read it, and each Rust
 * Rounds week is held to the sample week it moves, so the sample has one
 * source.
 */
import { createHash } from "node:crypto"
import type { HomeAnswer } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { HeldWeek } from "@some-ui/rust-rounds"
import {
  currentWeek,
  exchangeRustRounds,
  exchangeWorkSpans,
  heldFromHome,
  keptRounds,
  keptWeeks,
  QUILLMOSS_WEEK,
  TALLOWBROOK_HELD,
} from "@some-ui/rust-rounds"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { readBoard } from "@/lib/renders/model"
import { failedLine } from "@/lib/renders/words"
import { FROZEN_AT } from "@/lib/snips"
import { readTakes } from "@/lib/take-library/model"
import { readAttention } from "@/lib/take-reconcile/model"

import { BASE_ROUTES, readRoutes, standInHome } from "./stand-in-home"

const SAMPLE = readRoutes("snips/sample-routes.json")
/** As `capture-apk.sh` lays them: the sample over the base routes. */
const ROUTES = { ...BASE_ROUTES, ...SAMPLE }
const home = standInHome(ROUTES)
const ask = (path: string): Promise<HomeAnswer> => home("GET", path)

const TODAY = FROZEN_AT.slice(0, 10)

describe("the snips' sample (#3476)", () => {
  it("gives Renders a board the phone reads: the Rust Rounds essay expected today, the call on Friday", async () => {
    const read = readBoard(await ask("/renders"))
    if (read.kind !== "read") throw new Error(`unread: ${read.kind}`)
    const { board } = read
    expect(board.now).toBeNull()
    expect(board.waiting).toEqual([])
    expect(board.done).toEqual([])
    expect(board.coming).toEqual([
      { feed: "rust-essay", on: TODAY },
      { feed: "call", on: "2026-11-06" },
    ])
    for (const row of board.failed)
      expect(row.at * 1000).toBeLessThan(Date.parse(FROZEN_AT))
    // Couldn't finish says why, in the owner's terms.
    expect(board.failed.map(failedLine)).toEqual([
      expect.stringMatching(/^Home couldn't make out 1 recording /),
    ])
  })

  it("lists on Needs your attention the take a held cards essay plays, and a Rust Rounds one", async () => {
    const read = readAttention(await ask("/voice-notes/attention"))
    if (read.kind !== "read") throw new Error(`unread: ${read.kind}`)
    expect(read.page.total).toBe(read.page.takes.length)
    expect(
      read.page.takes.map((take) => [take.of, take.ref, take.verdict.kind])
    ).toEqual([
      ["rust-round", "2026-w44:QM-312", "garbled"],
      ["studio", "take:sample-take-studio-1", "failed"],
    ])
    const board = readBoard(await ask("/renders"))
    if (board.kind !== "read") throw new Error(`unread: ${board.kind}`)
    expect(board.board.failed[0]?.items).toEqual(["sample-take-studio-1"])
  })

  it("lists on Takes week 44's takes, one heard, one home couldn't make out, one not heard yet, as Needs your attention has them", async () => {
    const read = readTakes(await ask("/voice-notes/takes?kind=all"))
    if (read.kind !== "read") throw new Error(`unread: ${read.kind}`)
    const takes = read.page.takes
    expect(takes.map((take) => [take.of, take.ref])).toEqual([
      ["rust-round", "2026-w44:QM-313"],
      ["rust-round", "2026-w44:QM-312"],
      ["rust-round", "2026-w44:QM-311"],
      ["studio", "take:sample-take-studio-1"],
    ])
    expect(takes.map((take) => take.heard === null)).toEqual([
      true,
      false,
      false,
      true,
    ])
    expect(read.page.total).toBe(takes.length)
    for (const take of takes)
      expect(Date.parse(take.storedAt)).toBeLessThan(Date.parse(FROZEN_AT))
    // The one home couldn't make out reads alike on both lists.
    const attention = readAttention(await ask("/voice-notes/attention"))
    if (attention.kind !== "read") throw new Error(attention.kind)
    expect(attention.page.takes).toHaveLength(2)
    for (const there of attention.page.takes) {
      const here = takes.find((take) => take.id === there.id)
      expect(here, there.id).toBeDefined()
      expect(here?.heard?.text ?? null).toBe(there.heard)
      expect(here?.hearAgain).toEqual(there.hearAgain)
      expect(there.hearAgain).toEqual({
        open: true,
        hearing: false,
        askAgainAt: null,
      })
    }
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

  it("lists each week by the hash of the file it serves", async () => {
    const listed = z
      .object({
        weeks: z.array(z.object({ id: z.string(), sha256: z.string() })),
      })
      .parse(JSON.parse((await ask("/rust-weeks")).body))
    for (const { id, sha256 } of listed.weeks) {
      const served = z
        .object({ sha256: z.string(), week: z.unknown() })
        .parse(JSON.parse((await ask(`/rust-weeks/${id}`)).body))
      expect(served.sha256).toBe(sha256)
      expect(
        createHash("sha256").update(JSON.stringify(served.week)).digest("hex")
      ).toBe(sha256)
    }
  })

  it("lets a fresh phone take both weeks and read the open one's work spans, Tallowbrook's open at FROZEN_AT", async () => {
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
    const open = currentWeek(held.weeks, Date.parse(FROZEN_AT))
    expect(open?.week.company.name).toBe("Tallowbrook")
    // The lane goes on to the open week's spans (`sendRustSpans`).
    const spans = await exchangeWorkSpans(home, [], () => "held", [
      open?.week.id ?? "",
    ])
    expect(spans.exchanged).toEqual({ kind: "synced" })
  })

  it("answers only reads, and lays over the base routes without changing the ones it doesn't name", () => {
    for (const key of Object.keys(SAMPLE))
      expect(key).toMatch(/^GET \/api\/v1\//)
    for (const [key, route] of Object.entries(BASE_ROUTES))
      if (!Object.hasOwn(SAMPLE, key)) expect(ROUTES[key]).toEqual(route)
  })
})
