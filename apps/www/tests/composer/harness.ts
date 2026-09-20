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

const __dirname = dirname(fileURLToPath(import.meta.url))

/** `apps/www`, from `apps/www/tests/composer`. */
const APP_ROOT = resolve(__dirname, "../..")

const PORT = Number(process.env["COMPOSER_E2E_PORT"] ?? 5173)

export const BASE_URL = `http://localhost:${PORT}`

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
