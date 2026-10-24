/**
 * What deleting the account says it removes and leaves: every kind of record
 * the server's deletion erases is named, the Jobs mailbox's files (the archived
 * ones, whose home copy is the only one) included, what stays is said where it
 * stays, and none of it names the machinery.
 */

import { describe, expect, it } from "vitest"

import { ACCOUNT_ERASES } from "@/lib/auth/account-erases"
import { MACHINERY } from "@/lib/home-link/__tests__/machinery"

const kinds = [...ACCOUNT_ERASES.goes, ...ACCOUNT_ERASES.stays]
const said = (list: ReadonlyArray<{ label: string; text: string }>): string =>
  list.map(({ label, text }) => `${label}. ${text}`).join("\n")

describe("what deleting the account says", () => {
  it("says nothing of the machinery", () => {
    const words = [
      ACCOUNT_ERASES.lead,
      ACCOUNT_ERASES.goesTitle,
      ACCOUNT_ERASES.staysTitle,
      ...kinds.flatMap(({ label, text }) => [label, text]),
    ]
    expect(words.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("names each kind once, as a sentence", () => {
    const labels = kinds.map(({ label }) => label)
    expect(new Set(labels).size).toBe(labels.length)
    for (const { label, text } of kinds) {
      expect(label.trim()).not.toBe("")
      expect(text).toMatch(/\.$/)
    }
  })

  it("names every kind of record home keeps under an account", () => {
    const goes = said(ACCOUNT_ERASES.goes)
    for (const kind of [
      /study sessions/i,
      /shelf/i,
      /reminder/i,
      /\baph\b/,
      /Jobs record/,
      /word sets/,
      /dramas/,
      /decisions and scouts/,
      /LeetType/,
      /paired phone/,
      /passkeys/,
    ]) {
      expect(goes).toMatch(kind)
    }
  })

  it("says the archived mailbox files go too, and why that matters", () => {
    const mailbox = ACCOUNT_ERASES.goes.find(({ label }) =>
      /mailbox files/i.test(label)
    )
    expect(mailbox?.text).toMatch(/archived out of the mailbox/)
    expect(mailbox?.text).toMatch(/only one/)
  })

  it("says what stays, and where", () => {
    const stays = said(ACCOUNT_ERASES.stays)
    expect(stays).toMatch(/phone/i)
    expect(stays).toMatch(/Drive/)
    expect(stays).toMatch(/still in the mailbox stay/)
    expect(stays).toMatch(/never what was in it/)
    expect(stays).toMatch(/logs and backups are not rewritten/i)
  })

  it("does not say a file left in the mailbox ages out", () => {
    // Home archives nothing for an account that is gone, so a live file stays
    // until it is removed from the mailbox itself.
    expect(said(ACCOUNT_ERASES.stays)).not.toMatch(/\bage[sd]?\b|expire/i)
  })
})
