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
    builder: "@storybook/builder-vite",
  },

  addons: [
    "@storybook/addon-onboarding",
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@chromatic-com/storybook",
    "@storybook/addon-interactions",
    "@chromatic-com/storybook",
  ],

  framework: "@storybook/react-vite",

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
