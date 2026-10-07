/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest"

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

describe("boundedList", () => {
  it("keeps the newest first, replaces a match, and drops the oldest past the limit", () => {
    for (const n of [1, 2, 3, 2, 4]) list.put(n, is(n))

    expect(list.read()).toEqual([4, 2, 3])
    list.remove(is(2))
    expect(list.read()).toEqual([4, 3])
  })

  it("reads what it cannot trust as absent", () => {
    localStorage.setItem("test:list", "{not json")
    expect(list.read()).toEqual([])

    localStorage.setItem("test:list", JSON.stringify([1, "two", 3]))
    expect(list.read()).toEqual([1, 3])
  })
})
