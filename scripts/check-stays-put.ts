#!/usr/bin/env node
// Guardrail: HS3 (docs/ui-fit/README.md, "2j"). What counts, and what it
// cannot see, live in packages/eslint/src/stays-put.ts; the run is
// site-count.ts's. Wired into the root `lint` script and a step of pr.yml's
// `guards` job.
//
// Runs on Node's built-in type stripping: imports spell their `.ts` extension.
import { runCountedCheck } from "../packages/eslint/src/site-count.ts"
import { STAYS_PUT_CHECK } from "../packages/eslint/src/stays-put.ts"

runCountedCheck(STAYS_PUT_CHECK, process.argv.slice(2))
