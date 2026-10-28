/**
 * `/captions` reads where the preview opens from the URL: `?theme` as a
 * look's name and `?at` as whole milliseconds. Anything else is dropped, so
 * a mistyped link opens the default look at the start.
 */

import { Route } from "@/routes/captions"
import { describe, expect, it } from "vitest"

const read = (search: Record<string, unknown>): unknown => {
  const validate = Route.options.validateSearch
  if (typeof validate !== "function") throw new Error("no validateSearch")
  return validate(search)
}

describe("/captions' search", () => {
  it("takes a look's name and a time", () => {
    expect(read({ theme: "broadcast", at: "4200" })).toEqual({
      theme: "broadcast",
      at: 4200,
    })
    expect(read({ at: 0 })).toEqual({ at: 0 })
  })

  it("drops what is not a name or a whole time", () => {
    expect(read({ theme: "<b>", at: "-1" })).toEqual({})
    expect(read({ theme: 3, at: 2.5 })).toEqual({})
    expect(read({})).toEqual({})
  })
})
