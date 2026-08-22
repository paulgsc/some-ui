#!/usr/bin/env node
// ATS smoke test: prove that each generated PDF exposes useful, ordered text.
//
// This deliberately runs against the *rendered* PDF rather than the source
// data. A source-level assertion can only prove that a string exists in
// src/data — not that any template put it on the page — so a term dropped from
// a layout, or pushed onto a second page, or emitted as an unmappable glyph,
// would still pass. Everything asserted here is read back out of the artifact
// with the same kind of text extraction an applicant-tracking system performs.
//
// It cannot certify behaviour in every proprietary ATS. It catches the common
// regressions we control: image-only output, broken glyph maps, missing
// contact details, missing section landmarks, dropped qualifications, and
// scrambled primary-section order.
import { execFileSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"

import { outDir } from "./typst.mjs"

const extractor = process.env.PDFTOTEXT_BIN ?? "pdftotext"

const variants = {
  backend: "Backend & event-driven systems",
  systems: "Distributed systems & infrastructure",
  learning: "Adaptive learning & product engineering",
}
const templates = ["rail", "classic", "compact"]
const DEFAULT_TEMPLATE = "rail"

// Identity facts, matched anywhere in the extracted text.
const requiredText = [
  "Paul Gathondu",
  "paulgathondudev@gmail.com",
  "github.com/paulgsc",
]

// Section landmarks, in the order an ATS should encounter them. These are
// matched as headings — anchored to the start of a line, in the upper case the
// templates render them in — rather than as bare substrings. A substring match
// finds "Experience" inside "experiences" in ordinary body copy, which both
// hides a genuinely missing heading and scrambles the order check.
//
// Renaming a heading in a template without updating this list is exactly the
// kind of regression this file exists to catch.
const requiredHeadings = ["Summary", "Skills", "Experience"]

function headingOffset(text, heading) {
  const match = new RegExp(
    `^\\s*${heading.toLocaleUpperCase("en")}\\b`,
    "m"
  ).exec(text)
  return match == null ? -1 : match.index
}

// The shared qualification seam. Every composition must still expose these
// after layout, in every template — a targeted variant is allowed to be
// concise, not to stop naming work the evidence genuinely supports.
const requiredQualifications = [
  "TypeScript",
  "data modeling",
  "production",
  "distributed",
  "asynchronous",
  "event-driven",
  "Docker",
  "testing",
]

const MIN_WORDS = 180

// Two readings of the same PDF. `-layout` reconstructs the visual columns and
// is what a human should look at in the emitted transcript; plain extraction
// follows the content stream, which is both closer to what a naive parser
// consumes and the only one of the two where a heading reliably starts its own
// line. A left-hand rail, for instance, prefixes every `-layout` line of the
// main column with sidebar text.
function extract(pdfFile, { layout = false } = {}) {
  const args = layout
    ? ["-layout", "-enc", "UTF-8", pdfFile, "-"]
    : ["-enc", "UTF-8", pdfFile, "-"]
  try {
    return execFileSync(extractor, args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "ATS check requires `pdftotext` (Poppler). It is provided by the " +
          "repo's nix CI shell; outside nix, install poppler-utils or set " +
          "PDFTOTEXT_BIN to a compatible executable."
      )
    }
    throw error
  }
}

function assertAtsText(pdfFile, variant, template, label) {
  if (!existsSync(pdfFile)) throw new Error(`Missing generated PDF: ${pdfFile}`)
  const name = basename(pdfFile)
  const text = extract(pdfFile)
  const transcript = extract(pdfFile, { layout: true })
  const normalized = text.replace(/\s+/g, " ").trim()
  const folded = normalized.toLocaleLowerCase("en")
  const has = (term) => folded.includes(term.toLocaleLowerCase("en"))

  const missing = [...requiredText, label].filter((term) => !has(term))
  if (missing.length) {
    throw new Error(
      `${name} has no extractable text for: ${missing.join(", ")}`
    )
  }

  const offsets = requiredHeadings.map((heading) =>
    headingOffset(text, heading)
  )
  const missingHeadings = requiredHeadings.filter((_, i) => offsets[i] < 0)
  if (missingHeadings.length) {
    throw new Error(
      `${name} exposes no section heading for: ${missingHeadings.join(", ")}`
    )
  }
  if (offsets.some((offset, i) => i > 0 && offset <= offsets[i - 1])) {
    throw new Error(
      `${name} section headings do not extract in reading order ` +
        `(expected ${requiredHeadings.join(" -> ")})`
    )
  }

  const unqualified = requiredQualifications.filter((term) => !has(term))
  if (unqualified.length) {
    throw new Error(
      `${name} renders no text for these qualifications: ` +
        `${unqualified.join(", ")}. Either the composition in src/data no ` +
        `longer states them, or the ${template} template does not put them ` +
        `on the page.`
    )
  }

  if (normalized.includes("�")) {
    throw new Error(`${name} contains Unicode replacement glyphs`)
  }

  const words = normalized.split(/\s+/).length
  if (words < MIN_WORDS) {
    throw new Error(
      `${name} extracted only ${words} words (minimum: ${MIN_WORDS})`
    )
  }

  const stem =
    template === DEFAULT_TEMPLATE
      ? `resume-${variant}`
      : `resume-${variant}-${template}`
  writeFileSync(join(outDir, `${stem}.ats.txt`), `${transcript.trim()}\n`)
  // eslint-disable-next-line no-console
  console.log(
    `[resume] ATS text check passed: ${variant} / ${template} (${words} words)`
  )
}

for (const template of templates) {
  for (const [variant, label] of Object.entries(variants)) {
    const stem =
      template === DEFAULT_TEMPLATE
        ? `resume-${variant}`
        : `resume-${variant}-${template}`
    assertAtsText(join(outDir, `${stem}.pdf`), variant, template, label)
  }
}
