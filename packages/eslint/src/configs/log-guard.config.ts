import { consoleReportsMessageOnly } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * `console-reports-message-only`: a workspace whose logs must not carry a
 * secret has one reporter, and it logs strings and an error's `message`
 * only. See the rule's own header for what passes.
 *
 * Opt-in, for a workspace that names its reporter `report` (apps/mailbox,
 * invariant MB3):
 *
 *   import { logGuardConfig } from "@some-ui/eslint-kit"
 *   export default defineConfig([...someUIEslint, ...logGuardConfig])
 */
export const logGuardPlugin = {
  meta: { name: "log-guard", version: "0.0.1" },
  rules: {
    "console-reports-message-only": consoleReportsMessageOnly,
  },
}

export default defineConfig([
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    ignores: ["**/*.test.*", "**/__tests__/**"],
    plugins: { "log-guard": logGuardPlugin },
    rules: {
      "log-guard/console-reports-message-only": [
        "error",
        { reporter: "report" },
      ],
    },
  },
])
