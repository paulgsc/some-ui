/**
 * Regression coverage for #660: the production CSP header blocked
 * WebAssembly instantiation (missing 'wasm-unsafe-eval'), breaking every
 * wasm-bindgen crate apps/www ships (hangul game, leetype, crossword,
 * viewport-rotation - all pulled in via some-ui-input).
 *
 * These tests don't boot nginx/Docker: they read the literal header string
 * from apps/www/nginx.security-headers.conf (the file both the Dockerfile
 * and nginx.https.conf `include`, so there is exactly one copy - see that
 * file's header comment) and replay it via page.route fulfilment, which
 * Chromium enforces identically to a real server response.
 *
 * The WASM/eval attempts run from an inline <script> in the served page,
 * not from page.evaluate() - Playwright's page.evaluate() executes via CDP
 * Runtime.evaluate, which Chromium's 'unsafe-eval' check exempts (a
 * DevTools-console carve-out), so it would silently pass regardless of the
 * CSP header. page.evaluate() is only used below to read back a result the
 * inline script already computed.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SECURITY_HEADERS_CONF = resolve(
  __dirname,
  "../../nginx.security-headers.conf"
)

type CSPProbeResult = {
  wasmOk: boolean
  wasmError: string | null
  evalBlocked: boolean | null
}

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- TS global augmentation requires `interface`, not `type`
  interface Window {
    __cspProbeResult?: CSPProbeResult
  }
}

function readShippedCSP(): string {
  const conf = readFileSync(SECURITY_HEADERS_CONF, "utf8")
  const match = /Content-Security-Policy\s+"([^"]+)"/.exec(conf)
  if (!match) {
    throw new Error(
      `Could not find a Content-Security-Policy header in ${SECURITY_HEADERS_CONF}`
    )
  }
  return match[1]
}

// Inline <script> (real page script, not a CDP-injected evaluate call) that
// attempts the same two operations the #660 report flagged: instantiating a
// WebAssembly module and calling the Function constructor. The smallest
// legal WASM module is just the 4-byte magic number plus a 4-byte version
// field - no imports/exports/functions required.
const PROBE_HTML = `<!DOCTYPE html>
<html>
<body>
<script>
  window.__cspProbeResult = { wasmOk: false, wasmError: null, evalBlocked: null };
  (async () => {
    try {
      const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      await WebAssembly.instantiate(bytes);
      window.__cspProbeResult.wasmOk = true;
    } catch (e) {
      window.__cspProbeResult.wasmError = String((e && e.message) || e);
    }
    try {
      new Function("return 1")();
      window.__cspProbeResult.evalBlocked = false;
    } catch (e) {
      window.__cspProbeResult.evalBlocked = true;
    }
  })();
</script>
</body>
</html>`

async function runCSPProbe(page: Page, csp: string): Promise<CSPProbeResult> {
  await page.route("**/*", (route) =>
    route.fulfill({
      body: PROBE_HTML,
      contentType: "text/html",
      headers: { "content-security-policy": csp },
    })
  )
  await page.goto("https://localhost/__csp-regression__")
  await page.waitForFunction(
    () => window.__cspProbeResult?.evalBlocked !== null
  )
  const result = await page.evaluate(() => window.__cspProbeResult)
  if (!result) {
    throw new Error("CSP probe script did not run")
  }
  return result
}

test.describe("www Content-Security-Policy", () => {
  test("the shipped header permits WebAssembly instantiation", async ({
    page,
  }) => {
    const result = await runCSPProbe(page, readShippedCSP())

    expect(result.wasmOk, result.wasmError ?? undefined).toBe(true)
  })

  test("the shipped header still blocks plain JS eval", async ({ page }) => {
    const result = await runCSPProbe(page, readShippedCSP())

    // zod's `allowsEval` capability check (a dependency pulled in by
    // apps/www) already catches this failure and falls back to a non-eval
    // path - see the header comment in nginx.security-headers.conf. This
    // assertion pins that we deliberately did NOT add 'unsafe-eval' to fix
    // #660, so a future edit can't silently widen the policy.
    expect(result.evalBlocked).toBe(true)
  })

  test("sanity: a header without wasm-unsafe-eval blocks WebAssembly (proves the assertion above is meaningful)", async ({
    page,
  }) => {
    const preFixHeader =
      "default-src 'self' http: https: data: blob: 'unsafe-inline'"

    const result = await runCSPProbe(page, preFixHeader)

    expect(result.wasmOk).toBe(false)
  })
})
