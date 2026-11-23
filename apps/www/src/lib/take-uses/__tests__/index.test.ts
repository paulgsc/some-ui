/**
 * @vitest-environment jsdom
 *
 * What uses each take, on this phone (INUSE, TU1): a record this phone set
 * aside as unreadable makes its store unread, never one that picks nothing.
 */
import { afterEach, describe, expect, it } from "vitest"

import { SCRIPTS_KEY } from "@/lib/studio-spoken/store"
import { phoneTakeUses, wholeOrNull } from "@/lib/take-uses"

afterEach(() => {
  localStorage.clear()
})

describe("a store with a record set aside", () => {
  it("reads as unread while the set-aside copy is kept", async () => {
    expect(wholeOrNull("k", () => [1])).toEqual([1])
    localStorage.setItem("k:unreadable:1", "[{}]")
    expect(wholeOrNull("k", () => [1])).toBeNull()
    expect((await phoneTakeUses().read()).unread).not.toContain("spoken")
    localStorage.setItem(`${SCRIPTS_KEY}:unreadable:1`, "[")
    expect((await phoneTakeUses().read()).unread).toContain("spoken")
  })
})
