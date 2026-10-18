import type { KeyedStorage } from "@core-utils/lib/storage"
import { openRecord, writeRecord } from "@core-utils/lib/storage"
import { memoryStorage as storage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

const KEY = "record"
const PREFIX = "record:unreadable:"

/** Reads `{"n": <number>}`, and nothing else. */
function parse(raw: string): number | null {
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === "object" &&
      value !== null &&
      "n" in value &&
      typeof value.n === "number"
      ? value.n
      : null
  } catch {
    return null
  }
}

describe("openRecord", () => {
  it("reads a kept record, or finds none", () => {
    expect(openRecord(storage([[KEY, '{"n":3}']]), KEY, parse, PREFIX)).toEqual(
      { kind: "kept", value: 3 }
    )
    expect(openRecord(storage(), KEY, parse, PREFIX)).toEqual({
      kind: "empty",
    })
  })

  it("moves an unreadable record aside, each beside the last", () => {
    const s = storage([[KEY, "{torn"]])
    expect(openRecord(s, KEY, parse, PREFIX)).toEqual({ kind: "moved" })
    s.map.set(KEY, '{"v":99}')
    openRecord(s, KEY, parse, PREFIX)
    expect(s.map.get(`${PREFIX}1`)).toBe("{torn")
    expect(s.map.get(`${PREFIX}2`)).toBe('{"v":99}')
  })

  it("says the storage is unreadable when it throws", () => {
    const s: KeyedStorage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    }
    expect(openRecord(s, KEY, parse, PREFIX)).toEqual({ kind: "unreadable" })
  })
})

describe("writeRecord", () => {
  it("writes only what it could read back", () => {
    const s = storage()
    expect(writeRecord(s, KEY, '{"n":1}', parse)).toBe(true)
    expect(writeRecord(s, KEY, "{torn", parse)).toBe(false)
    expect(s.map.get(KEY)).toBe('{"n":1}')
  })

  it("is false when the storage refuses the write", () => {
    const s = storage()
    s.full = true
    expect(writeRecord(s, KEY, '{"n":1}', parse)).toBe(false)
  })
})
