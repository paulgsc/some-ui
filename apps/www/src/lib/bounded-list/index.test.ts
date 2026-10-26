/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { boundedList } from "@/lib/bounded-list"

const isNumber = (value: unknown): value is number => typeof value === "number"
const list = boundedList("test:list", 3, isNumber)
const is =
  (n: number) =>
  (other: number): boolean =>
    other === n

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("boundedList", () => {
  it("keeps the newest first, replaces a match, and drops the oldest past the limit", () => {
    for (const n of [1, 2, 3, 2, 4]) list.put(n, is(n))

    expect(list.read()).toEqual([4, 2, 3])
    list.remove(is(2))
    expect(list.read()).toEqual([4, 3])
  })

  it("says whether the device stored each write", () => {
    expect(list.put(1, is(1))).toBe(true)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(list.put(2, is(2))).toBe(false)
    expect(list.remove(is(1))).toBe(false)
    expect(list.read()).toEqual([1])
  })

  it("moves what it cannot read aside before the next write, and keeps what it can", () => {
    localStorage.setItem("test:list", "{not json")
    expect(list.read()).toEqual([])
    expect(list.put(5, is(5))).toBe(true)
    expect(localStorage.getItem("test:list:unreadable:1")).toBe("{not json")

    localStorage.setItem("test:list", JSON.stringify([1, "two", 3]))
    expect(list.read()).toEqual([1, 3])
    expect(localStorage.getItem("test:list:unreadable:2")).toBe('[1,"two",3]')
  })
})
