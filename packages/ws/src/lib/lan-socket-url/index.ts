/**
 * The `ws://<this host>:<port><path>` URL for a companion server sitting
 * beside the page - or `undefined` when this origin has no business
 * opening one.
 *
 * Every caller of this used to inline the same template literal:
 *
 * ```ts
 * url: `ws://${window.location.hostname}:3000/ws`
 * ```
 *
 * which is correct on exactly one kind of origin - a plain-HTTP page on the
 * LAN box that also runs the companion server - and quietly wrong on every
 * other. Two ways it was wrong, both of which fail as "the socket just
 * never connects" rather than as anything that names the cause:
 *
 * 1. **An HTTPS page.** A `ws://` handshake from an HTTPS document is mixed
 *    content and the browser blocks it before it reaches the network. This
 *    is the same failure `apps/www/src/lib/file-host-config` exists to
 *    document for `fetch`, one transport over: no server-side change can
 *    fix it, because the request never leaves the page. `wss://` is not a
 *    substitute here - the companion server speaks plain HTTP, so there is
 *    nothing to upgrade to, and a page served over HTTPS is reaching it
 *    through a reverse proxy under its own origin or not at all.
 *
 * 2. **A page with no LAN behind it at all** - a bundled build running
 *    inside a WebView (`https://localhost`), a static deploy, SSR. Here
 *    `window.location.hostname` resolves to something real and the URL is
 *    syntactically fine, so `WebSocketManager` dials it, fails, and
 *    reconnects on a timer forever. On a phone that is a background
 *    battery drain with no visible symptom, which is the case worth
 *    refusing loudest.
 *
 * So the rule is the narrow one: **plain-HTTP origin only**. Anything else
 * gets `undefined`, which `useWebSocket` takes as "do not connect" rather
 * than as an error - see its `url` option.
 *
 * Deliberately takes the port and path rather than knowing them. This
 * package coordinates sockets; which port `file_host` listens on is its
 * caller's knowledge, and baking it in here would couple a generic
 * transport to one application's deployment.
 */
export function resolveLanSocketUrl(
  port: number,
  path: string
): string | undefined {
  if (typeof window === "undefined") return undefined

  const { protocol, hostname } = window.location
  if (protocol !== "http:") return undefined

  return `ws://${hostname}:${port}${path.startsWith("/") ? path : `/${path}`}`
}
