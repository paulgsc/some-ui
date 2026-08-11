/**
 * Deliberately isolated from apps/www/vite.config.ts.
 *
 * The application config enables machine-local mkcert certificates when they
 * exist. That is useful for `vite dev`, but makes a black-box trace depend on
 * which developer machine launches it: the harness probes HTTP while preview
 * silently switches to HTTPS. This config serves the already-built `dist/`
 * tree over plain HTTP and has no application plugins or test introspection.
 */
import { defineConfig } from "vite"

export default defineConfig({
  preview: {
    host: "0.0.0.0",
    strictPort: true,
  },
})
