/**
 * Gate 0 falsification harness fixture (issue #1262).
 *
 * A deliberate sibling of `../fixture.ts`, not a reuse of it: `fixture.ts`'s
 * `context` fixture is a single `BrowserContext` shared, unrecorded, across
 * every spec file in the suite (`playwright.config.ts` pins `workers: 1`).
 * Gate 0's specs need `recordVideo` turned on so `frames.ts` can extract
 * every frame of the window under test --- turning that on for the shared
 * context would record the entire rest of the suite's runtime for no reason.
 * This fixture launches its own persistent context, scoped to one worker
 * process the same way `fixture.ts`'s is, purely to keep that cost isolated
 * to the specs that actually need a frame oracle.
 *
 * Loads the same real `dist/` build via `--load-extension` as every other
 * e2e spec --- Gate 0's whole premise (per the falsification-spec document
 * this harness answers) is proving propositions against the *built
 * extension*, not a synthetic unit-test context.
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
export const GATE0_VIEWPORT = { width: 800, height: 600 }

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
 * Wall-clock page-creation time, keyed by `Page` instance. A spec typically
 * runs real setup (navigation, `waitForClassification`, installing a
 * harness-only remedy/primitive) *before* the window it actually wants
 * `frames.ts`'s `captureFrames` to measure — but Playwright's video
 * recording always starts at page creation, with no way to start it later.
 * `captureFrames` reads this map to skip past that setup interval via
 * ffmpeg's `-ss`, so an incidental frame from page load/setup (a transient
 * loading-state color, a video-encoder keyframe artifact) is never mistaken
 * for a leak the window under test actually produced.
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

    // Same headless-detection rationale as fixture.ts: Chrome's new headless
    // mode supports extension content scripts and CDP screencast recording
    // without a display server.
    const needsVirtualDisplay =
      !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]

    // Disposable per-run profile, for the same reason as fixture.ts: a
    // reused directory lets background.ts's tab-state cache collide across
    // runs via reused Chromium tab IDs.
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
    // Same leaked-page guard as fixture.ts's `fixture` — see that file's
    // comment. captureFrames() (frames.ts) closes a page itself once it has
    // extracted that page's video, so most pages here are already closed by
    // the time this teardown runs; the catch below absorbs that.
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
export { waitForClassification, type FilterDebug } from "../fixture"
