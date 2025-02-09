import type { Preview } from "@storybook/react"

import "../tailwind.css"

// Import all CSS files from packages
import.meta.glob(["../packages/ui/**/*.css"], { eager: true })

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
