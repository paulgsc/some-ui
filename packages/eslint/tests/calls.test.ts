/**
 * The calls record (ST37, #2637, #2976): pure functions over its files' text,
 * and the one loader that reads it from the tree or a commit, in either
 * layout. `scripts/check-calls.ts` reads the tree and the base branch's.
 */

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { callsAtCommit, callsInTree } from "@eslint/calls-record.js"
import {
  callFileText,
  CALLS_SCHEMA,
  ratchetCalls,
  readCallFiles,
  readCallsArray,
} from "@eslint/calls.js"
import type { Call } from "@eslint/calls.js"
import { afterEach, describe, expect, it } from "vitest"

const call: Call = {
  id: "C1",
  made: "2026-11-06",
  by: "claude",
  paths: ["apps/www/src/components/device-home-glyph.tsx"],
  chose: "An icon.",
  options: ["shorter words", "an icon"],
  gray: "The widest word wrapped.",
  undo: "Put the word back.",
  refs: ["#2637", "server#731", "testing#6"],
}

const file = (...calls: Array<unknown>): string =>
  JSON.stringify({ schema: CALLS_SCHEMA, calls })

const why = (entry: unknown): Array<string> => {
  const read = readCallsArray(file(entry))
  return read.findings.map((f) => ("why" in f ? f.why : f.kind))
}

describe("readCallsArray (the one-array file, before #2976)", () => {
  it("reads a well-formed record", () => {
    expect(
      readCallsArray(file(call, { ...call, id: "C2" })).calls
    ).toHaveLength(2)
  })

  it("refuses what is not the record", () => {
    expect(readCallsArray("{").findings[0]?.kind).toBe("unreadable")
    expect(readCallsArray('{"calls": []}').findings[0]?.kind).toBe("unreadable")
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
      "needs `refs`, each `#<n>`, `server#<n>` or `testing#<n>`",
    ])
    expect(why({ ...call, refs: ["other#6"] })).toEqual([
      "needs `refs`, each `#<n>`, `server#<n>` or `testing#<n>`",
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
    expect(readCallsArray(file(call, call)).findings).toEqual([
      { kind: "duplicateId", id: "C1" },
    ])
    expect(
      readCallsArray(file(call, { ...call, id: "C2", moves: "C9" })).findings
    ).toEqual([
      {
        kind: "badEntry",
        at: "C2",
        why: "moves C9, which is not listed before it",
      },
    ])
    expect(
      readCallsArray(file(call, { ...call, id: "C2", moves: "C1" })).findings
    ).toEqual([])
    expect(
      readCallsArray(file({ ...call, moves: "C1" })).findings.map((f) => f.kind)
    ).toEqual(["badEntry"])
  })
})

const named = (
  entry: Record<string, unknown> & { readonly id: string }
): { name: string; text: string } => ({
  name: `${entry.id}.json`,
  text: callFileText(entry),
})

describe("readCallFiles (one file per call)", () => {
  it("reads the files in id order, whatever order they come in", () => {
    const read = readCallFiles([
      named({ ...call, id: "C10" }),
      named({ ...call, id: "C9", moves: "C2" }),
      named({ ...call, id: "C2" }),
    ])
    expect(read.findings).toEqual([])
    expect(read.calls?.map((c) => c.id)).toEqual(["C2", "C9", "C10"])
  })

  it("keeps each entry as written, its fields in the file's order", () => {
    const { id, ...rest } = call
    const read = readCallFiles([
      { name: "C1.json", text: callFileText({ ...rest, id }) },
    ])
    expect(Object.keys(read.calls?.[0] ?? {})).toEqual([
      ...Object.keys(rest),
      "id",
    ])
  })

  it("refuses a file not named for the call it holds", () => {
    expect(
      readCallFiles([{ name: "C3.json", text: callFileText(call) }]).findings
    ).toEqual([{ kind: "misnamed", name: "C3.json", id: "C1" }])
  })

  it("refuses anything in the folder but `C<n>.json` files", () => {
    expect(
      readCallFiles([
        named(call),
        { name: "README.md", text: "x" },
        { name: "C2.json", text: null },
        { name: "c2.json", text: callFileText({ ...call, id: "C2" }) },
      ]).findings
    ).toEqual([
      { kind: "stray", name: "README.md" },
      { kind: "stray", name: "C2.json" },
      { kind: "stray", name: "c2.json" },
    ])
  })

  it("refuses a file that is not JSON, and an entry out of shape", () => {
    expect(
      readCallFiles([{ name: "C1.json", text: "{" }]).findings.map(
        (f) => f.kind
      )
    ).toEqual(["unreadableFile"])
    expect(readCallFiles([named({ ...call, by: "codex" })]).findings).toEqual([
      { kind: "badEntry", at: "C1", why: "needs `by`: claude or owner" },
    ])
  })

  it("refuses a move of a call with a higher id", () => {
    expect(
      readCallFiles([
        named({ ...call, moves: "C2" }),
        named({ ...call, id: "C2" }),
      ]).findings
    ).toEqual([
      {
        kind: "badEntry",
        at: "C1",
        why: "moves C2, which is not listed before it",
      },
    ])
  })
})

