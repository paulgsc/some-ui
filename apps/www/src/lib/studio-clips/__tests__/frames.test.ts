/**
 * @vitest-environment node
 *
 * A clip's frame from home: where it's asked for, and what each answer comes
 * to on the clip's page.
 */
import { describe, expect, it } from "vitest"

import { clipFramePath } from "@/lib/home-link/clips"
import { readFrame } from "@/lib/studio-clips/frames"

describe("a clip's frame", () => {
  it("is asked for by its name alone within its side", () => {
    expect(clipFramePath("never-suspend", "after", "after/snips/01.png")).toBe(
      "/clips/never-suspend/after/01.png"
    )
    expect(
      clipFramePath("studio-release-promo", "before", "before/01-templates.png")
    ).toBe("/clips/studio-release-promo/before/01-templates.png")
  })

  it("shows home's bytes as an image", () => {
    expect(readFrame({ status: 200, body: "iVBORw0K\nGgo=" })).toEqual({
      kind: "frame",
      src: "data:image/png;base64,iVBORw0KGgo=",
    })
  })

  it("is not taken yet when home holds none", () => {
    expect(readFrame({ status: 404, body: "" })).toEqual({ kind: "not-taken" })
  })

  it("is away when home answers anything else", () => {
    expect(readFrame({ status: 429, body: "" })).toEqual({ kind: "away" })
    expect(readFrame({ status: 401, body: "" })).toEqual({ kind: "away" })
  })

  it.each(["", "<html>"])("doesn't read a body of %j", (body) => {
    expect(readFrame({ status: 200, body })).toEqual({ kind: "unreadable" })
  })
})
