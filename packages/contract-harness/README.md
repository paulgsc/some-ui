# `@some-ui/contract-harness`

An oracle for the client/server boundary. You write down the I/O you expect;
it tells you whether the running server agrees.

This exists for one workflow: you moved the Rust server, you moved the React
client to match, and you want to know whether they actually still fit — without
clicking through the app.

```sh
pnpm --filter @some-ui/contract-harness contract
```

## What it checks

Two layers, cheapest first.

**1. Route drift** — no server needed.

The server repo emits its own route table (`make routes` →
`routes.server.json`, checked in here). Every contract is compared against it.
A contract targeting a path the server no longer serves fails here, by name,
instead of surfacing later as an anonymous 404.

**2. Conformance** — needs a running server.

Each contract's request is sent for real and the response is compared to what
the contract says it should be. Beyond ordinary validation, this reports two
things `schema.parse()` structurally cannot:

| Finding         | What happened                                              | Why validation misses it           |
| --------------- | ---------------------------------------------------------- | ---------------------------------- |
| `unknown-field` | Server sent a field the contract doesn't declare           | zod silently strips unknown keys   |
| `phantom-field` | Contract declares an optional field the server never sends | An absent optional is always valid |

Both are warnings, not failures — they mean "the other side moved and you
haven't caught up", which is information, not breakage. Set
`unknownFields: "reject"` on a contract where the payload shape _is_ the
contract.

There is a live example of the second kind right now. `MoodEventSchema` in
`packages/ui/nfl/src/hooks/hopium/use-hopium-queries.ts` declares
`time: z.string().optional()`; the server's `MoodEvent`
(`crates/db/mood_event/src/core/model.rs`) has no `time` field at all. Because
it's optional, every response validates and the drift has been invisible.

## The loop

```
  server repo                             client repo
  ───────────                             ───────────
  change a route
        │
        ├── cargo test -p file_host --lib routes::inventory
        │     ↑ fails if you renamed a route and didn't
        │       update src/routes/inventory.rs
        │
        └── make routes ──► routes.server.json ──┐
                                                 ▼
                                        packages/contract-harness/
                                                 │
                                                 ├── pnpm contract:drift
                                                 │     ↑ which contracts does
                                                 │       the rename break?
                                                 │
                                                 └── pnpm contract
                                                       ↑ does the live server
                                                         still answer the way
                                                         the client expects?
```

The diff on `routes.server.json` is the reviewable record of what moved.

## Usage

```sh
# both layers, against the default server
pnpm --filter @some-ui/contract-harness contract

# structural check only — no server required, fast
pnpm --filter @some-ui/contract-harness contract:drift

# what isn't covered yet
pnpm --filter @some-ui/contract-harness contract:coverage

# point somewhere else
pnpm --filter @some-ui/contract-harness contract --base-url http://localhost:3000

# one module or one contract
pnpm --filter @some-ui/contract-harness contract --only tabs
pnpm --filter @some-ui/contract-harness contract --only mood_events.list
```

Flags: `--base-url`, `--routes`, `--only`, `--drift-only`,
`--include-mutations`, `--show-uncovered`, `--timeout`, `--json`, `--help`.
`CONTRACT_BASE_URL` works instead of `--base-url`.

Exit code is non-zero for drift failures, failed probes and transport errors.
Warnings do not fail the run.

### Read-only by default

Contracts marked `mutates: true` are skipped unless you pass
`--include-mutations`, so pointing this at a server holding data you care about
is safe by default rather than safe by remembering.

## Refreshing the route snapshot

In the **server** repo:

```sh
# the build needs a migrated SQLite file because sqlx checks queries at compile time
DATABASE_URL="sqlite://$PWD/dev.db" make routes
```

then copy `routes.server.json` into this package. The server's own test
(`routes::inventory::inventory_matches_route_sources`) guarantees the snapshot
describes the routers that actually exist — it parses the `routes/*.rs` sources
and fails if the declaration and the `.route(...)` calls disagree in either
direction.

## Writing a contract

```ts
import { z } from "zod"

import { defineContract } from "../src/contract"

export const contracts = [
  defineContract({
    id: "tabs.summaries",
    module: "tabs",
    method: "GET",
    path: "/tabs/summaries", // as the server registers it; no /api/v1
    summary: "lightweight tab list — no content blobs",
    expect: { status: 200, schema: z.array(TabSummarySchema) },
  }),
]
```

Then add the file to `src/registry.ts`. Contracts are listed explicitly rather
than globbed: a contract file that fails to load would otherwise vanish from the
run and leave a smaller, entirely green report — the worst possible failure mode
for a tool whose job is to tell you something is missing.

Parameterised routes keep the template and bind separately:

```ts
path: "/mood_events/:id",
request: { path: { id: 1 } },
```

An unbound `:id` is reported rather than requested, because a request for the
literal path `/mood_events/:id` comes back as a 404 that reads like a missing
route and sends you to the wrong side of the boundary.

When a contract accepts both a success and a miss, say which one the schema
describes:

```ts
expect: { status: [200, 404], schemaFor: 200, schema: MoodEventSchema },
```

## Deliberate limits

Worth knowing before trusting a green run.

- **Contracts are written by hand, not generated.** Generating them from the
  Rust types or from the client's call sites would make the check circular: a
  generated expectation agrees with its source by construction. A contract
  states what the _client believes_; the runner finds out if the server agrees.

- **Contract schemas are copies of the client's schemas.** The client's live
  schemas sit inside React packages, and a Node CLI shouldn't boot a UI stack to
  ask the server a question. The next step is hoisting shared response schemas
  into `@some-ui/types` (no React dependency) so the hook and the contract share
  one declaration — that removes the copy without making the check circular,
  since the server side still comes from the wire.

- **Coverage is 15 of 52 routes.** Not a gap to close for its own sake; the
  valuable contracts are the ones on boundaries that actually move. Run
  `contract:coverage` to see what's unwritten.

- **This is not a browser test.** Requests go server-to-server, deliberately.
  The tabs and mood-event routes pin CORS to a single origin, so a
  browser-origin runner would be blocked from most of the surface and would be
  reporting on CORS policy as much as on the handshake. A Playwright layer that
  drives the real UI is a reasonable thing to add _above_ this — it answers
  "does the product work", where this answers "do the two sides still fit".

  There is now one such layer, for the case where the gap between those two
  questions is widest: `apps/www/tests/study-nudge/service-worker.spec.ts`.
  Every push contract here can be green while no notification is ever shown,
  because the last hop — push service to `public/sw.js` to a desktop — is
  three hops this runner does not make. That spec drives the real worker in a
  real Chromium with a real push. Run it with `pnpm --filter www test:sw`.

- **Findings are only as good as the data.** A contract whose response is an
  empty collection reports `no-samples` rather than passing quietly, but it
  still proved nothing about field shapes.

- **Unions, records and tuples are not audited for unknown fields.** There's no
  single declared shape to diff against. Those paths are listed as
  `opaque-subtree` so a report says what it didn't look at.

## Tests

```sh
pnpm --filter @some-ui/contract-harness test
```

48 tests. The integration suite stands up a real HTTP server and drives each
detector against a concrete divergence — a renamed field, a widened type, a
moved route, a phantom optional — because a drift detector nobody has watched
fail is just a green light with extra steps.
