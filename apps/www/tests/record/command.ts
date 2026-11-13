/**
 * What every recording command shares: paths from where it was typed, a
 * refusal that says why and sets the exit code, and the browser it drives.
 */
import { chromium } from "@playwright/test"
import type { Browser } from "@playwright/test"

export { fail, here, runCommand } from "@some-ui/video-render/node"

/** Chromium, at PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when that is set. */
export const launchChromium = (): Promise<Browser> =>
  chromium.launch(
    process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
      : {}
  )
