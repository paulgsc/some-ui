/**
 * Promise PW1 (SIGNIN4, #3090): the lan web's pairing words point at the
 * phone's real pages, and the phone's welcome points back at the web's.
 * - Claim: every phone page or button the lan web's words beside a pairing
 *   code name (`lib/auth/phone-pairing-words.ts`) is the phone's own, by
 *   its name, and the web's Phones heading and Pair a phone button are what
 *   the phone's welcome names.
 * - Family: a rename of the phone's Home page title (`lib/front-desk`), of
 *   Settings › Home's Pair button (`PAIR_FORM.open`), of the web's Phones
 *   heading or its Pair a phone button, or of the welcome's steps; each
 *   direction, web to phone and phone to web.
 * - Proof: these tests, which fail on any of those renames.
 * - Tolerance: the lan Settings tab's name ("Account") is written into the
 *   welcome's steps and this test, not read from one place; a page reached
 *   by another way than these words name is outside it.
 */
import { describe, expect, it } from "vitest"

import { PHONE_NAMES, PHONE_PAIRING } from "@/lib/auth/phone-pairing-words"
import { concern } from "@/lib/front-desk"
import { PAIR_FORM, WELCOME } from "@/lib/home-link/sign-in-words"

describe("the lan web's words for pairing a phone", () => {
  it("name the phone's Home page as the phone names it", () => {
    expect(PHONE_NAMES.page).toBe(concern("home").title)
    // The phone's own button, as Settings › Home draws it.
    expect(PAIR_FORM.open.replace(/\.+$/, "")).toBe(PHONE_NAMES.pair)
    expect(PHONE_PAIRING.onThePhone).toContain(
      `Settings, then ${concern("home").title}, then ${PHONE_NAMES.pair}`
    )
    // The page was "This phone" before #2107; it is the phone's storage now.
    expect(PHONE_PAIRING.onThePhone).not.toContain(concern("phone").title)
  })

  it("say the welcome a new phone opens on asks for the code", () => {
    expect(PHONE_PAIRING.onThePhone).toMatch(
      /new phone opened from the app's main icon asks for this code/
    )
  })

  it("are the words the phone's welcome sends the owner to", () => {
    const steps = WELCOME.steps.join(" ")
    expect(steps).toContain(`then Account, then ${PHONE_PAIRING.heading}`)
    expect(steps).toContain(`choose ${PHONE_PAIRING.pairAPhone}`)
  })
})
