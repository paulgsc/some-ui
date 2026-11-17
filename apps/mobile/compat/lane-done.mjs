#!/usr/bin/env node
// Whether the lanes' run a pull joined has finished reading, for
// android-compat.yml's storm scenario (CS1, #3134).
//
//   node apps/mobile/compat/lane-done.mjs <all.json> <single.json> <pull-at-ms> <budget.json> [--lanes-only]
//
// With --lanes-only, the page's own reads (budget.pageReads) are left out:
// a pull cut short by going home never reads its page again (HERD2), so
// only the lanes' routes say whether the lanes' run finished.
//
// A pull joins the kept lanes' run already under way (HERD1), and that run
// may send its queued writes before it reads again: drain turns, one pace
// apart (HERD's owner on #3134). So a pull is judged by its run finishing,
// not by its own "pull checked" line: after <pull-at-ms> (the stub's clock),
// home must hear again every GET route the single pull read (<single.json>,
// the stub's /counts for that phase), and the last of them no later than
// one pace (sustainedMs, plus toleranceMs) per request home heard from the
// pull until then.
//
// Prints one line and exits: 0 "done", 1 "late: ..." (finished, but slower
// than the pace allows), 2 "pending: ..." (not finished yet), 3 "error: ..."
// (no log, single pull or budget to read), never 1, so a check that could
// not run is never told as the app's pace.
import { readFileSync } from "node:fs"

function main() {
  const [allFile, singleFile, pullAtArg, budgetFile, mode] =
    process.argv.slice(2)
  const pullAt = Number(pullAtArg)
  if (!allFile || !singleFile || !budgetFile || !Number.isFinite(pullAt)) {
    throw new Error(
      "usage: lane-done.mjs <all.json> <single.json> <pull-at-ms> <budget.json>"
    )
  }
  const { requests } = JSON.parse(readFileSync(allFile, "utf8"))
  const { byRoute } = JSON.parse(readFileSync(singleFile, "utf8"))
  const budget = JSON.parse(readFileSync(budgetFile, "utf8"))
  const { sustainedMs } = budget
  const toleranceMs = budget.afterBusy?.toleranceMs
  const pageReads = new Set(
    mode === "--lanes-only" ? (budget.pageReads ?? []) : []
  )
  if (mode === "--lanes-only" && pageReads.size === 0) {
    throw new Error("lane-done.mjs: --lanes-only needs budget.pageReads")
  }
  const wanted = Object.keys(byRoute ?? {}).filter(
    (key) => key.startsWith("GET ") && !pageReads.has(key)
  )
  // An empty or malformed input would read as finished at once.
  if (
    !Array.isArray(requests) ||
    wanted.length === 0 ||
    typeof sustainedMs !== "number" ||
    typeof toleranceMs !== "number"
  ) {
    throw new Error(
      "lane-done.mjs: no request log, single pull or budget to read"
    )
  }

  const after = requests
    .filter((r) => r.at >= pullAt)
    .sort((a, b) => a.at - b.at)
  const missing = new Set(wanted)
  let finished = -1
  for (let i = 0; i < after.length && missing.size > 0; i += 1) {
    missing.delete(after[i].key)
    if (missing.size === 0) finished = i
  }

  if (finished < 0) {
    process.stdout.write(
      `pending: not read again yet: ${[...missing].join(", ")}\n`
    )
    process.exitCode = 2
  } else {
    const took = after[finished].at - pullAt
    const allowed = (finished + 1) * (sustainedMs + toleranceMs)
    if (took > allowed) {
      process.stdout.write(
        `late: read again ${took} ms after the pull, over ${allowed} ms for ${finished + 1} requests at one pace each\n`
      )
      process.exitCode = 1
    } else {
      process.stdout.write(
        `done: read again ${took} ms after the pull, ${finished + 1} requests\n`
      )
      process.exitCode = 0
    }
  }
}

try {
  main()
} catch (error) {
  // Ignored: reported as "could not check" (3), never as the app's pace (1).
  process.stdout.write(
    `error: ${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 3
}
