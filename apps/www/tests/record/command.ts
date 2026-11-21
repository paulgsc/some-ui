/**
 * What every recording command shares: paths from where it was typed, a
 * refusal that says why and sets the exit code, and the browser it drives.
 */
import { chromium } from "@playwright/test"
import type { Browser, Route } from "@playwright/test"

export { fail, here, runCommand } from "@some-ui/video-render/node"

/** Answers a stage's read of `<id>.json` from the file it was handed alone. */
export function answerFile(
  route: Route,
  bytes: Buffer,
  id: string
): Promise<void> {
  const name = new URL(route.request().url()).pathname.split("/").at(-1)
  if (name !== `${id}.json`) return route.fulfill({ status: 404, body: "" })
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: bytes,
  })
}

/** Chromium, at PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when that is set. */
export const launchChromium = (): Promise<Browser> =>
  chromium.launch(
    process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
      : {}
  )
