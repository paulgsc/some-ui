#!/usr/bin/env node
// usage: pnpm --filter @some-ui/topik base <groups.json>
// <groups.json> is [{"day","session"}, ...]: every reflection group the
// mailbox listing's reflections make, answered or not (ROUTINE.md, step 3).
// Prints each with its `base` and its `earlier` base, which is null when a
// scene under it answers none, or names the first entry that doesn't read.
import { readArg, withSource } from "./source.mjs"

const raw = readArg("pnpm --filter @some-ui/topik base <groups.json>")
await withSource(
  "/src/lib/topik/reflection-base/index.ts",
  ({ groupBases, readGroups }) => {
    const read = readGroups(JSON.parse(raw))
    if ("refused" in read) {
      process.stdout.write(
        `The groups don't read as [{"day":"YYYY-MM-DD","session":"<id>"}, ...]: ${read.refused} doesn't.\n`
      )
      process.exitCode = 1
      return
    }
    process.stdout.write(
      `${JSON.stringify(groupBases(read.groups), null, 2)}\n`
    )
  }
)
