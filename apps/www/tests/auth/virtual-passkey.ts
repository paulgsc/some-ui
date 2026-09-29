/**
 * A passkey for Playwright: Chromium's own virtual authenticator, through
 * the DevTools protocol's `WebAuthn` domain.
 *
 * Nothing about sign-in is bypassed. The app calls the real
 * `navigator.credentials`, the virtual authenticator answers it the way a
 * phone's platform authenticator would (a discoverable, user-verified
 * credential), and `file_host` verifies the signature as it would any other.
 * So a spec that needs a guarded page signs in exactly as a person does, and
 * there is no test-only door in the app to leave open in production
 * (some-ui#1140).
 */

import type { BrowserContext, CDPSession, Page } from "@playwright/test"
import { expect } from "@playwright/test"

export type VirtualPasskey = {
  cdp: CDPSession
  authenticatorId: string
}

/** Attach a platform-style authenticator that always verifies the user. */
export async function addVirtualPasskey(
  context: BrowserContext,
  page: Page
): Promise<VirtualPasskey> {
  const cdp = await context.newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    }
  )
  return { cdp, authenticatorId }
}

/** From the passkey screen, make a new account and land where it sends you. */
export async function createAccount(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /new here\? create a passkey/i })
    .click()
  await page.getByRole("button", { name: /^create a passkey$/i }).click()
  await expect(page).not.toHaveURL(/\/auth/)
}

/** From the passkey screen, sign in with the passkey the browser holds. */
export async function signIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: /continue with a passkey/i }).click()
  await expect(page).not.toHaveURL(/\/auth/)
}
