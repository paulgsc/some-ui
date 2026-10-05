/**
 * Gate 0 falsification harness fixture (#1262).
 *
 * A sibling of `../fixture.ts`, not a reuse: that context is shared,
 * unrecorded, across the whole suite (`workers: 1`), and Gate 0's specs need
 * `recordVideo` for `frames.ts`. This launches its own persistent context to
 * keep the recording cost to the specs that need a frame oracle.
 *
 * Loads the same real `dist/` build via `--load-extension`: Gate 0 proves
 * propositions against the *built extension*.
 */

import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, "../../../dist")
const FIXTURE_DIR = path.resolve(__dirname, "..", "fixtures")

/** Fixed so every captured video/frame set is directly comparable across runs. */
const GATE0_VIEWPORT = { width: 800, height: 600 }

type Gate0Fixtures = {
  context: BrowserContext
  gate0: {
    /** Opens fixtures/<name>.html as a fresh, video-recorded page. */
    goto(name: string): Promise<Page>
    /** Opens an arbitrary file:// URL (probe-extension pages, blank pages for a trace's initial state) as a fresh, video-recorded page. */
    open(url: string): Promise<Page>
  }
  videoDir: string
}

/**
 * Wall-clock page-creation time, keyed by `Page`. Recording starts at page
 * creation, before setup; `captureFrames` reads this to skip the setup
 * interval via ffmpeg's `-ss`, so a loading colour or encoder keyframe is
 * never mistaken for a leak.
 */
export const pageCreatedAt = new WeakMap<Page, number>()

export const test = base.extend<Gate0Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  videoDir: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-gate0-video-"))
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  },

  context: async ({ videoDir }, use) => {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    if (!executablePath) {
      throw new Error(
        "[FILTER][gate0] PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is not set.\n" +
          "Enter the playwright nix shell (nix develop .#playwright) or run " +
          "via scripts/claude-e2e.sh in an environment exposing " +
          "$PLAYWRIGHT_BROWSERS_PATH/chromium.\n"
      )
    }

    // As fixture.ts: new headless mode supports extensions and screencast
    // without a display server.
    const needsVirtualDisplay =
      !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]

    // Disposable per-run profile, as fixture.ts.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-gate0-e2e-"))

    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,
      viewport: GATE0_VIEWPORT,
      recordVideo: { dir: videoDir, size: GATE0_VIEWPORT },
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        "--allow-file-access-from-files",
        ...(needsVirtualDisplay ? ["--headless=new"] : []),
      ],
    })

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context)
    await context.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  },

  gate0: async ({ context }, use) => {
    // Same leaked-page guard as fixture.ts. captureFrames() closes pages it
    // has recorded, so the catch below absorbs already-closed ones.
    const openedPages: Array<Page> = []

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use({
      async goto(name: string) {
        const page = await context.newPage()
        pageCreatedAt.set(page, Date.now())
        openedPages.push(page)
        await page.goto(`file://${path.join(FIXTURE_DIR, `${name}.html`)}`)
        return page
      },
      async open(url: string) {
        const page = await context.newPage()
        pageCreatedAt.set(page, Date.now())
        openedPages.push(page)
        await page.goto(url)
        return page
      },
    })

    await Promise.all(
      openedPages.map((p) =>
        p.close().catch(() => {
          // already closed by captureFrames() — fine
        })
      )
    )
  },
})

export { expect } from "@playwright/test"
export { waitForClassification } from "../fixture"
