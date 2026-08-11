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
