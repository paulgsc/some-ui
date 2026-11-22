/**
 * The picker's "From home" list (#1916): home's files by thread, the
 * current thread first; a thread kept on the phone at a tap, each file
 * fetched once and kept under the store's rules; and what it says, in the
 * person's terms.
 */
import type {
  HomeFileAnswer,
  HomeListing,
  HomeSessionFiles,
} from "@leetype/lib/leetype/home-files"
import {
  HOME_FILES_WORDS,
  HomeFilesRuntime,
  threadsOf,
} from "@leetype/lib/leetype/home-files"
import { listedOf } from "@leetype/lib/leetype/home-files/model"
import type {
  HeldSessionFile,
  KeepOutcome,
  SessionFileStore,
} from "@leetype/lib/leetype/session-file-pick"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { describe, expect, it } from "vitest"

const VALID = JSON.stringify(AB_FIXTURES[1]?.raw)

const escape = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

const listed = (name: string): Record<string, string> => ({
  name,
  title: `Title of ${name}`,
  oneLine: "One line.",
  sha256: "abc",
  keptAt: "2026-11-01T00:00:00Z",
})

const heldFile = (name: string, pickedAt: string): HeldSessionFile => ({
  name,
  title: name,
  oneLine: "One line.",
  pickedAt,
})

function memoryStore(
  over: Partial<{ keep: () => Promise<KeepOutcome> }> = {}
): SessionFileStore & { kept: Array<string> } {
  const kept: Array<string> = []
  return {
    kept,
    list: () => Promise.resolve([]),
    keep: (file): Promise<KeepOutcome> => {
      kept.push(file.name)
      return over.keep?.() ?? Promise.resolve("kept")
    },
    read: () => Promise.resolve(null),
  }
}

function homeOf(
  files: unknown,
  answer: (name: string) => HomeFileAnswer = () => ({
    kind: "file",
    body: VALID,
  })
): HomeSessionFiles & { fetched: Array<string>; looks: number } {
  const fetched: Array<string> = []
  const home: HomeSessionFiles & { fetched: Array<string>; looks: number } = {
    key: "pairing-1",
    fetched,
    looks: 0,
    list: (): Promise<HomeListing> => {
      home.looks += 1
      return Promise.resolve({ files, ended: null })
    },
    fetch: (name: string): Promise<HomeFileAnswer> => {
      fetched.push(name)
      return Promise.resolve(answer(name))
    },
  }
  return home
}

describe("home's list", () => {
  it("keeps only the entries that are listed files", () => {
    expect(
      listedOf({ files: [listed("t1-01-a.json"), { name: 3 }, "x"] })
    ).toEqual([
      {
        name: "t1-01-a.json",
        title: "Title of t1-01-a.json",
        oneLine: "One line.",
      },
    ])
    expect(listedOf({ nope: [] })).toEqual([])
    expect(listedOf(null)).toEqual([])
  })

  it("groups by thread, the current thread first, then the newest, then the rest", () => {
    const files = listedOf({
      files: [
        listed("t3-01-c.json"),
        listed("t1-02-b.json"),
        listed("t1-01-a.json"),
        listed("t2-01-x.json"),
        listed("loose.json"),
      ],
    })
    const threads = threadsOf(files, [
      heldFile("t3-01-c", "2026-11-01T00:00:00Z"),
      heldFile("t1-01-a", "2026-11-02T00:00:00Z"),
    ])
    expect(threads.map((group) => group.thread)).toEqual([1, 3, 2, null])
    expect(threads[0]).toMatchObject({ current: true, missing: 1 })
    expect(threads[0]?.files.map((file) => [file.name, file.onPhone])).toEqual([
      ["t1-01-a.json", true],
      ["t1-02-b.json", false],
    ])
    expect(threads[1]).toMatchObject({ current: false, missing: 0 })
  })

  it("puts no thread first when the phone holds nothing", () => {
    const threads = threadsOf(
      listedOf({ files: [listed("t1-01-a.json"), listed("t2-01-b.json")] }),
      []
    )
    expect(threads.map((group) => [group.thread, group.current])).toEqual([
      [2, false],
      [1, false],
    ])
  })
})

