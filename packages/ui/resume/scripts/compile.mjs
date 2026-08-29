#!/usr/bin/env node
// Compiles src/main.typ into PDF downloads and browser-native SVG previews,
// once per (composition x template) pair, then verifies the artifacts.
//
// Binary and font resolution live in scripts/typst.mjs - see that file for why
// neither is taken from the host.
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"
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

async function main() {
  const watch = process.argv.includes("--watch")
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
          process.exitCode = result.status ?? 1
          return
        }
      }
    }
  }

  // Fail the build if the PDFs do not expose a useful plain-text reading order,
  // or if any two lines are set tighter than ordinary body leading. Both read
  // the compiled artifacts back rather than inspecting the source: a term the
  // layout drops and a subtitle riding up into the line above it are both
  // invisible in `.typ` and obvious in the PDF.
  for (const check of [
    "check-claims.mjs",
    "check-ats.mjs",
    "check-layout.mjs",
  ]) {
    execFileSync(process.execPath, [join(packageDir, "scripts", check)], {
      stdio: "inherit",
    })
  }

  // Preserve the original public filename as the default/backend composition.
  copyFileSync(join(outDir, "resume-backend.pdf"), join(outDir, "resume.pdf"))

  // A self-describing manifest of exactly what this run produced, so a
  // consumer (apps/www/scripts/sync-resume.mjs) can require the full set
  // before shipping any of it, without importing this package's JS across
  // a package boundary (blocked by eslint's ban on `../` imports, and
  // fragile anyway: @some-ui/vite-config's build overwrites this package's
  // package.json `exports` field wholesale on every build, which would
  // silently drop any custom export subpath added for that purpose).
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
  // eslint-disable-next-line no-console
  console.error(`[resume] ${err.message}`)
  process.exitCode = 1
})
