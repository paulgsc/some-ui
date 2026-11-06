/**
 * What every recording command shares: paths from where it was typed, a
 * refusal that says why and sets the exit code, and the browser it drives.
 */
import { resolve } from "node:path"
import { chromium } from "@playwright/test"
import type { Browser } from "@playwright/test"

/** A path from where the command was typed (`pnpm --filter` sets INIT_CWD). */
export const here = (p: string): string =>
  resolve(process.env["INIT_CWD"] ?? process.cwd(), p)

/** Stops the command, saying why; `runCommand` prints it and sets the exit code. */
export class Refused extends Error {}

export function fail(lines: ReadonlyArray<string>): never {
  throw new Refused(lines.join("\n"))
}

/** Chromium, at PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when that is set. */
export const launchChromium = (): Promise<Browser> =>
  chromium.launch(
    process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
      : {}
  )

/** Runs `main`, printing a refusal's reasons rather than a stack. */
export async function runCommand(main: () => Promise<void>): Promise<void> {
  try {
    await main()
  } catch (e) {
    if (!(e instanceof Refused)) throw e
    process.stderr.write(`${e.message}\n`)
    process.exitCode = 1
  }
}
