/**
 * SIGNIN5 (#3091): the viewer build's `/auth` names no passkey, and offers
 * nothing to press that signs in.
 */
import { describe, expect, it } from "vitest"

import { VIEWER_AUTH } from "@/lib/auth/viewer-words"

describe("the viewer's /auth words", () => {
  it("name no passkey anywhere", () => {
    for (const words of Object.values(VIEWER_AUTH)) {
      expect(words).not.toMatch(/passkey/i)
    }
  })

  it("offer only the demo to press, never a sign-in", () => {
    expect(VIEWER_AUTH.open).not.toMatch(/sign|log|account|continue/i)
    expect(VIEWER_AUTH.open).toMatch(/demo/i)
  })

  it("say who signs in, that it's sample data, and that nothing is kept", () => {
    expect(VIEWER_AUTH.body).toMatch(/only i sign in/i)
    expect(VIEWER_AUTH.body).toMatch(/sample data/)
    expect(VIEWER_AUTH.body).toMatch(/nothing is kept/)
  })
})
