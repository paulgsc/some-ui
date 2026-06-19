import { defineSomeUiConfig } from "@some-ui/styles/config"

/**
 * UnoCSS config for Storybook.
 *
 * Scoped deliberately: `content.pipeline.include` restricts extraction to the
 * `.storybook/` design-catalog files only. The rest of Storybook keeps using
 * the existing Tailwind pipeline (`index.css`), so wiring UnoCSS in here adds
 * the preset utilities for the catalog without touching how any other story
 * renders. preflight stays off so nothing resets the global preview.
 */
export default defineSomeUiConfig(
  {},
  {
    content: {
      pipeline: {
        include: [/\.storybook\/.*\.[jt]sx?$/],
      },
    },
  }
)
