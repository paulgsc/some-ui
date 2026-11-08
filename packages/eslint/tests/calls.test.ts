/**
 * The calls record (ST37, #2637), as pure functions over `docs/calls.json`'s
 * text. `scripts/check-calls.ts` reads the file and the base branch's.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CALLS_SCHEMA, ratchetCalls, readCalls } from "@eslint/calls.js"
import type { Call } from "@eslint/calls.js"
import { describe, expect, it } from "vitest"

const call: Call = {
  id: "C1",
  made: "2026-11-06",
  by: "claude",
  paths: ["apps/www/src/components/device-home-glyph.tsx"],
  chose: "An icon.",
  options: ["shorter words", "an icon"],
  gray: "The widest word wrapped.",
  undo: "Put the word back.",
  refs: ["#2637", "server#731"],
}

const file = (...calls: Array<unknown>): string =>
  JSON.stringify({ schema: CALLS_SCHEMA, calls })

const why = (entry: unknown): Array<string> => {
  const read = readCalls(file(entry))
  return read.findings.map((f) => ("why" in f ? f.why : f.kind))
}

describe("readCalls", () => {
  it("reads a well-formed record", () => {
    expect(readCalls(file(call, { ...call, id: "C2" })).calls).toHaveLength(2)
  })

  it("reads the repo's own record", () => {
    const text = readFileSync(
      join(import.meta.dirname, "../../../docs/calls.json"),
      "utf8"
    )
    expect(readCalls(text).findings).toEqual([])
  })

  it("refuses what is not the record", () => {
    expect(readCalls("{").findings[0]?.kind).toBe("unreadable")
    expect(readCalls('{"calls": []}').findings[0]?.kind).toBe("unreadable")
  })

  it("names what an entry lacks", () => {
    expect(why({ ...call, id: "c1" })).toEqual(["needs an id such as C12"])
    expect(why({ ...call, made: "2026-02-30" })).toEqual([
      "needs `made`, a day (YYYY-MM-DD)",
    ])
    expect(why({ ...call, by: "codex" })).toEqual([
      "needs `by`: claude or owner",
    ])
    expect(why({ ...call, options: ["only one"] })).toEqual([
      "needs `options`, at least two",
    ])
    expect(why({ ...call, gray: " " })).toEqual(["needs `gray`, in words"])
    expect(why({ ...call, refs: ["2637"] })).toEqual([
      "needs `refs`, each `#<n>` or `server#<n>`",
    ])
    expect(why({ ...call, paths: [] })).toEqual(["needs `paths`, at least one"])
    expect(why({ ...call, said: "x" })).toEqual([
      "has a field no call has: said",
    ])
  })

  it("lets only a Claude call be agreed to, and not before it was made", () => {
    expect(why({ ...call, agreed: "2026-11-07" })).toEqual([])
    expect(why({ ...call, by: "owner", agreed: "2026-11-07" })).toEqual([
      "has `agreed`, which only a Claude call can have",
    ])
    expect(why({ ...call, agreed: "2026-11-05" })).toEqual([
      "was agreed before it was made",
    ])
  })

  it("lets only the owner's own call leave out the options and why it was gray", () => {
    const { options: _options, gray: _gray, ...bare } = call
    expect(why({ ...bare, by: "owner" })).toEqual([])
    expect(why(bare)).toEqual(["needs `gray`, in words"])
    expect(why({ ...bare, gray: "Wording." })).toEqual([
      "needs `options`, at least two",
    ])
  })

  it("refuses an id used twice, and a move of a call not in the record", () => {
    expect(readCalls(file(call, call)).findings).toEqual([
      { kind: "duplicateId", id: "C1" },
    ])
    expect(
      readCalls(file(call, { ...call, id: "C2", moves: "C9" })).findings
    ).toEqual([
      {
        kind: "badEntry",
        at: "C2",
        why: "moves C9, which is not listed before it",
      },
    ])
    expect(
      readCalls(file(call, { ...call, id: "C2", moves: "C1" })).findings
    ).toEqual([])
    expect(
      readCalls(file({ ...call, moves: "C1" })).findings.map((f) => f.kind)
    ).toEqual(["badEntry"])
  })
})

describe("ratchetCalls", () => {
  it("lets the record grow", () => {
    expect(ratchetCalls([call], [call, { ...call, id: "C2" }])).toEqual([])
  })

  it("lets a Claude call gain the day the owner agreed", () => {
    expect(ratchetCalls([call], [{ ...call, agreed: "2026-11-08" }])).toEqual(
      []
    )
  })

  it("refuses a call dropped", () => {
    expect(ratchetCalls([call], [])).toEqual([{ kind: "dropped", id: "C1" }])
  })

  it("refuses any field rewritten, an agreement taken back included", () => {
    expect(ratchetCalls([call], [{ ...call, chose: "Words." }])).toEqual([
      { kind: "rewritten", id: "C1", field: "chose" },
    ])
    expect(ratchetCalls([call], [{ ...call, by: "owner" }])).toEqual([
      { kind: "rewritten", id: "C1", field: "by" },
    ])
    const agreed = { ...call, agreed: "2026-11-07" }
    expect(ratchetCalls([agreed], [call])).toEqual([
      { kind: "rewritten", id: "C1", field: "agreed" },
    ])
    expect(ratchetCalls([agreed], [{ ...call, agreed: "2026-11-08" }])).toEqual(
      [{ kind: "rewritten", id: "C1", field: "agreed" }]
    )
  })
})
