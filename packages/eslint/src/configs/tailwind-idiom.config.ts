import { defineConfig } from "eslint/config"

import { noInterpolatedClassname } from "../rules/index.js"

/**
 * Plugin enforcing the "static class name" idiom that a single-pass Tailwind
 * content scan depends on: every class name that can appear in the DOM must
 * exist as a complete literal string in source. Dynamic *values* belong in a
 * CSS custom property consumed by a static arbitrary-value utility (see
 * packages/ui/dice-card), not fused into the class-name token itself —
 * fusing them (`bg-${color}-500`, `"bg-" + color`) works fine against a
 * per-file dev-server scan but silently loses the class in any build that
 * scans source once ahead of time instead of executing the app.
 */
export const tailwindIdiomPlugin = {
  meta: { name: "tailwind-idiom", version: "0.0.1" },
  rules: {
    "no-interpolated-classname": noInterpolatedClassname,
  },
}

export default defineConfig([
  {
    files: ["**/*.{ts,tsx,jsx}"],
    plugins: { "tailwind-idiom": tailwindIdiomPlugin },
    rules: {
      "tailwind-idiom/no-interpolated-classname": "error",
    },
  },
])
