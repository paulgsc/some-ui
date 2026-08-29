#!/usr/bin/env node
// Resolves a `typst` binary without requiring a system-wide install, and holds
// the invocation flags and document matrix every entry point needs.
//
// Shared by scripts/compile.mjs (which renders the documents) and
// scripts/export-data.mjs (which extracts the same documents' content as
// TypeScript), so the two cannot drift on which typst they run, which fonts it
// sees, or which variants exist.
import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { arch, platform, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { resolveFontPath } from "./fonts.mjs"

const TYPST_VERSION = "0.13.1"

export const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
export const sourceFile = join(packageDir, "src", "main.typ")
// Rendered documents go to documents/, NOT dist/. dist/ belongs to the vite
// library build, and vite empties its outDir before writing — which silently
// deleted every compiled PDF and SVG when the two shared a directory. The
// package produces two independent artifacts now; they get two homes.
export const outDir = join(packageDir, "documents")
const cacheDir = join(packageDir, "node_modules", ".cache", "typst-bin")

export const variants = ["backend", "platform", "fullstack"]
export const templates = [
  "rail",
  "classic",
  "compact",
  "vanilla",
  "safe",
  "conventional",
]
// The template whose output also claims the unsuffixed filenames that
// apps/www/scripts/sync-resume.mjs copies into the site.
export const DEFAULT_TEMPLATE = "rail"

// Each template picks the palette and family it was designed around; a caller
// can still override either through the typst inputs.
export const presentation = {
  rail: { theme: "teal", font: "lato" },
  classic: { theme: "ink", font: "pt-serif" },
  compact: { theme: "slate", font: "lato" },
  vanilla: { theme: "ink", font: "lato" },
  safe: { theme: "ink", font: "lato" },
  conventional: { theme: "ink", font: "pt-serif" },
}

export function stemFor(variant, template) {
  return template === DEFAULT_TEMPLATE
    ? `resume-${variant}`
    : `resume-${variant}-${template}`
}

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

// The template imports ../data/resume.typ from src/templates, so typst's
// project root has to be the package - not the entry file's directory, which
// is what it defaults to. Without this every invocation fails with "cannot
// read file outside of project root". System fonts are ignored so the output
// depends only on the pinned families, never on what the host has installed.
export function baseArgs(fontPath) {
  return [
    "--root",
    packageDir,
    "--font-path",
    fontPath,
    "--ignore-system-fonts",
  ]
}

export function inputArgs({ variant, template, theme, font }) {
  return [
    "--input",
    `variant=${variant}`,
    "--input",
    `template=${template}`,
    "--input",
    `theme=${theme}`,
    "--input",
    `font=${font}`,
  ]
}

// Resolve the binary and the pinned font directory together: every caller
// needs both, and having one without the other is always a bug.
export async function resolveTypst() {
  const [bin, fontPath] = await Promise.all([
    typstOnPath() ?? cachedBinary() ?? downloadBinary(),
    resolveFontPath(),
  ])
  return { bin, fontPath }
}
