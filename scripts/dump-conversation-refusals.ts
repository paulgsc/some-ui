/**
 * Emits the conversation record's step as a corpus (`conversationCorpus`,
 * `packages/video-render/src/conversation-corpus.ts`) as JSON on stdout.
 *
 * Mirrors `dump-session-duration-policy.ts` in this same directory, for the
 * same reason: the server ports the record's structural rules into Rust
 * (`paulgsc/server` `conversation_repo::step`, HOST16-S) rather than
 * importing TypeScript, and a port with no way to notice drift is a hope.
 * The server keeps a copy at
 * `crates/db/conversation/testdata/conversation_refusals.snapshot.json`,
 * its step's tests replay every case, and its
 * `scripts/check_client_fixtures.py` fails a copy that is not this dump.
 *
 * Usage:
 *
 *   pnpm -s dump:conversation-refusals > conversation_refusals.snapshot.json
 */
// eslint-disable-next-line no-restricted-imports -- see comment above
import { conversationCorpus } from "../packages/video-render/src/conversation-corpus.ts"

process.stdout.write(`${JSON.stringify(conversationCorpus())}\n`)
