/**
 * SIGNIN4 (#3090): the lan web's pairing words point at the phone's real
 * pages, and the phone's welcome points back at the web's.
 */
import { describe, expect, it } from "vitest"

import { PHONE_NAMES, PHONE_PAIRING } from "@/lib/auth/phone-pairing-words"
import { concern } from "@/lib/front-desk"
import { WELCOME } from "@/lib/home-link/sign-in-words"

describe("the lan web's words for pairing a phone", () => {
  it("name the phone's Home page as the phone names it", () => {
    expect(PHONE_NAMES.page).toBe(concern("home").title)
    expect(PHONE_PAIRING.onThePhone).toContain(
      `Settings, then ${concern("home").title}, then ${PHONE_NAMES.pair}`
    )
    // The page was "This phone" before #2107; it is the phone's storage now.
    expect(PHONE_PAIRING.onThePhone).not.toContain(concern("phone").title)
  })

  it("say the welcome a new phone opens on asks for the code", () => {
    expect(PHONE_PAIRING.onThePhone).toMatch(/new phone asks for this code/)
  })

  it("are the words the phone's welcome sends the owner to", () => {
    const steps = WELCOME.steps.join(" ")
    expect(steps).toContain(`then ${PHONE_PAIRING.heading}`)
    expect(steps).toContain(`choose ${PHONE_PAIRING.pairAPhone}`)
  })
})
