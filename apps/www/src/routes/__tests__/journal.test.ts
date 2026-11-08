/**
 * The videos made in sittings (`/journal/episodes/making`, under Studio's
 * Episodes since SFEED1) open on the video `?project` names, as Your ideas
 * links the one an idea became (ST19); anything else is dropped, and they
 * open on the one touched last.
 */

import { Route } from "@/routes/_dashboard/_apk/journal/episodes/making"
import { describe, expect, it } from "vitest"

const read = (search: Record<string, unknown>): unknown => {
  const validate = Route.options.validateSearch
  if (typeof validate !== "function") throw new Error("no validateSearch")
  return validate(search)
}

describe("/journal/episodes/making's search", () => {
  it("takes the video to open on", () => {
    expect(read({ project: "week-8-picks-20261030" })).toEqual({
      project: "week-8-picks-20261030",
    })
  })

  it("drops anything else", () => {
    expect(read({ project: "" })).toEqual({})
    expect(read({ project: 8 })).toEqual({})
    expect(read({})).toEqual({})
  })
})
