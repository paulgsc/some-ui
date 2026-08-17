#!/usr/bin/env node
// Compiles resume.typ -> dist/resume.pdf.
//
// No system-wide `typst` dependency required: if `typst` isn't already on
// PATH, this fetches the pinned release binary for the current platform
// straight from GitHub Releases (same artifact `typst-community/setup-typst`
// uses in CI) and caches it under node_modules/.cache so repeat builds are
// free. That's the whole pipeline for this MVP - no WASM compiler, no
// server: pass --watch for `typst watch` during local editing.
import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { arch, platform, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const TYPST_VERSION = "0.13.1"

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceFile = join(packageDir, "resume.typ")
const outDir = join(packageDir, "dist")
const cacheDir = join(packageDir, "node_modules", ".cache", "typst-bin")
const variants = ["backend", "systems", "learning"]

function releaseTriple() {
  const table = {
    "linux-x64": "x86_64-unknown-linux-musl",
    "linux-arm64": "aarch64-unknown-linux-musl",
    "darwin-x64": "x86_64-apple-darwin",
    "darwin-arm64": "aarch64-apple-darwin",
  }
  const key = `${platform()}-${arch()}`
  const triple = table[key]
  if (!triple) {
    throw new Error(
      `No pinned typst binary for ${key}. Install typst yourself ` +
        `(https://github.com/typst/typst#installation) and make sure ` +
        `it's on PATH, then re-run this script.`
    )
  }
  return triple
}

function typstOnPath() {
  const probe = spawnSync("typst", ["--version"], { stdio: "ignore" })
  return probe.status === 0 ? "typst" : null
}

function cachedBinary() {
  const bin = join(cacheDir, TYPST_VERSION, "typst")
  return existsSync(bin) ? bin : null
}

async function downloadBinary() {
  const triple = releaseTriple()
  const asset = `typst-${triple}.tar.xz`
  const url = `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/${asset}`

  // eslint-disable-next-line no-console
  console.log(`[resume] fetching typst ${TYPST_VERSION} (${triple})...`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`)
  }
  const archiveBytes = new Uint8Array(await res.arrayBuffer())

  const tmpDir = mkdtempSync(join(tmpdir(), "typst-dl-"))
  const archivePath = join(tmpDir, asset)
  writeFileSync(archivePath, archiveBytes)

  // System `tar` handles .tar.xz natively on Linux/macOS - no extra deps.
  execFileSync("tar", ["xf", archivePath, "-C", tmpDir])

  const versionDir = join(cacheDir, TYPST_VERSION)
  mkdirSync(versionDir, { recursive: true })
  const extractedBinary = join(tmpDir, `typst-${triple}`, "typst")
  execFileSync("cp", [extractedBinary, join(versionDir, "typst")])
  chmodSync(join(versionDir, "typst"), 0o755)
  rmSync(tmpDir, { recursive: true, force: true })

  return join(versionDir, "typst")
}

async function resolveTypstBinary() {
  return typstOnPath() ?? cachedBinary() ?? (await downloadBinary())
}

async function main() {
  const watch = process.argv.includes("--watch")
  const typstBin = await resolveTypstBinary()

  mkdirSync(outDir, { recursive: true })

  if (watch) {
    const outFile = join(outDir, "resume-backend.pdf")
    // eslint-disable-next-line no-console
    console.log("[resume] watching the backend composition...")
    const result = spawnSync(
      typstBin,
      ["watch", sourceFile, outFile, "--input", "variant=backend"],
      { stdio: "inherit" }
    )
    process.exitCode = result.status ?? 1
    return
  }

  for (const variant of variants) {
    const outFile = join(outDir, `resume-${variant}.pdf`)
    // eslint-disable-next-line no-console
    console.log(`[resume] compiling the ${variant} composition...`)
    const result = spawnSync(
      typstBin,
      ["compile", sourceFile, outFile, "--input", `variant=${variant}`],
      { stdio: "inherit" }
    )
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      return
    }
  }

  // Preserve the original public filename as the default/backend composition.
  copyFileSync(join(outDir, "resume-backend.pdf"), join(outDir, "resume.pdf"))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[resume] ${err.message}`)
  process.exitCode = 1
})
