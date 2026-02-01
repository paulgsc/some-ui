// This file has been automatically migrated to valid ESM format by Storybook.
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "path"
import type { StorybookConfig } from "@storybook/react-vite"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const require = createRequire(import.meta.url)

const workspace = process.env.STORYBOOK_WORKSPACE
const scope = process.env.STORYBOOK_SCOPE // e.g. "packages" | "extensions"
const exclude = (process.env.STORYBOOK_EXCLUDE ?? "").split(",").filter(Boolean)

// GitHub Pages base path (set your repo name here)
const GITHUB_PAGES_BASE = process.env.STORYBOOK_BASE_PATH || ""

function storyGlobs(): Array<string> {
  let base: Array<string>

  if (workspace) {
    // Target a single workspace
    base = [
      `../packages/ui/${workspace}/**/*.stories.@(js|jsx|mjs|ts|tsx)`,
      `../extensions/${workspace}/**/*.stories.@(js|jsx|mjs|ts|tsx)`,
    ]
  } else if (scope === "packages") {
    base = ["../packages/**/*.stories.@(js|jsx|mjs|ts|tsx)"]
  } else if (scope === "extensions") {
    base = ["../extensions/**/*.stories.@(js|jsx|mjs|ts|tsx)"]
  } else {
    // Default: everything (current behavior)
    base = [
      "../packages/**/*.stories.@(js|jsx|mjs|ts|tsx)",
      "../extensions/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    ]
  }

  // Exclusion safety valve
  const excluded = exclude.map(
    (name) => `!../**/${name}.stories.@(js|jsx|mjs|ts|tsx)`
  )

  return [...base, ...excluded]
}

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */

const someContentPublic = resolve(__dirname, "../packages/some-content/public")

const config: StorybookConfig = {
  stories: storyGlobs(),
  logLevel: "error",

  staticDirs: existsSync(someContentPublic) ? [someContentPublic] : [],

  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
  },

  addons: [
    getAbsolutePath("@storybook/addon-onboarding"),
    getAbsolutePath("@storybook/addon-links"),
    getAbsolutePath("@chromatic-com/storybook"),
    getAbsolutePath("@storybook/addon-docs"),
  ],

  framework: getAbsolutePath("@storybook/react-vite"),

  viteFinal: (config) => {
    config.define = {
      ...config.define,
      "process.env": {
        STORYBOOK: JSON.stringify(process.env.STORYBOOK),
      },
    }

    // Set base path for GitHub Pages
    if (GITHUB_PAGES_BASE) {
      config.base = GITHUB_PAGES_BASE
    }

    config.resolve = {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        "webextension-polyfill": resolve(
          __dirname,
          "../__mocks__/webextension-polyfill.ts"
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

    return config
  },

  docs: {},

  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
}
export default config

function getAbsolutePath(value: string): string {
  // Resolve the absolute path to package.json using CommonJS-compatible method
  const pkgPath = require.resolve(join(value, "package.json"))
  return dirname(pkgPath)
}
