import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { findHeadlessShell, isHeadlessShell } from "@video-motion/browser"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

let root = ""
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "browsers-"))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** A file at `path` under the stand-in browsers folder. */
const lay = (path: string): string => {
  const file = join(root, path)
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, "")
  return file
}

describe("the browser a composition is drawn with (#2739)", () => {
  it("is the headless shell, the newest revision, never the full Chrome", () => {
    lay("chromium-1300/chrome-linux64/chrome")
    lay(
      "chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell"
    )
    const newest = lay(
      "chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell"
    )
    expect(findHeadlessShell([root])).toBe(newest)
  })

  it("finds an older shell's layout", () => {
    const old = lay("chromium_headless_shell-1100/chrome-linux/headless_shell")
    expect(findHeadlessShell([root])).toBe(old)
  })

  it("finds none where there is only the full Chrome, or nothing", () => {
    lay("chromium-1300/chrome-linux64/chrome")
    expect(findHeadlessShell([root, join(root, "missing")])).toBeNull()
  })

  it("refuses the full Chrome by its name", () => {
    expect(isHeadlessShell("/b/chromium-1243/chrome-linux64/chrome")).toBe(
      false
    )
  })
})
