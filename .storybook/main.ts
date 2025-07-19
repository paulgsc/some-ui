import { dirname, join } from "path"
import type { StorybookConfig } from "@storybook/react-vite"

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */

const config: StorybookConfig = {
  stories: ["../packages/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  logLevel: "error",

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
