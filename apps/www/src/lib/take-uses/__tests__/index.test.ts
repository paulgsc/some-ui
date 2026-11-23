/**
 * @vitest-environment jsdom
 *
 * What uses each take, on this phone (INUSE, TU1): a record this phone set
 * aside as unreadable leaves in doubt the takes it names, never more, and
 * is seen on the very read that set it aside.
 */
import { afterEach, describe, expect, it } from "vitest"

import { SCRIPTS_KEY } from "@/lib/studio-spoken/store"
import { keptWhole, phoneTakeUses, unreadOf } from "@/lib/take-uses"

afterEach(() => {
  localStorage.clear()
})

describe("a store with a record set aside", () => {
  it("names each record set aside, looked for after the read", () => {
    expect(keptWhole("k", () => [1])).toEqual({ value: [1], setAside: [] })
    expect(keptWhole("k", () => null)).toBeNull()
    // The read itself sets the bad record aside.
    expect(
      keptWhole("k", () => {
        localStorage.setItem("k:unreadable:1", '[{"using":"t9"}]')
        return []
      })
    ).toEqual({ value: [], setAside: ['[{"using":"t9"}]'] })
  })

  it("leaves in doubt only a take the set-aside record names", async () => {
    // Spoken cards from another build: unreadable, so set aside on the read.
    localStorage.setItem(
      SCRIPTS_KEY,
      JSON.stringify([{ id: "c1", parts: [{ using: "t9" }] }])
    )
    const uses = await phoneTakeUses().read()
    expect(unreadOf(uses, ["t9"])).toContain("spoken")
    expect(unreadOf(uses, ["t1"])).not.toContain("spoken")
  })
})
