/**
 * What the phone list says (SIGNIN7): in the person's terms, never the
 * machinery, and a name exactly as its owner typed it.
 */
import { describe, expect, it } from "vitest"

import type { Said } from "@/lib/auth/phones/model"
import { phoneName, PHONES } from "@/lib/auth/phones/words"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

/** Words this list's own machinery would leak: what home stores. */
const OWN_MACHINERY = /\b(session|label|renew\w*|phoneId|id|expires?)\b/i

const SAID: ReadonlyArray<Said> = [
  { kind: "named", name: "Kitchen" },
  { kind: "named", name: null },
  { kind: "signedOut", name: "Kitchen" },
  { kind: "signedOut", name: null },
  { kind: "notNamed", why: "refused" },
  { kind: "notNamed", why: "gone" },
  { kind: "notNamed", why: "failed" },
  { kind: "notSignedOut", why: "gone" },
  { kind: "notSignedOut", why: "failed" },
]

/** Every line the list can say. */
function lines(): ReadonlyArray<string> {
  const fixed = Object.values(PHONES).flatMap((value) =>
    typeof value === "string" ? [value] : []
  )
  return [
    ...fixed,
    PHONES.paired("2026-11-03"),
    PHONES.paired(null),
    PHONES.used(Date.UTC(2026, 10, 17, 12)),
    PHONES.confirm({ name: null }),
    ...SAID.map((said) => PHONES.said(said)),
  ]
}

describe("the phone list's words", () => {
  it("names no machinery", () => {
    for (const line of lines()) {
      expect(line).not.toMatch(MACHINERY)
      expect(line).not.toMatch(OWN_MACHINERY)
    }
  })

  it("shows a name as typed, and an unnamed phone as unnamed", () => {
    const typed = "  My phone: grant 404 "
    expect(phoneName({ name: typed })).toBe(typed)
    expect(phoneName({ name: null })).toBe("Unnamed phone")
    expect(PHONES.confirm({ name: "Kitchen" })).toMatch(/^Sign out Kitchen\?/)
  })

  it("says when a phone paired and was last used, by day", () => {
    expect(PHONES.paired("2026-11-03")).toBe("Paired Nov 3")
    expect(PHONES.paired(null)).toBe("Paired before home kept the day")
    expect(PHONES.used(new Date(2026, 10, 17, 9).getTime())).toBe(
      "Used Nov 17 or later"
    )
  })

  it("says what stays when a phone is signed out", () => {
    for (const line of [
      PHONES.confirm({ name: "Kitchen" }),
      PHONES.said({ kind: "signedOut", name: "Kitchen" }),
    ]) {
      expect(line).toMatch(/keeps (everything on it|what it holds)/)
      expect(line).toMatch(
        /home keeps (everything it already sent|what it sent)/
      )
    }
  })
})
