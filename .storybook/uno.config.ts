import { defineSomeUiConfig } from "@some-ui/styles/config"

/**
 * UnoCSS config for Storybook.
 *
 * `content.pipeline.include` controls which files the catalog's UnoCSS instance
 * scans for utilities:
 *   - `.storybook/` — the design-system catalog stories.
 *   - `extensions/` — extensions migrated to the @some-ui/styles preset author
 *     utility classes imperatively (DOM in TS). Including their sources here makes
 *     their stories render with the same generated utilities the extension ships
 *     at runtime (the extension's own `build:css` only feeds its shadow-root
 *     bundle, not Storybook). Stray identifiers harvested from `.ts` are inert in
 *     the catalog, and preflight stays off so nothing resets the preview.
 *
 * Note on tokens: extension stories render in light DOM, so the shadow-scope
 * `:host` primitives in an extension's CSS don't apply. `--spacing` comes from
 * Tailwind v4 (`index.css`) and `--un-text-opacity` from the preset's own color
 * layer; both resolve globally in the preview.
 */
export default defineSomeUiConfig(
  {},
  {
    content: {
      pipeline: {
        include: [/\.storybook\/.*\.[jt]sx?$/, /extensions\/.*\.[jt]sx?$/],
      },
    },
  }
)
