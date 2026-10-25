import { consoleReportsMessageOnly } from "@eslint/rules/index.js"
import { defineConfig } from "eslint/config"

/** Opt-in, for a workspace whose reporter is `report` (apps/mailbox, MB3). */
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
