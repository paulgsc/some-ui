/**
 * `/playoff-delta` reads its recording address from the URL: `?week` and
 * `?slide` as whole numbers, `?record` as a flag. Anything else is dropped
 * rather than passed to the stage, so a mistyped link shows the first week
 * from its start instead of an empty frame.
 */

import { Route } from "@/routes/playoff-delta"
import { describe, expect, it } from "vitest"

const read = (search: Record<string, unknown>): unknown => {
  const validate = Route.options.validateSearch
  if (typeof validate !== "function") throw new Error("no validateSearch")
  return validate(search)
}

describe("/playoff-delta's search", () => {
  it("takes a week, a slide and the record flag", () => {
    expect(read({ week: "9", slide: "3", record: "true" })).toEqual({
      week: 9,
      slide: 3,
      record: true,
    })
    expect(read({ week: 9, slide: 0, record: true })).toEqual({
      week: 9,
      slide: 0,
      record: true,
    })
  })

  it("drops what is not a whole number or the flag", () => {
    expect(read({ week: "nine", slide: "-1", record: "yes" })).toEqual({})
    expect(read({ week: 2.5 })).toEqual({})
    expect(read({ week: true, slide: "" })).toEqual({})
    expect(read({})).toEqual({})
  })
})
