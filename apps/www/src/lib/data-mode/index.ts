import type { RuntimeMode } from "@some-ui/fetch-kit"

/**
 * Where this build's companion data comes from, decided once at build time:
 * *fetch, or fall back to the bundled demo seed*.
 *
 * - **`"static"`** - the GitHub Pages build. No companion data is deployed
 *   (pages.yml copies only `sfx`), so no request is issued.
 * - **`"server"`** - `vite dev`, `vite preview`, and the Docker/nginx image,
 *   which serve `public/` and proxy `file_host`.
 *
 * Not `resolveRuntimeMode`'s hostname heuristic (it guessed wrong for the LAN
 * mDNS host and a localhost preview), and not `import.meta.env.PROD` (true for
 * both Docker and Pages). `VITE_STATIC_DATA` is set only by the Pages
 * workflow, so "unset" means "this build serves public/".
 */
export const DATA_MODE: RuntimeMode =
  import.meta.env.VITE_STATIC_DATA === "true" ? "static" : "server"

/** True when this build fetches its content rather than using bundled seeds. */
export const FETCHES_CONTENT = DATA_MODE === "server"

/**
 * Whoever opens this build is a viewer, not the owner (CLAUDE.md, "two
 * mandates"): only the owner signs in, on the home network or the phone, and
 * the Pages build has neither. A viewer sees the owner's tools read-only, on
 * sample data that nothing keeps (`lib/demo`).
 */
export const VIEWER_BUILD = DATA_MODE === "static"
