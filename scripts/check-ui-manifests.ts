#!/usr/bin/env node
// Guardrail: every packages/ui/* workspace declares `package.json#someUi`
// (its build audience - see packages/some-vite-config/AUDIENCES.md), and every
// non-public one's `./contract` carries no implementation (A2).
//
// `audiencePlugin` already fails `vite dev`/`vite build` on a missing or
// invalid field, but only for the app being built, and CI only builds an app
// when the PR reaches it. A new workspace that no app depends on yet would
// pass its own PR and turn the next unrelated www PR red. This runs the same
// reader repo-wide on every PR, so the failure lands where it was introduced.
//
// Run through tsx against the reader's source - the same module the plugin
// runs, with nothing to build first, so `pnpm lint` works on a fresh clone.
// Wired into the root `lint` script and pr.yml's node job.
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// eslint-disable-next-line no-restricted-imports -- a root script has no path alias into a workspace's source
import {
  checkContract,
  readAudienceWorkspaces,
} from "../packages/some-vite-config/src/audience/index.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const { workspaces, problems } = readAudienceWorkspaces([
  join(root, "packages/ui"),
])

const contracts: Array<string> = []
for (const workspace of workspaces) {
  if (workspace.audience === "public") continue
  const checked = checkContract(workspace.dir)
  if (checked.exported) contracts.push(workspace.name)
  problems.push(...checked.problems)
}

if (problems.length > 0) {
  console.error(problems.join("\n\n"))
  process.exitCode = 1
} else {
  console.log(
    `check-ui-manifests: ${workspaces.length} workspaces declare an audience; ${contracts.length} contract(s) walked (${contracts.join(", ") || "none"}).`
  )
}
