#!/usr/bin/env node
// usage: pnpm --filter @some-ui/topik check:phrase <proposal.json>
// Prints [] when the app's own checkProposal finds nothing in the proposed
// phrase (KP5, #2854), else its shape error or every fault. Exits 0 only on [].
import { readArg, withSource } from "./source.mjs"

const raw = readArg("pnpm --filter @some-ui/topik check:phrase <proposal.json>")
await withSource("/src/lib/topik/phrases/proposal.ts", ({ checkProposal }) => {
  const r = checkProposal(JSON.parse(raw))
  process.stdout.write(`${r.ok ? JSON.stringify(r.faults) : r.error}\n`)
  process.exitCode = r.ok && r.faults.length === 0 ? 0 : 1
})
