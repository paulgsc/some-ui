/**
 * Emits `ACTIVITY_CATALOG` (packages/activity-catalog/src/lib/catalog.ts) as
 * JSON on stdout.
 *
 * Mirrors `dump-routes` in the server repo
 * (`apps/servers/file_host/src/bin/dump_routes.rs`, `cargo run --bin
 * dump-routes`) for the opposite direction: that one turns the server's
 * route surface into an artifact the client can diff against; this one does
 * the same for the client's activity catalogue, so the server
 * (`paulgsc/server#270`) has something to diff its seed migration against
 * instead of trusting a hand transcription.
 *
 * `toSceneProps` never appears in the output. It's a closure, and JSON has
 * no way to represent one — `JSON.stringify` drops a function-valued
 * property the same way it drops `undefined`, which is exactly the boundary
 * the server-side schema draws too (`toSceneProps` has no column; see that
 * migration's own comment and CAT4/#272).
 *
 * Usage:
 *
 *   pnpm dump:activity-catalog > activity-catalog.snapshot.json
 *
 * The server keeps its copy in
 * `paulgsc/server@crates/db/activity/testdata/activity_catalog.snapshot.json`.
 * Every server PR's `routes.yml` runs this script and compares the output
 * with that copy (`scripts/check_client_fixtures.py`), so a copy that falls
 * behind fails there, by field.
 */
import {
  ACTIVITY_CATALOG,
  ACTIVITY_IDS,
} from "../packages/activity-catalog/src/lib/catalog.ts"

const ordered = ACTIVITY_IDS.map((id) => ACTIVITY_CATALOG[id])
process.stdout.write(`${JSON.stringify(ordered, null, 2)}\n`)
