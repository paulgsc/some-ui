/**
 * The phone list's model (SIGNIN7): one thing done to one phone at a time,
 * an answer counted only for what is under way, and a read that drops a
 * phone ending what was being done to it.
 */
import { describe, expect, it } from "vitest"

import type { Phone, PhonesEvent, PhonesState } from "@/lib/auth/phones/model"
import { INITIAL, phonesOf, step } from "@/lib/auth/phones/model"

const A: Phone = {
  id: "a",
  pairedOn: "2026-11-03",
  name: "Pixel",
  renewedAt: 1,
}
const B: Phone = { id: "b", pairedOn: null, name: null, renewedAt: 2 }

const run = (
  events: ReadonlyArray<PhonesEvent>,
  from: PhonesState = INITIAL
): PhonesState => events.reduce(step, from)

const LISTED = run([{ type: "read", phones: [A, B] }])

describe("the phone list (model)", () => {
  it("shows what was read, and keeps it shown when a later read fails", () => {
    expect(phonesOf(INITIAL.list)).toBeNull()
    expect(phonesOf(LISTED.list)).toEqual([A, B])
    const failed = step(LISTED, { type: "readFailed" })
    expect(failed.list).toEqual({ kind: "unread", phones: [A, B] })
    expect(step(INITIAL, { type: "readFailed" }).list).toEqual({
      kind: "unread",
      phones: null,
    })
  })

  it("names a phone: starts from its name, saves, and says so", () => {
    const naming = run([{ type: "renamePressed", id: "a" }], LISTED)
    expect(naming.doing).toEqual({ kind: "naming", id: "a", text: "Pixel" })
    const saved = run(
      [
        { type: "typed", text: "Kitchen" },
        { type: "savePressed", name: "Kitchen" },
        { type: "saved", id: "a", name: "Kitchen" },
      ],
      naming
    )
    expect(phonesOf(saved.list)?.[0]?.name).toBe("Kitchen")
    expect(saved.doing).toEqual({ kind: "idle" })
    expect(saved.said).toEqual({ kind: "named", name: "Kitchen" })
  })

  it("keeps a refused or unanswered name in the field, and drops a phone home no longer has", () => {
    const saving = run(
      [
        { type: "renamePressed", id: "a" },
        { type: "savePressed", name: "Kitchen" },
      ],
      LISTED
    )
    for (const why of ["refused", "failed"] as const) {
      const after = step(saving, { type: "saveFailed", id: "a", why })
      expect(after.doing).toEqual({ kind: "naming", id: "a", text: "Kitchen" })
      expect(after.said).toEqual({ kind: "notNamed", why })
      expect(after.list).toBe(saving.list)
    }
    const gone = step(saving, { type: "saveFailed", id: "a", why: "gone" })
    expect(gone.doing).toEqual({ kind: "idle" })
    expect(phonesOf(gone.list)).toEqual([B])
  })

  it("signs a phone out only after asking, and drops it from the list", () => {
    const asking = step(LISTED, { type: "signOutPressed", id: "b" })
    expect(asking.doing).toEqual({ kind: "confirming", id: "b" })
    expect(step(asking, { type: "cancelled" }).doing).toEqual({
      kind: "idle",
    })
    const out = run(
      [{ type: "confirmed" }, { type: "signedOut", id: "b" }],
      asking
    )
    expect(phonesOf(out.list)).toEqual([A])
    expect(out.said).toEqual({ kind: "signedOut", name: null })
    const failed = run(
      [
        { type: "confirmed" },
        { type: "signOutFailed", id: "b", why: "failed" },
      ],
      asking
    )
    expect(phonesOf(failed.list)).toEqual([A, B])
    expect(failed.said).toEqual({ kind: "notSignedOut", why: "failed" })
  })

  it("does one thing at a time, and counts an answer only for what is under way", () => {
    const naming = step(LISTED, { type: "renamePressed", id: "a" })
    // Another phone's buttons do nothing while one is being named.
    expect(step(naming, { type: "signOutPressed", id: "b" })).toBe(naming)
    expect(step(naming, { type: "renamePressed", id: "b" })).toBe(naming)
    // An answer for another phone, or for nothing asked, changes nothing.
    const saving = step(naming, { type: "savePressed", name: "X" })
    expect(step(saving, { type: "saved", id: "b", name: "X" })).toBe(saving)
    expect(step(saving, { type: "signedOut", id: "a" })).toBe(saving)
    // What has gone to home can't be called off.
    expect(step(saving, { type: "cancelled" })).toBe(saving)
    // Pressing for a phone the list doesn't show does nothing.
    expect(step(LISTED, { type: "renamePressed", id: "z" })).toBe(LISTED)
  })

  it("ends what was being done to a phone a read no longer lists, and keeps the rest", () => {
    for (const events of [
      [{ type: "renamePressed", id: "b" }],
      [
        { type: "renamePressed", id: "b" },
        { type: "savePressed", name: null },
      ],
      [{ type: "signOutPressed", id: "b" }],
      [{ type: "signOutPressed", id: "b" }, { type: "confirmed" }],
    ] satisfies ReadonlyArray<ReadonlyArray<PhonesEvent>>) {
      const doing = run(events, LISTED)
      expect(step(doing, { type: "read", phones: [A] }).doing).toEqual({
        kind: "idle",
      })
      expect(step(doing, { type: "read", phones: [A, B] }).doing).toEqual(
        doing.doing
      )
    }
  })

  it("clears what it said on a dismiss, and when the next thing starts", () => {
    const said = run(
      [
        { type: "renamePressed", id: "a" },
        { type: "savePressed", name: null },
        { type: "saved", id: "a", name: null },
      ],
      LISTED
    )
    expect(said.said).toEqual({ kind: "named", name: null })
    expect(step(said, { type: "dismissed" }).said).toBeNull()
    expect(step(said, { type: "signOutPressed", id: "b" }).said).toBeNull()
  })
})
