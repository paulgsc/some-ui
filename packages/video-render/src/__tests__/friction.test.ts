import { readFileSync } from "node:fs"
import { parseFriction } from "@video-render/friction"
import { describe, expect, it } from "vitest"

/** Home's friction aggregate as the contract's sample holds it (WALK5). */
const sample: unknown = JSON.parse(
  readFileSync(new URL("../sample/friction.json", import.meta.url), "utf8")
)

describe("the friction aggregate (WALK5, C861)", () => {
  it("reads the sample", () => {
    const read = parseFriction(sample)
    expect(read.ok).toBe(true)
  })

  it("refuses a count under 5 said as a number, and a module or place twice", () => {
    const read = parseFriction(sample)
    if (!read.ok) throw new Error(read.problems.join("\n"))
    const { modules, places } = read.value
    const [first] = places
    expect(
      parseFriction({ ...read.value, places: [{ ...first, finished: 3 }] }).ok
    ).toBe(false)
    const twice = parseFriction({
      ...read.value,
      modules: [...modules, ...modules.slice(0, 1)],
      places: [...places, ...places.slice(0, 1)],
    })
    expect(twice.ok ? [] : twice.problems).toEqual([
      "jobs: listed twice",
      "jobs/todays-pick/read: listed twice",
    ])
  })
})
