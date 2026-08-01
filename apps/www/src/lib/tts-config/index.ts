/**
 * Where this build's speech backend lives, and nothing else about speech.
 *
 * The app's whole say in the matter is a `SpeechConfig`: which deployment
 * this is, and where the backend is if there is one. Whether that resolves
 * to `openai-edge-tts` over HTTP or the browser's own `speechSynthesis` is
 * `@some-ui/speech`'s decision, made from `mode` - see that package's
 * `adapters/registry`.
 *
 * `DEFAULT_TTS_PORT` is the port `infra/compose/tts.yml` publishes. The
 * default endpoint is built from the *current page's* hostname rather than
 * a fixed host, because that is the one rule that holds across every way
 * this app is served: `vite dev` on localhost, the Docker image on a LAN
 * mDNS name (https://nixos.local:8443), a colleague's machine by IP. The
 * TTS container runs beside whatever is serving the page, and this is that
 * sentence in code.
 *
 * It replaces a hardcoded `http://nixos.local:5050/v1/audio/speech` (with a
 * hardcoded dummy API key next to it) that was baked into the provider
 * component: correct on exactly one machine, silently broken everywhere
 * else, and invisible to anyone reading the settings page.
 *
 * `VITE_TTS_ENDPOINT` overrides it outright, for deployments that front the
 * service somewhere else.
 */

export const DEFAULT_TTS_PORT = 5050

const TTS_PATH = "/v1/audio/speech"

/**
 * Plain HTTP on purpose: the compose service terminates no TLS. A page
 * served over HTTPS therefore needs `VITE_TTS_ENDPOINT` pointed at a TLS
 * front-end, since the browser would block the mixed-content request.
 */
function endpointForCurrentHost(): string | undefined {
  if (typeof window === "undefined") return undefined
  return `http://${window.location.hostname}:${DEFAULT_TTS_PORT}${TTS_PATH}`
}

export function resolveTTSEndpoint(): string | undefined {
  const configured = import.meta.env.VITE_TTS_ENDPOINT
  if (configured) return configured
  return endpointForCurrentHost()
}
