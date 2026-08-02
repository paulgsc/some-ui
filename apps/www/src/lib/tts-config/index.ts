/**
 * Where this build's speech backend lives, and nothing else about speech.
 *
 * The app's whole say in the matter is a `SpeechConfig`: which deployment
 * this is, and where the backend is if there is one. Whether that resolves
 * to `openai-edge-tts` over HTTP or the browser's own `speechSynthesis` is
 * `@some-ui/speech`'s decision, made from `mode` - see that package's
 * `adapters/registry`.
 *
 * The default endpoint follows the *current page* rather than a fixed host,
 * because that is the one rule that holds across every way this app is
 * served: `vite dev` on localhost, the Docker image on a LAN mDNS name, a
 * colleague's machine by IP. The TTS container runs beside whatever is
 * serving the page, and this is that sentence in code.
 *
 * It replaces a hardcoded `http://nixos.local:5050/v1/audio/speech` (with a
 * hardcoded dummy API key next to it) that was baked into the provider
 * component: correct on exactly one machine, silently broken everywhere
 * else, and invisible to anyone reading the settings page.
 *
 * "Follows the page" has two halves, though, and the scheme decides which:
 *
 * - **HTTPS page** -> the same-origin `TTS_PROXY_PATH`, because a
 *   cross-origin `http://host:5050` request from an HTTPS document is
 *   mixed content and the browser blocks it outright. That was the actual
 *   failure: the topik applet on https://nixos.local:5173 went silent with
 *   nothing in the UI to say why, while the identical build on plain HTTP
 *   spoke fine. Both the www container (apps/www/nginx.https.conf) and
 *   `vite dev` (apps/www/vite.config.ts) proxy that path to the container.
 * - **HTTP page** -> `http://<hostname>:5050` directly, the port
 *   `infra/compose/tts.yml` publishes. Deliberately unchanged: Storybook,
 *   `vite dev` without local certs, and the www container's own port-80
 *   listener are all served over plain HTTP with no proxy of their own in
 *   front of them, and none of them has a mixed-content problem to solve.
 *
 * `VITE_TTS_ENDPOINT` overrides both, for deployments that front the
 * service somewhere else entirely.
 */

/** The port `infra/compose/tts.yml` publishes on the host. */
export const DEFAULT_TTS_PORT = 5050

/**
 * Same-origin prefix that reverse-proxies to the `openai-edge-tts`
 * container. Kept in step with the `location` blocks in
 * apps/www/nginx.https.conf and the `server.proxy` entry in
 * apps/www/vite.config.ts - changing it means changing all three.
 */
export const TTS_PROXY_PATH = "/api/tts"

const TTS_PATH = "/v1/audio/speech"

function endpointForCurrentHost(): string | undefined {
  if (typeof window === "undefined") return undefined
  const { hostname, protocol } = window.location
  if (protocol === "https:") return `${TTS_PROXY_PATH}${TTS_PATH}`
  return `http://${hostname}:${DEFAULT_TTS_PORT}${TTS_PATH}`
}

/**
 * Which of the three rules above produced the endpoint.
 *
 * Worth naming rather than inferring from the URL, because the one that
 * goes wrong silently is `override`: a stale `VITE_TTS_ENDPOINT` - in a
 * shell (Vite reads `VITE_*` out of `process.env`, not just .env files), a
 * gitignored apps/www/.env.local, a devshell - beats every default here by
 * design, and the only evidence in the browser is a 404 on a path nobody
 * serves. Naming the source is what makes that legible; see the dev-only
 * disclosure in src/providers/tts.tsx.
 */
export type TTSEndpointSource =
  | "override"
  | "same-origin-proxy"
  | "published-port"
  | "unavailable"

export type TTSEndpointResolution = {
  endpoint: string | undefined
  source: TTSEndpointSource
}

export function describeTTSEndpoint(): TTSEndpointResolution {
  const configured = import.meta.env.VITE_TTS_ENDPOINT
  if (configured) return { endpoint: configured, source: "override" }

  const endpoint = endpointForCurrentHost()
  if (endpoint === undefined) return { endpoint, source: "unavailable" }
  return {
    endpoint,
    source: endpoint.startsWith(TTS_PROXY_PATH)
      ? "same-origin-proxy"
      : "published-port",
  }
}

export function resolveTTSEndpoint(): string | undefined {
  return describeTTSEndpoint().endpoint
}
