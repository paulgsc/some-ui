#!/usr/bin/env node
// Compiles src/main.typ into PDF downloads and browser-native SVG previews,
// once per (composition x template) pair, then verifies the artifacts.
//
// Binary and font resolution live in scripts/typst.mjs - see that file for why
// neither is taken from the host.
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  baseArgs,
  DEFAULT_TEMPLATE,
  inputArgs,
  outDir,
  packageDir,
  presentation,
  resolveTypst,
  sourceFile,
  stemFor,
  templates,
  variants,
} from "./typst.mjs"

// The two checks that read the PDFs back with Poppler's `pdftotext`.
const EXTRACTOR_CHECKS = ["check-ats.mjs", "check-layout.mjs"]

/**
 * Whether Poppler's `pdftotext` (or `PDFTOTEXT_BIN`) can be run at all. Only
 * "not found" counts as absent: an extractor that exists but misbehaves is
 * left for the checks themselves to report.
 */
function extractorAvailable() {
  const extractor = process.env.PDFTOTEXT_BIN ?? "pdftotext"
  return (
    spawnSync(extractor, ["-v"], { stdio: "ignore" }).error?.code !== "ENOENT"
  )
}

function renderAll(typstBin, fontPath) {
  for (const template of templates) {
    for (const variant of variants) {
      const stem = stemFor(variant, template)
      // eslint-disable-next-line no-console
      console.log(`[resume] compiling ${variant} / ${template}...`)
      for (const format of ["pdf", "svg"]) {
        const result = spawnSync(
          typstBin,
          [
            "compile",
            sourceFile,
            join(outDir, `${stem}.${format}`),
            ...baseArgs(fontPath),
            ...inputArgs({ variant, template, ...presentation[template] }),
          ],
          { stdio: "inherit" }
        )
        if (result.status !== 0) {
          throw new Error(
            `typst failed on ${stem}.${format} (exit ${result.status ?? result.signal})`
          )
        }
      }
    }
  }
}

// Fail the build if the PDFs do not expose a useful plain-text reading order,
// or if any two lines are set tighter than ordinary body leading. Both read
// the compiled artifacts back rather than inspecting the source: a term the
// layout drops and a subtitle riding up into the line above it are both
// invisible in `.typ` and obvious in the PDF.
//
// Both need Poppler's `pdftotext`, which CI's nix shell provides: missing, they
// fail in CI and are skipped with a warning locally, as
// apps/www/scripts/sync-resume.mjs does for a missing résumé build. Not
// vendored like typst (a third pinned binary for a check CI already runs),
// and not a JS extractor (it would change what "reading order" means). The
// claims check reads source data only and always runs.
function verify() {
  const checks = ["check-claims.mjs", ...EXTRACTOR_CHECKS]
  if (!extractorAvailable()) {
    const message =
      "`pdftotext` (Poppler) is not installed, so the ATS and layout checks " +
      "cannot read the rendered PDFs back. Install poppler-utils or set " +
      "PDFTOTEXT_BIN to a compatible executable."
    if (process.env["CI"]) throw new Error(message)
    // eslint-disable-next-line no-console
    console.warn(
      `[resume] WARNING: ${message} Skipping ${EXTRACTOR_CHECKS.join(" and ")} ` +
        "for this local build; CI still runs them."
    )
    checks.splice(1)
  }
  for (const check of checks) {
    execFileSync(process.execPath, [join(packageDir, "scripts", check)], {
      stdio: "inherit",
    })
  }
}

async function main() {
  const watch = process.argv.includes("--watch")
  // Start from an empty directory, and leave one behind on any failure below:
  // `documents/` is either the complete, verified set with its manifest or
  // nothing; artifacts without a manifest look built and could be restored
  // from cache. Cleared before resolving typst and the fonts too, so a
  // previous run's set cannot survive a failed rebuild and ship as current.
  if (!watch) rmSync(outDir, { recursive: true, force: true })
  const { bin: typstBin, fontPath } = await resolveTypst()

  mkdirSync(outDir, { recursive: true })

  if (watch) {
    // eslint-disable-next-line no-console
    console.log("[resume] watching the backend/rail PDF and SVG composition...")
    const watchers = ["pdf", "svg"].map((format) =>
      spawn(
        typstBin,
        [
          "watch",
          sourceFile,
          join(outDir, `resume-backend.${format}`),
          ...baseArgs(fontPath),
          ...inputArgs({
            variant: "backend",
            template: DEFAULT_TEMPLATE,
            ...presentation[DEFAULT_TEMPLATE],
          }),
        ],
        { stdio: "inherit" }
      )
    )

    const finishedWatcher = await new Promise((resolve) => {
      for (const watcher of watchers) {
        watcher.once("exit", (status) => resolve({ watcher, status }))
      }
    })
    for (const watcher of watchers) {
      if (watcher !== finishedWatcher.watcher) watcher.kill()
    }
    process.exitCode = finishedWatcher.status ?? 1
    return
  }

  try {
    renderAll(typstBin, fontPath)
    verify()
  } catch (err) {
    rmSync(outDir, { recursive: true, force: true })
    // eslint-disable-next-line no-console
    console.error(
      "[resume] removed documents/ so no unverified artifacts are left behind"
    )
    throw err
  }

  // Preserve the original public filename as the default/backend composition.
  copyFileSync(join(outDir, "resume-backend.pdf"), join(outDir, "resume.pdf"))

  // A manifest of exactly what this run produced, so
  // apps/www/scripts/sync-resume.mjs can require the full set without
  // importing this package's JS (`../` imports are banned, and the vite-config
  // build rewrites `exports`, dropping any custom subpath).
  const files = templates
    .flatMap((template) =>
      variants.map((variant) => stemFor(variant, template))
    )
    .map((stem) => `${stem}.pdf`)
    .concat("resume.pdf")
    .sort()
  writeFileSync(
    join(outDir, "manifest.json"),
    `${JSON.stringify(files, null, 2)}\n`
  )
}

main().catch((err) => {
  // `fetch()` reports every network/TLS failure as "fetch failed" and puts
  // the actionable reason (an untrusted proxy CA, DNS) only on `err.cause`.

  const cause = err.cause?.message ?? err.cause
  // eslint-disable-next-line no-console
  console.error(`[resume] ${err.message}${cause ? `: ${cause}` : ""}`)
  process.exitCode = 1
})
