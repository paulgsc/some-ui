/**
 * Emits the `/2` Rust Rounds sample week (`TALLOWBROOK_WEEK_FILE`,
 * packages/ui/rust-rounds/src/lib/sample-week/tallowbrook.ts) as JSON on
 * stdout, as `dump:activity-catalog` does for the activity catalogue.
 *
 * Usage:
 *
 *   pnpm dump:rust-week-sample > rust-week-sample.json
 *
 * The server keeps its copy in
 * `paulgsc/server@crates/db/rust_round/testdata/rust-week-2026-w47.json`
 * (paulgsc/server#1001). A later server PR pairs the two in its
 * `scripts/check_client_fixtures.py`, so home's reading of `/2` is tested
 * against the week this repo writes, not a hand transcription.
 */
import { TALLOWBROOK_WEEK_FILE } from "../packages/ui/rust-rounds/src/lib/sample-week/tallowbrook.ts"

process.stdout.write(`${JSON.stringify(TALLOWBROOK_WEEK_FILE, null, 2)}\n`)
