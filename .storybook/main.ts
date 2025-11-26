import { dirname, join, resolve } from "path"
import type { StorybookConfig } from "@storybook/react-vite"

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */

const config: StorybookConfig = {
  stories: [
    "../packages/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../extensions/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  logLevel: "error",

  staticDirs: ["../packages/ui/honeycomb/public"],

  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
  },

  addons: [
    getAbsolutePath("@storybook/addon-onboarding"),
    getAbsolutePath("@storybook/addon-links"),
    getAbsolutePath("@chromatic-com/storybook"),
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
