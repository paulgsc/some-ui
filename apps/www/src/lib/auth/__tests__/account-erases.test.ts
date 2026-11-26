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
      "Mailbox files home holds",
      "Filed with home for the mailbox",
      "LeetType sessions",
      "Korean's word sets and reading records",
      "Written reflections",
      "Asks for the next scene",
      "Notes on the feeds' episodes",
      "Conversation essays' records",
      "Voice notes, recordings from a game included",
      "What the phone noted beside a soundbite or a LeetType answer",
      "Rust Rounds' rounds",
      "Rust Rounds' essay videos",
      "Interview weeks' essay videos",
      "Cards essays withdrawn for your takes",
      "How each recording ended",
      "Each week's engagement report",
      "Studio's time log",
      "What your phones share",
      "Sign-in",
    ])
    expect(stays.map(({ label }) => label)).toEqual([
      "On your phones",
      "In Drive",
      "In the mailbox",
      "Rust Rounds' programs",
      "Cards essays",
      "Logs and backups",
    ])
  })

  it("says the note of each cards essay withdrawn for a deleted or let-go take goes, and the cards and a made video stay (server#1055, #1064)", () => {
    expect(textOf(goes, "Cards essays withdrawn for your takes")).toMatch(
      /was deleted or let go/
    )
    expect(textOf(stays, "Cards essays")).toMatch(
      /already made from one stays as it is/
    )
  })

  it("says the mailbox's files go, archived ones too, and what stays in the mailbox", () => {
    const gone = textOf(goes, "Mailbox files home holds")
    expect(gone).toMatch(/archived out of the mailbox/)
    expect(gone).toMatch(/only one/)
    const left = textOf(stays, "In the mailbox")
    expect(left).toMatch(/still in the mailbox stay/)
    expect(left).toMatch(/never what was in it/)
  })

  it("says LeetType's session files and how each session went go too (some-ui#2026, #2027)", () => {
    expect(textOf(goes, "Mailbox files home holds")).toMatch(
      /LeetType session files/
    )
    expect(textOf(goes, "Filed with home for the mailbox")).toMatch(
      /how each LeetType session went/
    )
  })

  it("says a voice note goes with what home heard in it, the copy filed for the mailbox included", () => {
    const voice = textOf(goes, "Voice notes, recordings from a game included")
    expect(voice).toMatch(/sound included, and what home heard/)
    expect(voice).toMatch(/a recording from a game, also what it was about/)
    expect(textOf(goes, "Filed with home for the mailbox")).toMatch(
      /what home heard in your voice notes/
    )
  })

  it("says a Rust Rounds round goes and its programs stay, linked to no one", () => {
    expect(textOf(goes, "Rust Rounds' rounds")).toMatch(
      /which of your voice notes a card answered/
    )
    expect(textOf(stays, "Rust Rounds' programs")).toMatch(
      /linked to no one once your rounds are gone/
    )
  })
})
