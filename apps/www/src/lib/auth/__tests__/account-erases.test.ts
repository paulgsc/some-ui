/**
 * What deleting the account says: in the person's terms, none of it naming the
 * machinery, and the mailbox's files said both where they go and where they stay.
 */

import { describe, expect, it } from "vitest"

import type { Kind } from "@/lib/auth/account-erases"
import { ACCOUNT_ERASES } from "@/lib/auth/account-erases"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

const { goes, stays } = ACCOUNT_ERASES
const textOf = (list: ReadonlyArray<Kind>, label: string): string | undefined =>
  list.find((kind) => kind.label === label)?.text

describe("what deleting the account says", () => {
  it("says nothing of the machinery", () => {
    const words = [
      ACCOUNT_ERASES.lead,
      ACCOUNT_ERASES.goesTitle,
      ACCOUNT_ERASES.staysTitle,
      ...[...goes, ...stays].flatMap(({ label, text }) => [label, text]),
    ]
    expect(words.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("still names the kinds it named", () => {
    expect(goes.map(({ label }) => label)).toEqual([
      "Sessions",
      "Saved shelf items",
      "Reminders and progress",
      "aph",
      "The Jobs record",
      "Telling the phone a morning run is in",
      "Jobs mailbox files home holds",
      "Filed with home for the mailbox",
      "LeetType sessions",
      "Korean's word sets and reading records",
      "Voice notes, game bites included",
      "Studio's time log",
      "What your phones share",
      "Sign-in",
    ])
  })

  it("says the mailbox's files go, archived ones too, and what stays in the mailbox", () => {
    const gone = textOf(goes, "Jobs mailbox files home holds")
    expect(gone).toMatch(/archived out of the mailbox/)
    expect(gone).toMatch(/only one/)
    const left = textOf(stays, "In the Jobs mailbox")
    expect(left).toMatch(/still in the mailbox stay/)
    expect(left).toMatch(/never what was in it/)
  })

  it("says a voice note goes with what home heard in it, the copy filed for the mailbox included", () => {
    const voice = textOf(goes, "Voice notes, game bites included")
    expect(voice).toMatch(/sound included, and what home heard/)
    expect(voice).toMatch(/game-day bite, also what it was about/)
    expect(textOf(goes, "Filed with home for the mailbox")).toMatch(
      /what home heard in your voice notes/
    )
  })
})
