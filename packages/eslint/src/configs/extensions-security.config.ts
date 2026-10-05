import { defineConfig } from "eslint/config"
import globals from "globals"

import { parentRelativeDynamicImportSelectors } from "./react.config.js"

/**
 * AMO/extension security rules (#322).
 *
 * Uses only built-in ESLint rules — no TypeScript parser required.
 *
 * Its `no-restricted-syntax` replaces any earlier one (flat config overrides
 * rather than merges), so `extensionsRecommended` spreads it after
 * `maishatuRecommended` and `parentRelativeDynamicImportSelectors` is
 * restated here.
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
        // @types/chrome advertises a callback form, but Firefox supports only
        // the Promise form and throws "Incorrect argument types for
        // tabs.discard." on every callback call, a mismatch tsc cannot see
        // (see suspender-ledger/src/worker/core/discard-adapter.ts).

        {
          selector:
            "CallExpression[callee.object.object.name='chrome'][callee.object.property.name='tabs'][callee.property.name='discard'][arguments.length>1]",
          message:
            "chrome.tabs.discard(tabId, callback) throws on Firefox — its runtime only implements the Promise form. Call chrome.tabs.discard(tabId) with no callback instead.",
        },
        ...parentRelativeDynamicImportSelectors,
      ],
    },
  },
])

export default extensionsSecurityConfig
