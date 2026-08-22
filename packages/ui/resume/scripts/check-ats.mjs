#!/usr/bin/env node
// ATS smoke test: prove that each generated PDF exposes useful, ordered text.
// This cannot certify behavior in every proprietary ATS; it catches the common
// regressions we control (image-only output, broken glyph maps, missing contact
// details/sections, and scrambled primary-section order).
import { execFileSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(packageDir, "dist")
const extractor = process.env.PDFTOTEXT_BIN ?? "pdftotext"
const variants = {
  backend: "Backend & event-driven systems",
  systems: "Distributed systems & infrastructure",
  learning: "Adaptive learning & product engineering",
}
const requiredText = [
  "Paul Gathondu",
  "paulgathondudev@gmail.com",
  "github.com/paulgsc",
  "Summary",
  "Core capabilities",
  "Selected work",
  "Platform, release, and engineering practice",
]

function extract(pdfFile) {
  try {
    return execFileSync(extractor, ["-layout", "-enc", "UTF-8", pdfFile, "-"], {
      encoding: "utf8",
    })
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "ATS check requires `pdftotext` (Poppler). Install poppler-utils or set PDFTOTEXT_BIN."
      )
    }
    throw error
  }
}

function assertAtsText(pdfFile, variant, label) {
  if (!existsSync(pdfFile)) throw new Error(`Missing generated PDF: ${pdfFile}`)
  const text = extract(pdfFile)
  const normalized = text.replace(/\s+/g, " ").trim()
  const folded = normalized.toLocaleLowerCase("en")
  const missing = [...requiredText, label].filter(
    (term) => !folded.includes(term.toLocaleLowerCase("en"))
  )
  if (missing.length) {
    throw new Error(
      `${basename(pdfFile)} has no extractable text for: ${missing.join(", ")}`
    )
  }
  if (normalized.includes("�")) {
    throw new Error(`${basename(pdfFile)} contains Unicode replacement glyphs`)
  }
  const words = normalized.split(/\s+/).length
  if (words < 180) {
    throw new Error(
      `${basename(pdfFile)} extracted only ${words} words (minimum: 180)`
    )
  }

  const orderedSections = [
    "summary",
    "core capabilities",
    "selected work",
    "platform, release",
  ]
  const offsets = orderedSections.map((section) => folded.indexOf(section))
  if (
    offsets.some((offset, index) => index > 0 && offset <= offsets[index - 1])
  ) {
    throw new Error(
      `${basename(pdfFile)} primary sections do not extract in reading order`
    )
  }

  const transcript = join(outDir, `resume-${variant}.ats.txt`)
  writeFileSync(transcript, `${text.trim()}\n`)
  // eslint-disable-next-line no-console
  console.log(`[resume] ATS text check passed: ${variant} (${words} words)`)
}

for (const [variant, label] of Object.entries(variants)) {
  assertAtsText(join(outDir, `resume-${variant}.pdf`), variant, label)
}
