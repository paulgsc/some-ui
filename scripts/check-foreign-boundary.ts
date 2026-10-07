#!/usr/bin/env node
// Guardrail: F1 (docs/monorepo-boundaries.md, "A port translates: the
// foreign boundary"). What counts, and what it cannot see, live in
// packages/eslint/src/foreign-boundary.ts; the run is site-count.ts's. Wired
// into the root `lint` script and a step of pr.yml's `react-coordination` job.
//
// Runs on Node's built-in type stripping: imports spell their `.ts` extension.
import { FOREIGN_BOUNDARY_CHECK } from "../packages/eslint/src/foreign-boundary.ts"
import { runCountedCheck } from "../packages/eslint/src/site-count.ts"

runCountedCheck(FOREIGN_BOUNDARY_CHECK)
