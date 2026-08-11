# Network-shape trace

This Playwright-driven harness starts the **built** application with `vite
preview`, operates it exclusively through browser-visible routes and controls,
and records requests and responses observed on the wire. It does not import,
mock, or inspect application modules.

## Usage

Build the server-mode app with the fixture backend URL, then capture or compare:

```sh
VITE_FILE_HOST_ENDPOINT=http://127.0.0.1:4180/api/v1 pnpm --filter www build
pnpm test:network-trace -- --baseline # replace committed snapshots
pnpm test:network-trace              # report a delta table; always exits zero
pnpm test:network-trace -- --check   # fail when request count/depth drift
```

The runner owns its preview process and defaults to
`http://127.0.0.1:4173`. It uses an isolated, HTTP-only Vite preview config so
machine-local mkcert files cannot silently change the protocol. To use a local
hostname or different ports, pass origins explicitly; a missing `http://`
prefix is accepted and normalized:

```sh
NETWORK_TRACE_APP_ORIGIN=nixos.local:5173 \
NETWORK_TRACE_API_ORIGIN=nixos.local:4180 \
pnpm test:network-trace
```

When overriding the API origin, build with the same value in
`VITE_FILE_HOST_ENDPOINT` (including `/api/v1`); the harness intentionally runs
the artifact already in `dist/` rather than rebuilding it behind the scenes.

The preview binds on all interfaces but is always driven through the configured
origin. If it exits during startup, the runner reports its exit code immediately
instead of replacing the real failure with a generic readiness timeout.

Every scenario gets a fresh browser context and seedable `localStorage`. The
snapshot records request count, response bytes, time until primary route content
is ready, and the longest serial chain reconstructed solely from request-start
and response timestamps.

## Fixed scenarios

- fresh server-mode load with 0 local sessions;
- first server-mode load with 1, 10, and 50 local sessions awaiting migration;
- direct Honeycomb and Topik session navigation;
- opening the scene-library picker;
- dashboard load with a slow `GET /sessions`;
- dashboard load with a failing `GET /sessions`.

The fixture HTTP server is deliberately outside the application and represents
the real file-host boundary. Scenario setup may seed browser or server state,
but measurement begins only when browser navigation begins.

## Non-goal

This is **not** Lighthouse or a Web-Vitals/rendering-performance suite. It
measures wire-level request shape only; `timeToReadyMs` marks when primary route
content becomes observable so network work has an end point, not how quickly the
browser paints it.
