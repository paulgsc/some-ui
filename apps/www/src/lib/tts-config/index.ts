/**
 * Where this build's speech backend lives. Whether it resolves to
 * `openai-edge-tts` or the browser's `speechSynthesis` is `@some-ui/speech`'s
 * decision, from `mode` (its `adapters/registry`).
 *
 * The default endpoint follows the *current page*, the one rule that holds
 * across every way this app is served (localhost, a LAN mDNS name, an IP):
 * the TTS container runs beside whatever serves the page. By scheme:
 *
 * - **HTTPS page** -> the same-origin `TTS_PROXY_PATH`: a cross-origin
 *   `http://host:5050` request from an HTTPS document is mixed content, and
 *   speech goes silent with nothing in the UI to say why. nginx.https.conf
 *   and `vite dev` (vite.config.ts) proxy that path.
 * - **HTTP page** -> `http://<hostname>:5050` directly, the port
 *   `infra/compose/tts.yml` publishes (Storybook, cert-less `vite dev`, the
 *   container's port-80 listener).
 *
 * `VITE_TTS_ENDPOINT` overrides both.
 */

/** The port `infra/compose/tts.yml` publishes on the host. */
export const DEFAULT_TTS_PORT = 5050

/**
 * Same-origin prefix that reverse-proxies to the `openai-edge-tts`
 * container. Kept in step with nginx.https.conf's `location` blocks and
 * vite.config.ts's `server.proxy`.
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
 * Which rule produced the endpoint. Named because `override` fails silently:
 * a stale `VITE_TTS_ENDPOINT` (a shell, a gitignored .env.local) beats every
 * default with only a 404 as evidence. See the dev-only disclosure in
 * src/providers/tts.tsx.
 */
type TTSEndpointSource =
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
