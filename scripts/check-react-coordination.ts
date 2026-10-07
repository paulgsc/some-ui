#!/usr/bin/env node
// Guardrail: R1 (docs/monorepo-boundaries.md, "Inside a React package: the
// component is not the coordinator"). The rule, and why it counts rather
// than judges, live in packages/eslint/src/react-coordination.ts; the run is
// site-count.ts's. Wired into the root `lint` script and pr.yml's
// `react-coordination` job.
//
// Runs on Node's built-in type stripping: imports spell their `.ts` extension.
import { COORDINATION_CHECK } from "../packages/eslint/src/react-coordination.ts"
import { runCountedCheck } from "../packages/eslint/src/site-count.ts"

runCountedCheck(COORDINATION_CHECK)
