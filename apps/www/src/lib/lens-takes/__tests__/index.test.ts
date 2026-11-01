/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { lensTakesForExport, sweepLensTakes } from "@/lib/lens-takes"

const removeAudio = vi.hoisted(() => vi.fn(() => Promise.resolve()))
/** The ids on the shelf, and one whose read fails. */
const shelved = vi.hoisted(() => new Set<string>())
const unreadable = vi.hoisted(() => new Set<string>())

vi.mock("@some-ui/voice-capture", async (actual) => {
  const shelf = {
    put: vi.fn(() => Promise.resolve()),
    remove: removeAudio,
    ids: (): Promise<Array<string>> => Promise.resolve([...shelved]),
    get: (id: string): Promise<Blob | null> =>
      unreadable.has(id)
        ? Promise.reject(new Error("idb"))
        : Promise.resolve(shelved.has(id) ? new Blob(["opus"]) : null),
  }
  return {
    ...(await actual<object>()),
    savingShelf: (): object => ({
      shelf: () => shelf,
      saving: vi.fn(),
      isSaving: () => false,
    }),
  }
})

const KEY = "some-ui:lens-takes"

function listed(...ids: Array<string>): void {
  localStorage.setItem(
    KEY,
    JSON.stringify(
      ids.map((entry) => {
        const at = entry.indexOf(":")
        const id = at < 0 ? entry : entry.slice(0, at)
        const standing = at < 0 ? undefined : entry.slice(at + 1)
        return {
          id,
          line: "school-bus",
          takenAt: 1_760_000_000_000,
          durationMs: 3_000,
          mimeType: "audio/webm",
          ...(standing === undefined ? {} : { standing }),
        }
      })
    )
  )
}

const ids = (): Array<string> => {
  const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]")
  return Array.isArray(parsed)
    ? parsed.map((take: unknown) => String(Reflect.get(Object(take), "id")))
    : []
}

beforeEach(() => {
  localStorage.clear()
  removeAudio.mockClear()
  shelved.clear()
  unreadable.clear()
})

describe("lensTakesForExport", () => {
  it("marks a take whose audio could not be read, apart from one whose audio is gone", async () => {
    shelved.add("a").add("c")
    unreadable.add("c")
    listed("a", "b", "c")
    const out = await lensTakesForExport()
    expect(
      out.map(({ take, audio, read }) => [take.id, audio !== null, read])
    ).toEqual([
      ["a", true, true],
      ["b", false, true],
      ["c", false, false],
    ])
  })
})

describe("lensTakesForExport, out of view", () => {
  it("leaves out a take recorded again or set aside, which stays on the phone (D2, D3)", async () => {
    shelved.add("a").add("b").add("c")
    listed("a", "b:earlier", "c:set-aside")
    const out = await lensTakesForExport()
    expect(out.map(({ take }) => take.id)).toEqual(["a"])
    expect(ids()).toEqual(["a", "b", "c"])
  })
})

describe("sweepLensTakes", () => {
  it("removes audio no take names, and lets go of a take with no audio", async () => {
    shelved.add("kept").add("stray")
    listed("kept", "silent")
    sweepLensTakes()
    await vi.waitFor(() => {
      expect(removeAudio).toHaveBeenCalledWith(["stray"])
    })
    expect(ids()).toEqual(["kept"])
  })
})
