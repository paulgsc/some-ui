export type RuntimeMode = "static" | "server"

export type RuntimeModeOptions = {
  /**
   * Explicit override - always wins. Callers with a reliable build-time
   * signal (e.g. a bundler's dev/prod flag) should pass this rather than
   * lean on the hostname heuristic below, which only recognizes
   * conventional local-dev hostnames and can't distinguish a preview of a
   * production build running on localhost from an actual dev session.
   */
  mode?: RuntimeMode
  /** Hostnames treated as "server" mode. Defaults to common local-dev hosts. */
  serverHostnames?: ReadonlyArray<string>
}

const DEFAULT_SERVER_HOSTNAMES: ReadonlyArray<string> = [
  "localhost",
  "127.0.0.1",
  "[::1]",
]

/**
 * Resolves which data-source mode the current runtime should use: "static"
 * (bundled/hosted data assets, no backend - e.g. a GitHub Pages release) or
 * "server" (a local companion server is expected to be reachable).
 *
 * With no options and no `window` (SSR, tests, non-browser bundlers) this
 * conservatively resolves to "static", since assuming a reachable server
 * with no signal either way is the riskier default.
 */
export function resolveRuntimeMode(
  options: RuntimeModeOptions = {}
): RuntimeMode {
  if (options.mode) return options.mode
  if (typeof window === "undefined") return "static"

  const hostnames = options.serverHostnames ?? DEFAULT_SERVER_HOSTNAMES
  return hostnames.includes(window.location.hostname) ? "server" : "static"
}
