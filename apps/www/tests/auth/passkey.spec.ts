/**
 * Passkey auth, across the whole stack: the built app, `file_host`, and a
 * browser holding a real (virtual) passkey. See `virtual-passkey.ts`.
 *
 * It needs a running stack, so it is skipped unless `AUTH_E2E_BASE_URL`
 * names one. A local run, from the two repositories' roots:
 *
 *   nats-server -js &
 *   # paulgsc/server, against a migrated throwaway database:
 *   WEBAUTHN_RP_ID=localhost WEBAUTHN_ORIGINS=http://localhost:5173 \
 *     OBS_WEBSOCKET_IP=127.0.0.1 OBS_WEBSOCKET_PWD=x \
 *     DATABASE_URL=sqlite://… cargo run --bin file_host &
 *   # apps/www: `localhost` is a secure context, so passkeys work over http
 *   VITE_FILE_HOST_ENDPOINT=/api/file-host/api/v1 \
 *     pnpm exec vite --host localhost --port 5173 &
 *   AUTH_E2E_BASE_URL=http://localhost:5173 pnpm exec playwright test tests/auth
 *
 * The server's half is also tested on its own, with a software
 * authenticator (`handlers::auth` in paulgsc/server).
 */

import { expect, test } from "@playwright/test"

import { addVirtualPasskey, createAccount, signIn } from "./virtual-passkey"

const baseUrl = process.env["AUTH_E2E_BASE_URL"]
const base = baseUrl ?? ""

test.skip(baseUrl === undefined, "needs a running stack: set AUTH_E2E_BASE_URL")
test.setTimeout(60_000)

const SESSION_COOKIE = "__Host-session"

test("a passkey is the whole account: create, sign out, sign in, delete", async ({
  context,
  page,
}) => {
  const passkey = await addVirtualPasskey(context, page)
  const session = async (): Promise<
    { httpOnly: boolean; sameSite: string } | undefined
  > => (await context.cookies()).find((c) => c.name === SESSION_COOKIE)

  // A guarded page sends a stranger to the passkey screen, keeping the way back.
  await page.goto(`${base}/app`)
  await expect(page).toHaveURL(/\/auth\?redirect=%2Fapp/)

  await createAccount(page)
  await expect(page).toHaveURL(/\/app$/)
  expect(await session()).toMatchObject({ httpOnly: true, sameSite: "Strict" })

  // Discoverable, so sign-in names no account; its user handle is 16 random bytes.
  const { credentials } = await passkey.cdp.send("WebAuthn.getCredentials", {
    authenticatorId: passkey.authenticatorId,
  })
  expect(credentials).toHaveLength(1)
  expect(credentials[0]?.isResidentCredential).toBe(true)
  expect(Buffer.from(credentials[0]?.userHandle ?? "", "base64")).toHaveLength(
    16
  )

  // The session outlives a reload: the app asks the server, not memory.
  await page.reload()
  await expect(page).toHaveURL(/\/app$/)

  await page.goto(`${base}/settings`)
  await page.getByRole("button", { name: /^sign out$/i }).click()
  await expect(page).toHaveURL(/\/auth/)
  expect(await session()).toBeUndefined()

  await page.goto(`${base}/app`)
  await signIn(page)
  await expect(page).toHaveURL(/\/app$/)

  await page.goto(`${base}/settings`)
  await page.getByRole("button", { name: /^delete account$/i }).click()
  await page.getByRole("button", { name: /yes, delete my account/i }).click()
  await expect(page).toHaveURL(/\/auth/)

  // The passkey still exists on the device, and opens nothing.
  await page.getByRole("button", { name: /continue with a passkey/i }).click()
  await expect(page.getByText(/doesn't open an account here/i)).toBeVisible()
})
