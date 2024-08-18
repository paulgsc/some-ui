import { dirname, join } from "path"
import type { StorybookConfig } from "@storybook/react-vite"

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */
function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, "package.json")))
}
const config: StorybookConfig = {
  stories: ["../packages/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  logLevel: "error",
  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
    builder: {
      name: getAbsolutePath("@storybook/builder-vite"),
      options: {
        launchOptions: {
          open: false,
        },
      },
    },
  },
  addons: [
    getAbsolutePath("@storybook/addon-onboarding"),
    getAbsolutePath("@storybook/addon-links"),
    getAbsolutePath("@storybook/addon-essentials"),
    getAbsolutePath("@chromatic-com/storybook"),
    getAbsolutePath("@storybook/addon-interactions"),
  ],
  framework: {
    name: getAbsolutePath("@storybook/react-vite"),
    options: {},
  },
}
export default config
