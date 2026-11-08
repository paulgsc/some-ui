/**
 * Suspender Ledger's walk: its toolbar popup, built as it ships, opened on a
 * sample tab, the site kept awake, then the tab suspended and the popup
 * opened again, from a sample (`SampleSchema`) kept in paulgsc/testing.
 *
 * The popup reads four of the browser's answers and sends the worker one
 * message per action (`extensions/suspender-ledger/src/popup/index.ts`). The
 * stand-ins (`suspender-ledger-stand-ins.js`) answer those from the sample and
 * keep what the actions change in the page's session storage, so reopening
 * the popup reads it back. Nothing else of the extension runs.
 */

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import type { Page } from "playwright-core"
import { z } from "zod"

import type { Walk } from "./run"

const require = createRequire(import.meta.url)

const SampleSchema = z.object({
  schema: z.literal("some-ui.walk-sample/suspender-ledger/1"),
  /** The tab the popup opens on. No favicon: the sandbox fetches nothing. */
  tab: z.object({ title: z.string().min(1), url: z.url() }),
  /** `storage.local`: the popup's settings, the worker's names and units. */
  settings: z.record(z.string(), z.unknown()),
  shortcuts: z.array(
    z.object({ description: z.string().min(1), shortcut: z.string() })
  ),
})
type Sample = z.infer<typeof SampleSchema>

/** The stand-ins' function, from its parameter on, run in the page on the sample. */
const STAND_INS = ((source: string) =>
  source.slice(source.indexOf("(sample)")))(
  readFileSync(
    new URL("./suspender-ledger-stand-ins.js", import.meta.url),
    "utf8"
  )
)

/**
 * The extension's built files, as `pnpm --filter … build` leaves them, and
 * the version that build is: a walk shows what was built, so a release is
 * checked against the build, and a missing build is said as one.
 */
function extension(): { readonly root: string; readonly version: string } {
  const root = join(
    dirname(require.resolve("@some-extension/suspender-ledger/package.json")),
    "dist"
  )
  let built: unknown
  try {
    built = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"))
  } catch {
    throw new Error(
      "Suspender Ledger is not built: pnpm --filter @some-extension/suspender-ledger build"
    )
  }
  return {
    root,
    version: z.object({ version: z.string() }).parse(built).version,
  }
}

function walkOf(sample: Sample): Walk {
  const { root, version } = extension()
  return {
    app: "suspender-ledger",
    version,
    page: "popup.html",
    root,
    viewport: { width: 320, height: 600 },
    sandbox: async (page: Page): Promise<void> => {
      await page.addInitScript({
        content: `(${STAND_INS})(${JSON.stringify(sample)})`,
      })
    },
    steps: [
      { label: "The popup, on a tab left idle", holdMs: 2400 },
      {
        label: "Never suspend this site",
        tap: ".action-menu__toggle-track >> nth=0",
        holdMs: 2400,
      },
      {
        label: "Suspend the tab",
        tap: "button:has-text('Suspend tab')",
        reopen: true,
        holdMs: 2400,
      },
    ],
  }
}

/** Suspender Ledger's walk, from a sample read as it was given. */
export const suspenderLedger = {
  sample: SampleSchema,
  walk: walkOf,
}
