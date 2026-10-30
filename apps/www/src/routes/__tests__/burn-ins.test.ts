import { Route as Authorship } from "@/routes/authorship"
import { Route as BurnIns } from "@/routes/burn-ins"
import { Route as Captions } from "@/routes/captions"
import { isRedirect } from "@tanstack/react-router"
import { describe, expect, it } from "vitest"

const read = (search: Record<string, unknown>): unknown => {
  const validate = BurnIns.options.validateSearch
  if (typeof validate !== "function") throw new Error("no validateSearch")
  return validate(search)
}

describe("/burn-ins' search", () => {
  it("takes a kind, a look, a time and the recorder's flag", () => {
    expect(
      read({ kind: "card", design: "v1", at: "4200", record: "true" })
    ).toEqual({ kind: "card", design: "v1", at: 4200, record: true })
    expect(read({ at: 0 })).toEqual({ at: 0 })
  })

  it("drops what is not text, a whole time or a yes", () => {
    expect(read({ at: "-1", record: "no" })).toEqual({})
    expect(read({ kind: 3, design: null, at: 2.5 })).toEqual({})
    expect(read({})).toEqual({})
  })
})

describe("/captions", () => {
  const sent = (search: Record<string, unknown>): unknown => {
    const beforeLoad = Captions.options.beforeLoad
    if (typeof beforeLoad !== "function") throw new Error("no beforeLoad")
    try {
      // Only `search` is read.
      Reflect.apply(beforeLoad, undefined, [{ search }])
    } catch (thrown) {
      if (isRedirect(thrown)) return thrown.options
      throw thrown
    }
    throw new Error("no redirect")
  }

  it("opens the subtitles in /burn-ins, its look as the design", () => {
    expect(sent({ theme: "broadcast", at: 4200 })).toMatchObject({
      to: "/burn-ins",
      search: { kind: "captions", design: "broadcast", at: 4200 },
    })
    expect(sent({})).toMatchObject({
      to: "/burn-ins",
      search: { kind: "captions" },
    })
  })
})

describe("/authorship's search", () => {
  it("takes a record as text and drops anything else", () => {
    const validate = Authorship.options.validateSearch
    if (typeof validate !== "function") throw new Error("no validateSearch")
    expect(validate({ r: "Az-_" })).toEqual({ r: "Az-_" })
    expect(validate({ r: 7 })).toEqual({})
    expect(validate({})).toEqual({})
  })
})
