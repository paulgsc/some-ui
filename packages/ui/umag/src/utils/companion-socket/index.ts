import { resolveLanSocketUrl } from "@some-ui/ws"

/**
 * The port `file_host` (paulgsc/server) listens on.
 *
 * A third copy of the same number, stated rather than shared: the other two
 * are `DEFAULT_FILE_HOST_PORT` in `apps/www/src/lib/file-host-config` and
 * the orchestrator's own copy in `some-ui-utils`. Hoisting it would mean a
 * new shared dependency carrying one integer to consumers that otherwise
 * agree on nothing, which `packages/SHARED_WORKSPACE_DOCTRINE.md` §1 exists
 * to refuse - the contract is stable (it has been 3000 since this package
 * had a socket at all) and the duplication costs a grep, where the sharing
 * would cost a package boundary.
 */
const FILE_HOST_PORT = 3000

/**
 * `/ws`, `file_host`'s socket endpoint. Spelled here rather than imported
 * from `@some-ui/server-routes`'s `UnversionedRoute` union because that is
 * a *type*, with no runtime value to import, and this package has no other
 * reason to depend on it.
 */
const FILE_HOST_SOCKET_PATH = "/ws"

/**
 * Where this runtime's `file_host` socket is, or `undefined` when there
 * isn't one to reach.
 *
 * Replaces the `` `ws://${window.location.hostname}:3000/ws` `` that both
 * socket-bearing components used to inline. See `resolveLanSocketUrl` for
 * the two origins that literal was silently wrong on - an HTTPS page, where
 * the handshake is blocked as mixed content before it leaves the browser,
 * and a bundled build inside a WebView, where it dials a port on the device
 * itself and reconnects on a timer forever.
 */
export function resolveCompanionSocketUrl(): string | undefined {
  return resolveLanSocketUrl(FILE_HOST_PORT, FILE_HOST_SOCKET_PATH)
}
