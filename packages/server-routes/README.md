# @some-ui/server-routes

The server's HTTP route surface, generated and checked in — nothing else.

## What's here

`src/generated/routes.ts` is produced verbatim by `paulgsc/server`'s
`cargo run --bin dump-routes -- --ts` (server#266) and never hand-edited —
the `@generated` banner at its top says so. `src/index.ts` re-exports it and
is the only hand-written source in this package.

Regenerate it from a `server` checkout (with a migrated scratch database —
`sqlx::query!` verifies against a real database at compile time):

```sh
cargo run -q --bin dump-routes -- --ts > path/to/some-ui/packages/server-routes/src/generated/routes.ts
```

`packages/contract-harness/routes.server.json` is the JSON sibling of the
same run (`dump-routes` without `--ts`) — both come from one
`RouteInventory` on the server side, so regenerate them together. This
package's `src/routes.consistency.test.ts` fails the moment the two
checked-in files disagree, so a regeneration that only touched one of them
gets caught here rather than in a 404 later.

## Why this package exists, and why it depends on nothing

`some-ui#1040` needed this union consumed by `apiUrl` in `@some-ui/fetch-kit`
— a real runtime package, shipped to `apps/www`. The union already lived
alongside `packages/contract-harness/routes.server.json`, so folding the
generated `.ts` sibling into `contract-harness` looked like the path of
least resistance, until you trace what `contract-harness` actually is: a
test-time oracle whose only runtime dependency is `zod`; every workspace
package that already depends on it does so as a `devDependency`. Making
`fetch-kit` depend on it would be runtime code depending on test tooling —
backwards layering.

`@some-ui/types` was the other candidate: already dependency-free, already
widely consumed. Rejected for a forward-looking reason — `some-ui#1042`
(CT3) exists specifically to build a lint wall between generated types and
the hand-written contract schemas that live in `contract-harness`, and its
own text names `@some-ui/types` as the _future_ home for those hand-written
schemas once they move into a shared package. Seeding `@some-ui/types` with
the generated route union now would pre-empt the exact separation CT3 is
built to enforce.

So: a third package, holding only what `dump-routes -- --ts` emits.
`@some-ui/fetch-kit` (runtime) depends on `@some-ui/server-routes` today;
`@some-ui/contract-harness` (test-time) is expected to as well once CT3
wires its own generated-type lint rule against it. Neither of those two
depends on the other, and this package depends on nothing.
