import { defineConfig } from "eslint/config"
import globals from "globals"

/**
 * AMO/extension security rules (#322).
 *
 * Uses only built-in ESLint rules — no TypeScript parser required.
 *
 * NOTE: This config defines `no-restricted-syntax` patterns. If your workspace
 * config also enables `no-restricted-syntax` (e.g. from maishatuRecommended),
 * spread this config AFTER the base preset and add any base patterns you need
 * to preserve, since flat-config rule entries override rather than merge.
 */
const extensionsSecurityConfig = defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,cts,mts}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        browser: "readonly",
        chrome: "readonly",
      },
    },
    rules: {
      // ── Remote code execution — immediate AMO block ──────────────────────
      "no-eval": "error",
      "no-new-func": "error",

      // Catches setTimeout(string, delay) / setInterval(string, delay)
      "no-implied-eval": "error",

      // ── XSS ─────────────────────────────────────────────────────────────
      "no-restricted-properties": [
        "error",
        {
          object: "document",
          property: "write",
          message:
            "document.write() is an XSS vector and is not allowed in extension code.",
        },
      ],

      // ── Cross-browser compat: prefer browser.* ────────────────────────
      "no-restricted-globals": [
        "warn",
        {
          name: "chrome",
          message:
            "Use browser.* instead of chrome.* for Firefox cross-browser compatibility (AMO requirement).",
        },
      ],

      // ── Hardcoded plaintext URLs + remote dynamic imports ────────────────
      // esquery regex attribute selectors are supported by ESLint's AST engine.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^http:\\/\\//]",
          message:
            "Hardcoded http:// URLs are not allowed in extension source. Use https:// or a relative path.",
        },
        {
          selector: "ImportExpression > Literal[value=/^https?:\\/\\//]",
          message:
            "Dynamic imports from remote URLs are an immediate AMO block. Bundle all dependencies locally.",
        },
        // @types/chrome advertises chrome.tabs.discard(tabId, callback), but
        // Firefox's actual runtime implementation of chrome.tabs.discard only
        // supports the Promise form (its native schema is
        // browser.tabs.discard(tabIds), no callback parameter at all) — the
        // callback form throws "Incorrect argument types for tabs.discard."
        // synchronously, on every call, regardless of tab state. This is a
        // types-vs-runtime mismatch tsc cannot catch on its own (see
        // suspender-ledger/src/worker/core/discard-adapter.ts). Call with
        // only a tabId and treat the return value as a Promise instead —
        // that form works on both engines.
        {
          selector:
            "CallExpression[callee.object.object.name='chrome'][callee.object.property.name='tabs'][callee.property.name='discard'][arguments.length>1]",
          message:
            "chrome.tabs.discard(tabId, callback) throws on Firefox — its runtime only implements the Promise form. Call chrome.tabs.discard(tabId) with no callback instead.",
        },
      ],
    },
  },
])

export default extensionsSecurityConfig
