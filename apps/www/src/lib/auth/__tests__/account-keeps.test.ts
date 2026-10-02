/**
 * What an account holds is said on two screens, from one string.
 *
 * The sign-up screen is where a person decides whether to make an account, so
 * it must list every kind of record the account will hold: sessions and their
 * times, shelf items, and (once reminders are on) the push address. It listed
 * only the first until review pointed out the settings screen's own deletion
 * copy already named the rest. A screen cannot be rendered here without the
 * router, so the second half reads the two sources and requires that both use
 * the shared constant rather than a copy of their own.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { ACCOUNT_KEEPS } from "@/lib/auth/account-keeps"

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const read = (path: string): string => readFileSync(resolve(SRC, path), "utf8")

/** Why a screen's source is not using the shared copy, or [] when it is. */
function copyProblems(file: string, source: string): Array<string> {
  const problems: Array<string> = []
  if (
    !/import \{ ACCOUNT_KEEPS \} from "@\/lib\/auth\/account-keeps"/.test(
      source
    )
  ) {
    problems.push(`${file} does not import ACCOUNT_KEEPS`)
  }
  if (/random ID/.test(source)) {
    problems.push(`${file} keeps its own copy of what an account holds`)
  }
  return problems
}

describe("what an account keeps", () => {
  it("names every kind of record the account will hold", () => {
    expect(ACCOUNT_KEEPS).toMatch(/random ID/)
    expect(ACCOUNT_KEEPS).toMatch(/no name, email or phone number/)
    expect(ACCOUNT_KEEPS).toMatch(/sessions and when you start and finish them/)
    expect(ACCOUNT_KEEPS).toMatch(/shelves/)
    expect(ACCOUNT_KEEPS).toMatch(/reminders/)
    expect(ACCOUNT_KEEPS).toMatch(/push address/)
    // The behaviour that leaves only with the opt-in, named, with the switch.
    expect(ACCOUNT_KEEPS).toMatch(/Reminders and progress sync/)
    expect(ACCOUNT_KEEPS).toMatch(/how far you get in each session/)
    expect(ACCOUNT_KEEPS).toMatch(/which session you have open/)
    expect(ACCOUNT_KEEPS).toMatch(/off until you turn it on/)
  })

  it("is the text both the sign-up and the settings screen use", () => {
    for (const file of [
      "routes/auth.tsx",
      "components/settings/account-section.tsx",
    ]) {
      expect(copyProblems(file, read(file))).toEqual([])
    }
  })

  it("notices a screen with its own copy, or none", () => {
    const own = 'description: "An account is a random ID and your passkey"'
    expect(copyProblems("f", own)).toHaveLength(2)
    expect(copyProblems("f", "const x = 1")).toHaveLength(1)
  })
})
