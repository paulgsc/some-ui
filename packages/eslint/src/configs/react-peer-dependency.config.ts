import { defineConfig } from "eslint/config"

import { requireReactPeerDependency } from "../rules/index.js"

/**
 * Plugin enforcing the React-library externalization invariant: any workspace
 * that builds with the shared `@some-ui/vite-config` (which force-externalizes
 * react/react-dom) must declare them in `peerDependencies`, or the emitted
 * bundle can leak a runtime `require("react")` that only fails when a consumer
 * loads it. See rules/require-react-peer-dependency.ts.
 */
export const reactPeerDependencyPlugin = {
  meta: { name: "react-peer-dependency", version: "0.0.1" },
  rules: {
    "require-react-peer-dependency": requireReactPeerDependency,
  },
}

/**
 * On by default (included in maishatuRecommended). Like wasm-loader-guard this
 * isn't a style preference but a regression guard for a config invariant the
 * build system depends on — a React library with react missing from
 * peerDependencies is never intentional, and the failure is otherwise only
 * caught at runtime in a consuming app.
 */
export default defineConfig([
  {
    files: ["**/*.{js,jsx,ts,tsx,cts,mts}"],
    plugins: { "react-peer-dependency": reactPeerDependencyPlugin },
    rules: {
      "react-peer-dependency/require-react-peer-dependency": "error",
    },
  },
])
