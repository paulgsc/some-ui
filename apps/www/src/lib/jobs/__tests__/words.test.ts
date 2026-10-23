/**
 * What Jobs says about where today's picks come from is said as what is on the
 * phone and what brings the rest, and none of it names the machinery.
 */
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import * as words from "@/lib/jobs/words"

describe("Jobs' words about where the picks come from", () => {
  it("never name the machinery", () => {
    const said = Object.values(words).map((word) =>
      typeof word === "function" ? word("2026-10-18") : word
    )
    expect(said).toHaveLength(4)
    expect(said.filter((text) => MACHINERY.test(text))).toEqual([])
  })
})
