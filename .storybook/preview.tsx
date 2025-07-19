import type { Preview } from "@storybook/react-vite"

import "../tailwind.css"

import { withReactQuery } from "./storybook-decorator"

// Import all CSS files from packages
import.meta.glob(["../packages/ui/**/*.css"], { eager: true })

export const decorators = [withReactQuery]

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },

  tags: ["autodocs"],
}

export default preview
