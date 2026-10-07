/**
 * A release build strips `console.*` calls (build.minify.ts), and a failure
 * `reportFailure` reports must survive that: in a browser, its console line
 * is the only trace a person or a developer gets. So `@some-ui/intent-kit`
 * as built is minified exactly as a release minifies it, then run.
 *
 * This is the check that `reportFailure`'s `globalThis.console` form, which
 * the minifier leaves alone, has not been tidied back to a bare `console`,
 * which it removes; and that the minifier has not started removing both.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { RELEASE_MINIFY } from "@/build.minify"
import type * as IntentKit from "@some-ui/intent-kit"
import { minifySync } from "vite"
import { afterEach, describe, expect, it, vi } from "vitest"

const dir = mkdtempSync(join(tmpdir(), "release-console-"))
afterEach(() => {
  vi.restoreAllMocks()
})

describe("a reported failure in a release build", () => {
  it("still reaches the console after the release minifier", async () => {
    const built = createRequire(import.meta.url).resolve("@some-ui/intent-kit")
    const { code } = minifySync(
      "intent-kit.es.js",
      readFileSync(built, "utf8"),
      RELEASE_MINIFY
    )
    // These options do strip a bare call, or this would prove nothing.
    const probe = minifySync(
      "probe.js",
      'export function f() { console.error("probe") }',
      RELEASE_MINIFY
    )
    expect(probe.code).not.toContain("probe")
    const file = join(dir, "intent-kit.min.mjs")
    writeFileSync(file, code)
    try {
      const kit: typeof IntentKit = await import(
        /* @vite-ignore */ pathToFileURL(file).href
      )
      const console = vi
        .spyOn(globalThis.console, "error")
        .mockImplementation(() => undefined)
      const cause = new Error("the platform's words")
      kit.reportFailure({
        port: "a port",
        error: {
          kind: "unknown",
          retryable: true,
          summary: "It broke.",
          cause,
        },
      })
      expect(console).toHaveBeenCalledWith(
        kit.FOREIGN_FAILURE_TAG,
        "[a port] unknown: It broke.",
        cause
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
