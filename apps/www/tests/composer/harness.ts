/**
 * Boots the real app for the composer specs next door.
 *
 * Every other Playwright suite in this repo measures something that is not
 * the running app: `tests/ui-fit` sweeps a built Storybook, `tests/csp`
 * fulfils routes without a server, and `launcher-fit.spec.ts` hand-mirrors
 * the shipped classes in static HTML rather than mounting the component. That
 * is a deliberate trade in each case - but it is also exactly why the
 * composer's pager could ship a dead "Next" button past a green suite: no
 * test in the repository had ever clicked it.
 *
 * So this one runs `vite` and drives the app. It reuses an already-running
 * dev server when it finds one, which keeps a local `pnpm dev` loop fast.
 */

import { spawn, type ChildProcess } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** `apps/www`, from `apps/www/tests/composer`. */
const APP_ROOT = resolve(__dirname, "../..")

const PORT = Number(process.env["COMPOSER_E2E_PORT"] ?? 5173)

const BASE_URL = `http://localhost:${PORT}`

async function isUp(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL, {
      signal: AbortSignal.timeout(1000),
    })
    return response.ok
  } catch {
    return false
  }
}

async function waitForServer(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isUp()) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

let server: ChildProcess | null = null

/** Starts `vite` unless something is already serving `BASE_URL`. */
export async function startAppServer(): Promise<void> {
  if (await isUp()) return

  server = spawn("pnpm", ["exec", "vite", "--port", String(PORT)], {
    cwd: APP_ROOT,
    stdio: "ignore",
    detached: false,
    // The static build: no `file_host`, so "signing in" only opens the
    // in-memory demo (`lib/auth/session.ts`). Without it the passkey screen
    // asks a server that is not there and never lets the spec in.
    env: { ...process.env, VITE_STATIC_DATA: "true" },
  })

  if (!(await waitForServer(90_000))) {
    throw new Error(
      `vite did not come up on ${BASE_URL} within 90s. Run \`pnpm --filter www dev\` ` +
        `first, or set COMPOSER_E2E_PORT to a free port.`
    )
  }
}

export function stopAppServer(): void {
  server?.kill("SIGTERM")
  server = null
}

/**
 * Signed in, whichever kind of server `BASE_URL` turned out to be.
 *
 * `startAppServer` launches the static build, where the passkey screen's
 * "Continue with a passkey" only opens the in-memory demo. But it reuses a
 * server already on the port, and the usual one there is a plain
 * `pnpm --filter www dev`, where that same button starts a real passkey
 * ceremony against a `file_host` that is not running, and every suite here
 * would time out. So `GET /auth/session` is also answered the way a live
 * session answers it (`SessionView`, as the device backend also answers it):
 * a server-mode app then believes it is signed in and opens the composer
 * straight away, and the button is pressed only if the passkey screen is
 * what actually appears. Its own name is what tells it from "New here?
 * Create a passkey" beside it.
 */
export async function signIn(page: Page): Promise<void> {
  await page.route("**/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ expiresAt: Date.now() + 60 * 60 * 1000 }),
    })
  )
  await page.goto(`${BASE_URL}/sessions/new`, { waitUntil: "domcontentloaded" })
  // Whichever layout the window is: a phone gets the tab bar, everything
  // wider gets the wizard's own nav. Both are there once the composer is.
  const composer = page
    .getByRole("tablist", { name: "Composer panes" })
    .or(page.getByRole("button", { name: "Continue", exact: true }))
  const passkey = page.getByRole("button", { name: "Continue with a passkey" })
  await expect(composer.or(passkey)).toBeVisible()
  if (await passkey.isVisible()) await passkey.click()
  await expect(composer).toBeVisible()
}

/**
 * Whether a window of this size is handheld, by `useIsMobile`'s rule
 * (`isHandheldBox`, some-ui-utils): narrower than `md` or shorter than 480px.
 * Restated rather than imported, since that package's index pulls in React
 * hooks this Node-side harness has no use for. Width alone used to be the
 * rule, and it called a landscape phone a desktop.
 */
export function isHandheld({
  width,
  height,
}: {
  width: number
  height: number
}): boolean {
  return width < 768 || height < 480
}
