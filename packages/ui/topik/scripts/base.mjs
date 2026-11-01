#!/usr/bin/env node
// usage: pnpm --filter @some-ui/topik base <groups.json>
// <groups.json> is [{"day","session"}, ...]: every reflection group gathered
// from the mailbox, answered or not (ROUTINE.md, step 3). Prints each with its
// `base` and its `earlier` base, which is null when a scene under it answers none.
import { readArg, withSource } from "./source.mjs"

const raw = readArg("pnpm --filter @some-ui/topik base <groups.json>")
await withSource(
  "/src/lib/topik/reflection-base/index.ts",
  ({ groupBases, readGroups }) => {
    const groups = readGroups(JSON.parse(raw))
    if (groups === null) {
      process.stdout.write(
        'The groups don\'t read as [{"day":"YYYY-MM-DD","session":"<id>"}, ...].\n'
      )
      process.exitCode = 1
      return
    }
    process.stdout.write(`${JSON.stringify(groupBases(groups), null, 2)}\n`)
  }
)
