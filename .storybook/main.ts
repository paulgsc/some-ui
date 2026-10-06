// This file has been automatically migrated to valid ESM format by Storybook.
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "path"
import type { StorybookConfig } from "@storybook/react-vite"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

// The only stories left are the ones a required CI job loads
// (apps/www/tests/ui-fit/panel-fit.spec.ts, #1687), and all of them live under
// packages/**.
const STORIES = ["../packages/**/*.stories.@(js|jsx|mjs|ts|tsx)"]

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */

const someContentPublic = resolve(__dirname, "../packages/some-content/public")

const config: StorybookConfig = {
  stories: STORIES,
  logLevel: "error",

  staticDirs: [
    ...(existsSync(someContentPublic) ? [someContentPublic] : []),
  ],

  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
    allowedHosts: ["nixos.local"],
  },

  framework: getAbsolutePath("@storybook/react-vite"),

  viteFinal: (config) => {
    config.define = {
      ...config.define,
      "process.env": {
        STORYBOOK: JSON.stringify(process.env.STORYBOOK),
      },
    }

    config.resolve = {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        "webextension-polyfill": resolve(
          __dirname,
          "../__mocks__/webextension-polyfill.ts"
        ),
        // oxc-parser is pulled into the client graph only via unocss'
        // attributify-jsx transformer (unused here). Its `browser` entry imports
        // the wasm binding that pnpm doesn't install for native platforms, so
        // point it at a stub — the parser is never invoked in Storybook.
        "@oxc-parser/binding-wasm32-wasi": resolve(
          __dirname,
          "../__mocks__/oxc-parser-binding-stub.ts"
        ),
        "preact/hooks": "react",
        "preact/compat": "react",
        preact: "react",
      },
    }

    config.server = {
      ...config.server,
      host: "0.0.0.0", // bind all interfaces so both nixos.local + localhost resolve
      allowedHosts: ["nixos.local", "localhost", "127.0.0.1"],
    }

    // Pin an explicit build target. vite-plugin-top-level-await (pulled in via
    // the root vite.config.ts, which Storybook auto-loads from the workspace
    // root) falls back to a hardcoded legacy target list — including
    // "safari14" — whenever build.target is unset. esbuild 0.28.1 can no
    // longer downlevel destructuring for that exact "safari14" marker
    // (regression), which breaks `storybook build` repo-wide. Matches
    // tsconfig.json's ES2022 target.
    config.build = {
      ...config.build,
      target: "es2022",
    }

    // Drop vite-plugin-top-level-await, which arrives with that same
    // auto-loaded root config.
    //
    // The es2022 target above supports top-level await natively, so the
    // plugin has nothing to add here — and what it does instead is actively
    // wrong. It rewrites every module that transitively touches a TLA into a
    // `__tla` promise whose exports are assigned only after that promise
    // settles, then leaves consumer chunks importing those bindings without
    // awaiting it. The leetype wasm loader is downstream of one, so the four
    // story groups that reach it (CodeDisplay, CodeInputCard, Leetype,
    // LeetypeApp) died on `TypeError: f is not a function` — a chunk calling
    // a sibling's module-init thunk before the gate had assigned it — and
    // rendered nothing at all in a built Storybook.
    //
    // Matched by name rather than by rebuilding the plugin list, so the rest
    // of the root config (vite-plugin-wasm especially, which the same wasm
    // import does need) is untouched.
    config.plugins = (config.plugins ?? []).filter(
      (plugin) =>
        !(
          plugin &&
          typeof plugin === "object" &&
          "name" in plugin &&
          plugin.name === "vite-plugin-top-level-await"
        )
    )

    return config
  },

  typescript: {
    reactDocgen: false,
  },
}
export default config

function getAbsolutePath(value: string): string {
  // Resolve the absolute path to package.json using CommonJS-compatible method
  const pkgPath = require.resolve(join(value, "package.json"))
  return dirname(pkgPath)
}
