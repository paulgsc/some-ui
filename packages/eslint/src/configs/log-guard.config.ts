import { consoleReportsMessageOnly } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/**
 * `console-reports-message-only`, in two settings:
 *
 *   - the default export, opt-in, for a workspace whose reporter is
 *     `report` (apps/mailbox, MB3);
 *   - `failureLogConfig`, in every preset's `src/`: the reporter is
 *     `reportFailure` (@some-ui/intent-kit), and `console` is reported
 *     everywhere, a `no-console` disable notwithstanding; `reportFailure`'s
 *     own console line carries a disable. FT1, docs/monorepo-boundaries.md.
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

export const failureLogConfig = defineConfig([
  {
    files: ["src/**/*.{js,mjs,ts,tsx,jsx}"],
    ignores: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
    plugins: { "log-guard": logGuardPlugin },
    rules: {
      "log-guard/console-reports-message-only": [
        "error",
        {
          reporter: "reportFailure",
          why: "a release build strips `console`, and the phone's console reaches nothing (docs/monorepo-boundaries.md, FT1)",
        },
      ],
    },
  },
])
