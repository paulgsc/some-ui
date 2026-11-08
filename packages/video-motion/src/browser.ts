/**
 * The browser a composition is drawn with: Playwright's Chromium headless
 * shell, never the full Chrome (#2739). Only the headless shell draws with
 * `--run-all-compositor-stages-before-draw` (`DRAW_FLAGS`, pin.ts) outside
 * HyperFrames' BeginFrame capture; full Chrome given it never draws a frame,
 * so it is refused rather than left to hang.
 *
 * It is found where Playwright keeps its browsers: `PLAYWRIGHT_BROWSERS_PATH`
 * (CI's nix shell, home's image), then Playwright's own cache. CI's nix shell
 * names the full Chrome in `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, so that is
 * not read.
 */

import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"

/** The shell's file inside a `chromium_headless_shell-<revision>` folder. */
const SHELLS = [
  "chrome-headless-shell-linux64/chrome-headless-shell",
  "chrome-linux/headless_shell",
]

/** Whether `chrome` names a headless shell, by its file's name. */
export const isHeadlessShell = (chrome: string): boolean =>
  /headless/.test(basename(chrome))

/**
 * The headless shell in the first of `roots` that holds one, the newest
 * revision first, or null.
 */
export function findHeadlessShell(roots: ReadonlyArray<string>): string | null {
  for (const root of roots) {
    if (!existsSync(root)) continue
    const revisions = readdirSync(root)
      .flatMap((name) => {
        const m = /^chromium_headless_shell-(\d+)$/.exec(name)
        return m ? [{ name, revision: Number(m[1]) }] : []
      })
      .sort((a, b) => b.revision - a.revision)
    for (const { name } of revisions) {
      for (const shell of SHELLS) {
        const file = join(root, name, shell)
        if (existsSync(file)) return file
      }
    }
  }
  return null
}

/** Where Playwright keeps its browsers, in the order they are searched. */
export const browserRoots = (
  env: Readonly<Record<string, string | undefined>>
): ReadonlyArray<string> => [
  ...(env["PLAYWRIGHT_BROWSERS_PATH"] ? [env["PLAYWRIGHT_BROWSERS_PATH"]] : []),
  join(homedir(), ".cache", "ms-playwright"),
]
