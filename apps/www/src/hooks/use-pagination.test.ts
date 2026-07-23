import { describe, expect, it } from "vitest"

import { paginate } from "./use-pagination"

describe("paginate", () => {
  it("returns every item on one page when it all fits", () => {
    const result = paginate([1, 2, 3], 1, 10)
    expect(result).toEqual({
      pageItems: [1, 2, 3],
      currentPage: 1,
      totalPages: 1,
    })
  })

  it("splits items across pages of the given size", () => {
    const items = Array.from({ length: 25 }, (_, i) => i)

    expect(paginate(items, 1, 10).pageItems).toEqual(items.slice(0, 10))
    expect(paginate(items, 2, 10).pageItems).toEqual(items.slice(10, 20))
    expect(paginate(items, 3, 10).pageItems).toEqual(items.slice(20, 25))
    expect(paginate(items, 1, 10).totalPages).toBe(3)
  })

  it("reports exactly one total page for an empty list, not zero", () => {
    expect(paginate([], 1, 10)).toEqual({
      pageItems: [],
      currentPage: 1,
      totalPages: 1,
    })
  })

  it("clamps a page number past the end back to the last valid page", () => {
    const items = [1, 2, 3]
    const result = paginate(items, 99, 10)
    expect(result.currentPage).toBe(1)
    expect(result.pageItems).toEqual(items)
  })

  it("clamps a page number below 1 up to the first page", () => {
    const result = paginate([1, 2, 3], 0, 10)
    expect(result.currentPage).toBe(1)
  })

  it("clamps to the new last page when the list shrinks out from under the current page", () => {
    // e.g. page 3 of a 25-item, page-size-10 list, then 20 items get deleted.
    const shrunk = Array.from({ length: 5 }, (_, i) => i)
    const result = paginate(shrunk, 3, 10)
    expect(result.currentPage).toBe(1)
    expect(result.pageItems).toEqual(shrunk)
  })
})