describe("keeping a thread from home", () => {
  it("fetches each file once, keeps it under its name without .json, and reads both lists again", async () => {
    const home = homeOf({ files: [listed("t1-01-a.json")] })
    const store = memoryStore()
    let kept = 0
    const runtime = new HomeFilesRuntime(home, store, () => {
      kept += 1
    })
    runtime.start()
    await settle()
    expect(runtime.getSnapshot().look).toMatchObject({ kind: "listed" })
    runtime.keepThread(1, ["t1-01-a.json", "t1-02-b.json"])
    expect(runtime.getSnapshot().keep).toMatchObject({
      kind: "keeping",
      done: 0,
      of: 2,
    })
    await settle()
    expect(home.fetched).toEqual(["t1-01-a.json", "t1-02-b.json"])
    expect(store.kept).toEqual(["t1-01-a", "t1-02-b"])
    expect(kept).toBe(1)
    expect(home.looks).toBe(2)
    const said = runtime.getSnapshot().keep
    expect(said.kind === "said" && said.words).toContain(
      HOME_FILES_WORDS.kept(2)
    )
    expect(said.kind === "said" && said.words).not.toContain("wasn't kept")
  })

  it("says what was left and why, and keeps what came", async () => {
    const home = homeOf({ files: [] }, (name) =>
      name.startsWith("t1-01")
        ? { kind: "gone" }
        : { kind: "file", body: VALID }
    )
    const store = memoryStore()
    const runtime = new HomeFilesRuntime(home, store, () => undefined)
    runtime.keepThread(1, ["t1-01-a.json", "t1-02-b.json"])
    await settle()
    expect(store.kept).toEqual(["t1-02-b"])
    const said = runtime.getSnapshot().keep
    expect(said.kind === "said" && said.words).toMatch(
      new RegExp(
        `^${escape(HOME_FILES_WORDS.kept(1))}.*${escape(
          HOME_FILES_WORDS.someLeft(1, HOME_FILES_WORDS.gone)
        )}$`
      )
    )
  })

  it("stops at the first file home can't be reached for, and counts the rest as left", async () => {
    const home = homeOf({ files: [] }, () => ({ kind: "unreachable" }))
    const store = memoryStore()
    const runtime = new HomeFilesRuntime(home, store, () => undefined)
    runtime.keepThread(1, ["a.json", "b.json", "c.json"])
    await settle()
    expect(home.fetched).toEqual(["a.json"])
    expect(store.kept).toEqual([])
    expect(runtime.getSnapshot().keep).toEqual({
      kind: "said",
      words: HOME_FILES_WORDS.someLeft(3, HOME_FILES_WORDS.why.unreachable),
    })
  })

  it("refuses a file that isn't a session file, and one whose name holds other bytes", async () => {
    const notJson = homeOf({ files: [] }, () => ({
      kind: "file",
      body: "not json",
    }))
    const store = memoryStore()
    const runtime = new HomeFilesRuntime(notJson, store, () => undefined)
    runtime.keepThread(1, ["t1-01-a.json"])
    await settle()
    expect(store.kept).toEqual([])
    expect(runtime.getSnapshot().keep).toMatchObject({ kind: "said" })

    const taken = new HomeFilesRuntime(
      homeOf({ files: [] }),
      memoryStore({ keep: () => Promise.resolve("name-taken") }),
      () => undefined
    )
    taken.keepThread(1, ["t1-01-a.json"])
    await settle()
    expect(taken.getSnapshot().keep).toEqual({
      kind: "said",
      words: HOME_FILES_WORDS.someLeft(
        1,
        HOME_FILES_WORDS.nameTaken("t1-01-a")
      ),
    })
  })

  it("keeps one keep at a time, and shows nothing once the person left", async () => {
    const home = homeOf({ files: [] })
    const store = memoryStore()
    const runtime = new HomeFilesRuntime(home, store, () => undefined)
    runtime.keepThread(1, ["t1-01-a.json"])
    runtime.keepThread(2, ["t2-01-a.json"])
    runtime.cancel()
    await settle()
    expect(home.fetched).toEqual(["t1-01-a.json"])
    expect(runtime.getSnapshot().keep).toMatchObject({ kind: "keeping" })
  })

  it("keeps what was shown when a look brings nothing new", async () => {
    let ended: "busy" | null = null
    const home: HomeSessionFiles = {
      key: "k",
      list: () =>
        Promise.resolve({
          files:
            ended === null
              ? { files: [listed("t1-01-a.json")] }
              : { files: [] },
          ended,
        }),
      fetch: () => Promise.resolve({ kind: "gone" }),
    }
    const runtime = new HomeFilesRuntime(home, memoryStore(), () => undefined)
    runtime.start()
    await settle()
    ended = "busy"
    runtime.start()
    await settle()
    expect(runtime.getSnapshot().look).toMatchObject({
      kind: "listed",
      ended: "busy",
      files: [{ name: "t1-01-a.json" }],
    })
  })
})

describe("its words", () => {
  /** Machinery that never reaches the screen (CLAUDE.md, "State in the person's terms"). */
  const MACHINERY =
    /\b(request|status|http|404|401|429|etag|sync|grant|fetch|endpoint|api|mailbox|server)\b/i

  const all = (value: unknown): Array<string> => {
    if (typeof value === "string") return [value]
    if (typeof value === "function") {
      // Every phrase in the table takes at most a count and a total, or a
      // name; 2 and 3 fill them.
      return [String(Reflect.apply(value, undefined, [2, 3]))]
    }
    if (typeof value === "object" && value !== null) {
      return Object.values(value).flatMap(all)
    }
    return []
  }

  it("say what is kept where, never the machinery behind it", () => {
    for (const line of all(HOME_FILES_WORDS)) {
      expect(line).not.toMatch(MACHINERY)
    }
  })
})
