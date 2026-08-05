#!/usr/bin/env node
/* eslint-disable no-console -- this script's output is its entire interface;
   it runs in CI and at a terminal, and has no other way to report. */
/**
 * Fail when the vendored study-nudge decision table has drifted from the
 * copy in `paulgsc/server`.
 *
 * The table is run by two test suites in two repositories so that a rule
 * changed on one side and not the other fails a test. That only holds while
 * the two copies are the same file, and nothing in either repository
 * enforces it - `paulgsc/server` cannot publish here, and one JSON file does
 * not justify a submodule or a package. So: vendored, with this check.
 *
 * The network call is the point. A check that compared the file to itself
 * would be theatre.
 *
 * Two deliberate softnesses, both to keep this from being the flaky job that
 * gets disabled:
 *
 * - **A network failure skips rather than fails.** GitHub being unreachable
 *   is not evidence of drift, and a check that reds the build over it gets
 *   turned off, which costs the guard entirely.
 * - **Several refs are tried.** The server half is on a branch until its PR
 *   lands, so `main` legitimately does not have the file yet. Matching any
 *   candidate passes, and the one that matched is printed - so the day
 *   `main` has it, the output says so and the branch entry can go.
 */
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const VENDORED = resolve(
  HERE,
  "../src/lib/study-nudge/fixtures/study-nudge-cases.json"
)

const UPSTREAM_PATH = "fixtures/study-nudge-cases.json"

/**
 * Ordered most-canonical first. Drop the branch once the server's M6 pull
 * request has merged and `main` carries the file - leaving it would let a
 * stale branch keep this green after `main` moved on.
 */
const CANDIDATE_REFS = (
  process.env.FIXTURE_UPSTREAM_REFS ||
  "main,claude/milestone-6-completion-9frk27"
)
  .split(",")
  .map((ref) => ref.trim())
  .filter(Boolean)

const rawUrl = (ref) =>
  `https://raw.githubusercontent.com/paulgsc/server/${encodeURIComponent(ref)}/${UPSTREAM_PATH}`

/** Compare parsed JSON, not bytes: formatting is not drift. */
function sameTable(a, b) {
  return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b))
}

async function main() {
  const vendored = await readFile(VENDORED, "utf8")

  const missing = []
  let reachedAny = false

  for (const ref of CANDIDATE_REFS) {
    let response
    try {
      response = await fetch(rawUrl(ref))
    } catch (error) {
      console.warn(`[fixture] could not reach ${ref}: ${error.message}`)
      continue
    }
    reachedAny = true

    if (response.status === 404) {
      missing.push(ref)
      continue
    }
    if (!response.ok) {
      console.warn(`[fixture] ${ref} answered ${response.status}`)
      continue
    }

    const upstream = await response.text()
    if (sameTable(vendored, upstream)) {
      console.log(`[fixture] vendored table matches paulgsc/server@${ref}`)
      return 0
    }

    console.error(
      `\n[fixture] the vendored decision table differs from paulgsc/server@${ref}.\n` +
        `  ${VENDORED}\n` +
        `  ${rawUrl(ref)}\n\n` +
        `  This is the check working: two implementations of one rule set have drifted.\n` +
        `  Decide which side is right and update BOTH - not just whichever is easier to\n` +
        `  edit. Changing the expectation until it is green is the one resolution that\n` +
        `  leaves the two deployments behaving differently.\n`
    )
    return 1
  }

  if (!reachedAny) {
    console.warn(
      "[fixture] no upstream ref was reachable; skipping the drift check.\n" +
        "  A network failure is not evidence of drift."
    )
    return 0
  }

  console.warn(
    `[fixture] ${UPSTREAM_PATH} is not on any of: ${missing.join(", ")}.\n` +
      "  Set FIXTURE_UPSTREAM_REFS to the branch carrying the server half."
  )
  return 0
}

// `process.exitCode` rather than `process.exit()`: nothing here is buffering
// output, but exiting by code lets Node flush and unwind normally.
process.exitCode = await main()
