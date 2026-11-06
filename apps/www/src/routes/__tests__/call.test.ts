/**
 * `/call` reads its recording address from the URL: `?scene` as a scene's
 * id and `?record` as a flag. Anything else is dropped rather than passed to
 * the stage, which opens on the first scene for an id it doesn't know.
 */

import { Route } from "@/routes/call"
import { describe, expect, it } from "vitest"

const read = (search: Record<string, unknown>): unknown => {
  const validate = Route.options.validateSearch
  if (typeof validate !== "function") throw new Error("no validateSearch")
  return validate(search)
}

describe("/call's search", () => {
  it("takes a week, a scene and the record flag", () => {
    expect(
      read({ week: "2026-10-30", scene: "asks-2", record: "true" })
    ).toEqual({
      week: "2026-10-30",
      scene: "asks-2",
      record: true,
    })
  })

  it("drops what is not a scene's id or the flag", () => {
    expect(read({ scene: 3, record: "yes" })).toEqual({})
    expect(read({ scene: "", week: "" })).toEqual({})
    expect(read({})).toEqual({})
  })
})
