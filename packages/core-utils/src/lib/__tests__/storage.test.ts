import { readAs } from "@core-utils/lib/home-exchange"
import type { KeyedStorage } from "@core-utils/lib/storage"
import {
  openKept,
  openRecord,
  readJson,
  salvageEntries,
  salvageList,
  writeKept,
  writeRecord,
} from "@core-utils/lib/storage"
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

  it("keeps one copy of a value it finds again on a later launch", () => {
    const s = storage([[KEY, "{torn"]])
    openRecord(s, KEY, parse, PREFIX)
    expect(openRecord(s, KEY, parse, PREFIX)).toEqual({ kind: "moved" })
    expect(s.map.get(`${PREFIX}1`)).toBe("{torn")
    expect(s.map.has(`${PREFIX}2`)).toBe(false)
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

const isNumber = (value: unknown): value is number => typeof value === "number"
const numbers = salvageList(isNumber)

describe("openKept", () => {
  it("keeps the entries it can read, once the whole value is copied aside", () => {
    const s = storage([[KEY, '[1,"two",3]']])
    expect(openKept(s, KEY, numbers, [])).toEqual({
      value: [1, 3],
      writable: true,
    })
    expect(s.map.get(`${KEY}:unreadable:1`)).toBe('[1,"two",3]')
  })

  it("moves aside a value that is not the record's kind at all", () => {
    const s = storage([[KEY, '{"n":1}']])
    expect(openKept(s, KEY, numbers, [])).toEqual({ value: [], writable: true })
    expect(s.map.get(`${KEY}:unreadable:1`)).toBe('{"n":1}')
  })

  it("shows what it could read but writes nothing when it cannot copy it aside", () => {
    const s = storage([[KEY, '[1,"two"]']])
    s.full = true
    expect(openKept(s, KEY, numbers, [])).toEqual({
      value: [1],
      writable: false,
    })
  })

  it("is never writable without storage", () => {
    expect(openKept(null, KEY, numbers, [7])).toEqual({
      value: [7],
      writable: false,
    })
  })
})

describe("writeKept", () => {
  it("writes only what reads back whole, and says when it is refused", () => {
    const s = storage()
    expect(writeKept(s, KEY, [1, 2], numbers)).toBe(true)
    expect(writeKept(s, KEY, [1, "two"], numbers)).toBe(false)
    expect(s.map.get(KEY)).toBe("[1,2]")
    s.full = true
    expect(writeKept(s, KEY, [3], numbers)).toBe(false)
    expect(writeKept(null, KEY, [3], numbers)).toBe(false)
    expect(s.map.get(KEY)).toBe("[1,2]")
  })
})

describe("salvageEntries", () => {
  it("reads a map entry by entry, and nothing else", () => {
    const read = salvageEntries((value) => (isNumber(value) ? value : null))
    expect(read('{"a":1,"b":"x"}')).toEqual({ value: { a: 1 }, whole: false })
    expect(read('{"a":1}')).toEqual({ value: { a: 1 }, whole: true })
    expect(read("[1]")).toBeNull()
    expect(read("{torn")).toBeNull()
  })
})

describe("readJson", () => {
  it("passes parsed JSON to the parser and reads its result whole", () => {
    const read = readJson((value) => {
      expect(value).toEqual({ n: 3 })
      return 3
    })
    expect(read('{"n":3}')).toEqual({ value: 3, whole: true })
  })

  it("returns null when the parser rejects the value", () => {
    expect(readJson(() => null)("false")).toBeNull()
  })

  it("passes undefined to the parser for text that is not JSON", () => {
    const read = readJson((value) => {
      expect(value).toBeUndefined()
      return 7
    })
    expect(read("not json")).toEqual({ value: 7, whole: true })
  })
})

describe("readAs", () => {
  it("rejects invalid JSON even when the schema accepts undefined", () => {
    const schema = {
      safeParse: (value: unknown): { success: true; data: unknown } => ({
        success: true,
        data: value,
      }),
    }
    expect(readAs(schema, "not json")).toBeNull()
  })
})
