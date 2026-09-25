#!/usr/bin/env node
// Guardrail: every packages/ui/* workspace declares `package.json#someUi`
// (its build audience - see packages/some-vite-config/src/audience/schema.ts).
//
// `audiencePlugin` already fails `vite dev`/`vite build` on a missing or
// invalid field, but only for the app being built, and CI only builds an app
// when the PR reaches it. A new workspace that no app depends on yet would
// pass its own PR and turn the next unrelated www PR red. This runs the same
// reader repo-wide on every PR, so the failure lands where it was introduced.
//
// Imports the built reader rather than its source: the schema is zod, which
// needs an install anyway, and this keeps it byte-for-byte the code the plugin
// runs. Wired into the root `lint` script and pr.yml's node job.
/* eslint-disable no-console, no-process-exit -- a CLI guardrail: its output and exit code are its interface */
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const reader = join(
  root,
  "packages/some-vite-config/dist/esm/src/audience/index.js"
)

if (!existsSync(reader)) {
  console.error(
    "check-ui-manifests: @some-ui/vite-config is not built. Run\n" +
      "  npx turbo run build --filter=@some-ui/vite-config\n" +
      "first."
  )
  process.exit(2)
}

const { readAudienceWorkspaces } = await import(reader)
const { workspaces, problems } = readAudienceWorkspaces([
  join(root, "packages/ui"),
])

if (problems.length > 0) {
  console.error(problems.join("\n\n"))
  process.exit(1)
}
console.log(
  `check-ui-manifests: ${workspaces.length} workspaces declare an audience.`
)
