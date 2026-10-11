#!/usr/bin/env node
/**
 * `web-ext lint --warnings-as-errors`, less two warnings we accept on purpose.
 *
 * Every manifest declares `gecko.data_collection_permissions` (#321), which
 * Firefox reads from 140 (142 on Android), while keeping a `strict_min_version`
 * below that: some-censor's floor of 112 is a recorded decision
 * (`extensions/some-censor/src/styles/content.css`). An older Firefox ignores
 * the key, so the linter's warning that the floor predates it is true and
 * harmless. web-ext must be on PATH.
 */

/* eslint-disable no-console, no-process-exit -- CLI gate: reports on stderr and CI reads its exit code. */
import { spawnSync } from "node:child_process"

const ACCEPTED = new Set([
  "KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION",
  "KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION",
])

const accepted = (warning) =>
  ACCEPTED.has(warning.code) &&
  String(warning.description).includes("data_collection_permissions")

const dist = process.argv[2]
if (!dist) {
  console.error("usage: web-ext-lint-gate.mjs <dist-dir>")
  process.exit(2)
}

const run = spawnSync(
  "web-ext",
  ["lint", "--source-dir", dist, "--self-hosted", "--output", "json"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
)
if (run.error) throw run.error

let report
try {
  report = JSON.parse(run.stdout)
} catch {
  console.error(run.stdout, run.stderr)
  console.error("web-ext lint did not print a JSON report")
  process.exit(1)
}

const failing = [
  ...report.errors.map((e) => ({ ...e, kind: "error" })),
  ...report.warnings
    .filter((w) => !accepted(w))
    .map((w) => ({ ...w, kind: "warning" })),
]
for (const w of report.warnings.filter(accepted)) {
  console.log(`accepted ${w.code} (${w.file ?? "?"})`)
}
for (const f of failing) {
  console.error(`${f.kind} ${f.code} ${f.file ?? ""}: ${f.message}`)
}
console.log(
  `web-ext lint: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${failing.length} failing`
)
process.exit(failing.length > 0 ? 1 : 0)
