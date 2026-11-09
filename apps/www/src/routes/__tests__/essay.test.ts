/**
 * `/essay` reads its recording address from the URL, as `/call` does:
 * `?scene` as a scene's id and `?record` as a flag. Anything else is dropped
 * rather than passed to the stage, which opens on the first scene for an id
 * it doesn't know.
 */

import { Route } from "@/routes/essay"
import { describe, expect, it } from "vitest"

const read = (search: Record<string, unknown>): unknown => {
  const validate = Route.options.validateSearch
  if (typeof validate !== "function") throw new Error("no validateSearch")
  return validate(search)
}

describe("/essay's search", () => {
  it("takes a scene and the record flag", () => {
    expect(read({ scene: "dive-3", record: "true" })).toEqual({
      scene: "dive-3",
      record: true,
    })
  })

  it("drops what is not a scene's id or the flag", () => {
    expect(read({ scene: 3, record: "yes", week: "2026-w46" })).toEqual({})
    expect(read({ scene: "" })).toEqual({})
  })
})
