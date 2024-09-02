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
    builder: {
      name: "@storybook/builder-vite",
      options: {
        launchOptions: {
          open: false,
        },
      },
    },
  },
  addons: [
    "@storybook/addon-onboarding",
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@chromatic-com/storybook",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: (config) => {
    config.define = {
      ...config.define,
      "process.env": {},
    }
    return config
  },
}
export default config
