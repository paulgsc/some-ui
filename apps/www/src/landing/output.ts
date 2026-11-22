/**
 * Where render-landing.ts (apps/www) leaves the rendered landing for the Pages
 * build, relative to apps/www, and its shape: the two pieces vite.config.ts's
 * `landingPage` puts into landing/index.html. In node_modules' cache, so it is
 * never committed and never shipped as a file of its own.
 */
export const LANDING_FILE = "node_modules/.cache/www/landing.json"

/** The rendered `<head>` words and `<body>` content. */
export type RenderedLanding = {
  readonly head: string
  readonly body: string
}
