#!/usr/bin/env node
// Compiles resume.typ -> dist/resume.pdf.
//
// Tool acquisition is deliberately outside the build. `nix develop` provides
// the Typst CLI from the flake's locked nixpkgs revision; non-Nix callers must
// provision it before invoking this script. A build step must not download and
// execute a release artifact: that makes an ordinary compile network-dependent
// and moves supply-chain policy into application code.
import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceFile = join(packageDir, "resume.typ")
const outFile = join(packageDir, "dist", "resume.pdf")

function main() {
  const watch = process.argv.includes("--watch")

  mkdirSync(dirname(outFile), { recursive: true })

  const args = [watch ? "watch" : "compile", sourceFile, outFile]
  // eslint-disable-next-line no-console
  console.log(`[resume] ${watch ? "watching" : "compiling"} resume.typ...`)
  const result = spawnSync("typst", args, { stdio: "inherit" })
  if (result.error?.code === "ENOENT") {
    throw new Error(
      "typst is not on PATH. Enter `nix develop .#ci` (CI/builds) or " +
        "install Typst before running this package directly."
    )
  }
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}

try {
  main()
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(
    `[resume] ${error instanceof Error ? error.message : String(error)}`
  )
  process.exitCode = 1
}