describe("the loader (calls-record)", () => {
  const repos: Array<string> = []
  afterEach(() => {
    for (const dir of repos.splice(0)) rmSync(dir, { recursive: true })
  })

  const git = (dir: string, ...args: Array<string>): string =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim()

  /** A repo whose first commit holds the one array, its second the folder. */
  function splitRepo(): { dir: string; array: string; folder: string } {
    const dir = mkdtempSync(join(tmpdir(), "calls-"))
    repos.push(dir)
    git(dir, "init", "-q")
    git(dir, "config", "user.email", "t@example.invalid")
    git(dir, "config", "user.name", "t")
    mkdirSync(join(dir, "docs"))
    writeFileSync(join(dir, "README"), "x")
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "empty")
    const two = { ...call, id: "C2" }
    writeFileSync(join(dir, "docs/calls.json"), file(two, call))
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "array")
    const array = git(dir, "rev-parse", "HEAD")
    git(dir, "rm", "-q", "docs/calls.json")
    mkdirSync(join(dir, "docs/calls"), { recursive: true })
    for (const c of [call, two, { ...call, id: "C3", agreed: "2026-11-08" }])
      writeFileSync(join(dir, `docs/calls/${c.id}.json`), callFileText(c))
    git(dir, "add", ".")
    git(dir, "commit", "-qm", "folder")
    return { dir, array, folder: git(dir, "rev-parse", "HEAD") }
  }

  it("reads the repo's own record, the folder", () => {
    const own = callsInTree(join(import.meta.dirname, "../../.."))
    expect(own.layout).toBe("folder")
    expect(own.layout !== "none" && own.findings).toEqual([])
  })

  it("reads a commit before the split as the array, in its order, and one after as the folder", () => {
    const { dir, array, folder } = splitRepo()
    const before = callsAtCommit(dir, array)
    expect(before.layout).toBe("array")
    expect(before.layout !== "none" && before.calls?.map((c) => c.id)).toEqual([
      "C2",
      "C1",
    ])
    const after = callsAtCommit(dir, folder)
    expect(after.layout).toBe("folder")
    expect(after.layout !== "none" && after.calls?.map((c) => c.id)).toEqual([
      "C1",
      "C2",
      "C3",
    ])
    expect(callsAtCommit(dir, `${array}~1`)).toEqual({ layout: "none" })
    const tree = callsInTree(dir)
    expect(tree.layout !== "none" && tree.calls?.length).toBe(3)
  })

  it("holds the folder against a base from before the split", () => {
    const { dir, array, folder } = splitRepo()
    const base = callsAtCommit(dir, array)
    const head = callsAtCommit(dir, folder)
    if (base.layout === "none" || head.layout === "none") throw new Error()
    expect(ratchetCalls(base.calls ?? [], head.calls ?? [])).toEqual([])
  })

  it("refuses the one-array file back beside the folder", () => {
    const { dir } = splitRepo()
    writeFileSync(join(dir, "docs/calls.json"), file(call))
    const tree = callsInTree(dir)
    expect(tree.layout !== "none" && tree.findings).toEqual([
      { kind: "legacyBeside" },
    ])
  })

  it("throws for a commit that does not resolve", () => {
    const { dir } = splitRepo()
    expect(() => callsAtCommit(dir, "no-such-ref")).toThrow()
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

  it("lets the owner's own call gain its options and why it was gray, and nothing else", () => {
    const { options: _options, gray: _gray, ...bare } = call
    const owners = { ...bare, by: "owner" as const }
    expect(ratchetCalls([owners], [{ ...owners, gray: "Wording." }])).toEqual(
      []
    )
    expect(
      ratchetCalls([owners], [{ ...owners, agreed: "2026-11-08" }])
    ).toEqual([{ kind: "rewritten", id: "C1", field: "agreed" }])
    expect(ratchetCalls([bare], [{ ...bare, gray: "Wording." }])).toEqual([
      { kind: "rewritten", id: "C1", field: "gray" },
    ])
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
