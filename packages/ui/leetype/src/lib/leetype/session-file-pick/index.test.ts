import type {
  HeldSessionFile,
  KeepOutcome,
  PickedSessionFile,
  SessionFileStore,
} from "@leetype/lib/leetype/session-file-pick"
import {
  intakeSessionFile,
  SessionFilePickRuntime,
} from "@leetype/lib/leetype/session-file-pick"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { SessionFileSchema } from "@leetype/types/session-file"
import { PICKED_FILE_MAX_BYTES } from "@some-ui/intent-kit"
import { describe, expect, it } from "vitest"

const VALID = JSON.stringify(AB_FIXTURES[1]?.raw)
const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)
const AT = new Date("2026-10-18T21:00:00.000Z")

/** Lets every pending promise settle. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

function picked(name: string, text: string): PickedSessionFile {
  return { name, size: text.length, text: () => Promise.resolve(text) }
}

/** A store over a map, which answers `keep` as the device store does. */
function memoryStore(): SessionFileStore & {
  bodies: Map<string, string>
} {
  const bodies = new Map<string, string>()
  const held = new Map<string, HeldSessionFile>()
  return {
    bodies,
    list: () => Promise.resolve([...held.values()]),
    keep: (file, at): Promise<KeepOutcome> => {
      const stored = bodies.get(file.name)
      if (stored !== undefined) {
        return Promise.resolve(
          stored === file.body ? "already-held" : "name-taken"
        )
      }
      bodies.set(file.name, file.body)
      held.set(file.name, {
        name: file.name,
        title: file.title,
        oneLine: file.oneLine,
        pickedAt: at.toISOString(),
      })
      return Promise.resolve("kept")
    },
    read: (name) => Promise.resolve(bodies.get(name) ?? null),
  }
}

describe("intakeSessionFile", () => {
  it("takes a session file's name without .json and lints it", () => {
    const intake = intakeSessionFile("t1-01-power-cut.json", VALID)
    expect(intake).toMatchObject({ ok: true, name: "t1-01-power-cut" })
  })

  it("refuses what isn't JSON", () => {
    expect(intakeSessionFile("notes.json", "not json")).toEqual({
      ok: false,
      reason: "notes isn't a session file: it isn't JSON.",
    })
  })

  it("refuses a file the schema rejects, with the schema's message", () => {
    const { start: _start, ...rest } = FILE
    const intake = intakeSessionFile("t1.json", JSON.stringify(rest))
    expect(intake.ok).toBe(false)
    expect(!intake.ok && intake.reason).toMatch(
      /^t1 isn't a session file\. start: /
    )
  })
})

describe("SessionFilePickRuntime", () => {
  it("keeps a valid file in the store and lists it", async () => {
    const store = memoryStore()
    const runtime = new SessionFilePickRuntime(store, () => AT)
    runtime.start()
    await settle()
    expect(runtime.getSnapshot().held).toEqual({ kind: "ready", files: [] })

    runtime.pick(picked("t1-01-power-cut.json", VALID))
    expect(runtime.getSnapshot().pick).toEqual({ kind: "reading" })
    await settle()

    const title = FILE.title
    expect(runtime.getSnapshot().pick).toMatchObject({
      kind: "kept",
      name: "t1-01-power-cut",
      title,
      already: false,
    })
    expect(store.bodies.get("t1-01-power-cut")).toBe(VALID)
    expect(runtime.getSnapshot().held).toMatchObject({
      kind: "ready",
      files: [
        {
          name: "t1-01-power-cut",
          title,
          pickedAt: AT.toISOString(),
        },
      ],
    })
  })

  it("changes nothing for the same file again, and refuses other bytes under its name", async () => {
    const store = memoryStore()
    const runtime = new SessionFilePickRuntime(store, () => AT)
    runtime.pick(picked("t1.json", VALID))
    await settle()
    runtime.pick(picked("t1.json", VALID))
    await settle()
    expect(runtime.getSnapshot().pick).toMatchObject({
      kind: "kept",
      already: true,
    })

    const other = JSON.stringify({ ...JSON.parse(VALID), title: "Changed" })
    runtime.pick(picked("t1.json", other))
    await settle()
    expect(runtime.getSnapshot().pick).toEqual({
      kind: "refused",
      reason:
        "This phone already holds a different file named t1. A fix goes up under a new name, such as t1-r2.",
    })

    runtime.pick(picked("t1-r2.json", VALID))
    await settle()
    runtime.pick(picked("t1-r2.json", other))
    await settle()
    expect(runtime.getSnapshot().pick).toMatchObject({
      reason: expect.stringContaining("such as t1-r3."),
    })
  })

  it("refuses a file too large to read", () => {
    const runtime = new SessionFilePickRuntime(memoryStore())
    runtime.pick({
      name: "big.json",
      size: PICKED_FILE_MAX_BYTES + 1,
      text: () => Promise.resolve(VALID),
    })
    expect(runtime.getSnapshot().pick).toEqual({
      kind: "refused",
      reason: "That file is too large to open.",
    })
  })

  it("says so when the store fails, and when the phone is full", async () => {
    const store = memoryStore()
    const runtime = new SessionFilePickRuntime(
      {
        ...store,
        keep: (): Promise<KeepOutcome> => Promise.reject(new Error("disk")),
      },
      () => AT
    )
    runtime.pick(picked("t1.json", VALID))
    await settle()
    expect(runtime.getSnapshot().pick).toEqual({
      kind: "refused",
      reason: "Couldn't keep that file on this phone. Try again.",
    })

    const full = new SessionFilePickRuntime(
      { ...store, keep: (): Promise<KeepOutcome> => Promise.resolve("full") },
      () => AT
    )
    full.pick(picked("t1.json", VALID))
    await settle()
    expect(full.getSnapshot().pick).toEqual({
      kind: "refused",
      reason:
        "This phone is full. Settings shows what it holds; free some space, then pick the file again.",
    })
  })

  it("shows a late keep of an earlier pick nowhere, yet lists what it kept", async () => {
    const store = memoryStore()
    let release: (outcome: KeepOutcome) => void = () => undefined
    const slow: SessionFileStore = {
      ...store,
      keep: (file, at) =>
        new Promise((resolve) => {
          release = (outcome): void => {
            void store.keep(file, at).then(() => resolve(outcome))
          }
        }),
    }
    const runtime = new SessionFilePickRuntime(slow, () => AT)
    runtime.pick(picked("first.json", VALID))
    await settle()
    expect(runtime.getSnapshot().pick).toEqual({
      kind: "keeping",
      name: "first",
    })
    runtime.pick(picked("second.json", "not json"))
    await settle()
    release("kept")
    await settle()
    expect(runtime.getSnapshot().pick).toEqual({
      kind: "refused",
      reason: "second isn't a session file: it isn't JSON.",
    })
    expect(runtime.getSnapshot().held).toMatchObject({
      kind: "ready",
      files: [{ name: "first" }],
    })

    runtime.pick(picked("third.json", VALID))
    await settle()
    const held = runtime.getSnapshot().held
    runtime.cancel()
    release("kept")
    await settle()
    expect(runtime.getSnapshot()).toEqual({
      held,
      pick: { kind: "keeping", name: "third" },
    })
  })

  it("lists a keep after a remount's start, cancel and start", async () => {
    const runtime = new SessionFilePickRuntime(memoryStore(), () => AT)
    runtime.start()
    runtime.cancel()
    runtime.start()
    runtime.pick(picked("t1.json", VALID))
    await settle()
    expect(runtime.getSnapshot().held).toMatchObject({
      kind: "ready",
      files: [{ name: "t1" }],
    })
  })
})
