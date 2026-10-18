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
import { existsSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"

import { pdftotext } from "./pdftotext.mjs"
import { outDir, stemFor, templates } from "./typst.mjs"

// Each variant's focus label, which every PDF must expose.
const variants = {
  backend: "Backend & event-driven systems",
  platform: "Developer platform & release engineering",
  fullstack: "Full-stack web & product engineering",
  data: "Data analysis, metrics & reporting",
  qa: "Test automation & quality engineering",
  solutions: "Integrations & internal tools",
}
// Identity facts, matched anywhere in the extracted text. A build with PII
// (src/lib/pii.typ) also requires each supplied field, and its email
// replaces this one.
const identity = {
  name: "Paul Gathondu",
  email: "paulgathondudev@gmail.com",
  github: "github.com/paulgsc",
}

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

// Role-family term clusters, not one global list. A concise, targeted
// variant is allowed to not name every stack in the résumé — `fullstack`
// has no reason to claim "asynchronous" or "event-driven" the way `backend`
// does — but it is not allowed to stop naming the work its own evidence
// supports. Matched only against Summary + Skills text (see `extract`
// below's word-boundary note), which every template renders in full and
// never truncates, unlike Experience bullets under a tight one-page fit.
const requiredQualificationsByVariant = {
  backend: [
    "Rust",
    "TypeScript",
    "REST",
    "SQL",
    "asynchronous",
    "Docker",
    "testing",
    "CI/CD",
    "JSON",
    "Node.js",
    "GitHub Actions",
  ],
  platform: [
    "TypeScript",
    "Rust",
    "Node.js",
    "GitHub Actions",
    "CI/CD",
    "Docker",
    "contract",
    "observability",
  ],
  fullstack: [
    "TypeScript",
    "React",
    "web application",
    "REST API",
    "component",
    "browser",
    "testing",
    "Node.js",
    "GitHub Actions",
  ],
  data: [
    "SQL",
    "PostgreSQL",
    "Python",
    "Tableau",
    "dashboards",
    "reporting",
    "data quality",
    "JSON",
  ],
  qa: [
    "Playwright",
    "test automation",
    "end-to-end",
    "API testing",
    "regression testing",
    "CI/CD",
    "TypeScript",
  ],
  solutions: [
    "API integration",
    "REST",
    "JSON",
    "TypeScript",
    "Python",
    "automation",
    "internal tools",
  ],
}

const MIN_WORDS = 180

// Two readings of the same PDF. `-layout` reconstructs the visual columns and
// is what a human should look at in the emitted transcript; plain extraction
// follows the content stream, which is both closer to what a naive parser
// consumes and the only one of the two where a heading reliably starts its own
// line. A left-hand rail, for instance, prefixes every `-layout` line of the
// main column with sidebar text.
function extract(pdf, { layout = false } = {}) {
  const flags = layout ? ["-layout", "-enc", "UTF-8"] : ["-enc", "UTF-8"]
  return pdftotext(flags, pdf, "ATS")
}

/**
 * Throws unless `pdf` (a path, or the PDF's bytes) passes. `pii` is the
 * build's contact fields, if any; a missing one is named by its field (RP2).
 * `transcriptDir: null` writes no `.ats.txt`. Returns the word count, and
 * logs nothing.
 */
export function assertAtsText(
  pdf,
  { variant, template, pii = {}, transcriptDir = outDir }
) {
  if (typeof pdf === "string" && !existsSync(pdf)) {
    throw new Error(`Missing generated PDF: ${pdf}`)
  }
  const label = variants[variant]
  const name =
    typeof pdf === "string" ? basename(pdf) : `${variant} / ${template}`
  const text = extract(pdf)
  const transcript = extract(pdf, { layout: true })
  const normalized = text.replace(/\s+/g, " ").trim()
  const folded = normalized.toLocaleLowerCase("en")
  const has = (term) => folded.includes(term.toLocaleLowerCase("en"))

  const expected = [
    ...Object.entries({ ...identity, ...pii }).map(([field, term]) => ({
      term,
      name: field in pii ? field : term,
    })),
    { term: label, name: label },
  ]
  const missing = expected
    .filter(({ term }) => !has(term))
    .map(({ name }) => name)
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

  // Scoped to the Summary+Skills region (Summary heading through, but not
  // including, Experience), which every template renders in full — unlike
  // Experience's project bullets, which the one-page fitting pass can slice
  // down to fewer bullets per project. A term this check relies on has to be
  // somewhere that layout never truncates.
  const summaryAndSkills = text
    .slice(offsets[0], offsets[2])
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en")
  const hasInSummaryOrSkills = (term) =>
    summaryAndSkills.includes(term.toLocaleLowerCase("en"))

  const cluster = requiredQualificationsByVariant[variant]
  if (cluster === undefined) {
    throw new Error(
      `check-ats.mjs has no requiredQualificationsByVariant entry for ` +
        `"${variant}" — add one alongside its composition in src/data/resume.typ.`
    )
  }
  const unqualified = cluster.filter((term) => !hasInSummaryOrSkills(term))
  if (unqualified.length) {
    throw new Error(
      `${name} Summary/Skills text names none of: ${unqualified.join(", ")}. ` +
        `Either the ${variant} composition in src/data/resume.typ no longer ` +
        `states them there, or the ${template} template's Summary/Skills ` +
        "blocks don't put them on the page."
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

  if (transcriptDir !== null) {
    writeFileSync(
      join(transcriptDir, `${stemFor(variant, template)}.ats.txt`),
      `${transcript.trim()}\n`
    )
  }
  return { words }
}

// The caller logs: a word count from a PDF with PII derives from it (RP2).
function logPassed(variant, template, { words }) {
  // eslint-disable-next-line no-console
  console.log(
    `[resume] ATS text check passed: ${variant} / ${template} (${words} words)`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const template of templates) {
    for (const variant of Object.keys(variants)) {
      logPassed(
        variant,
        template,
        assertAtsText(join(outDir, `${stemFor(variant, template)}.pdf`), {
          variant,
          template,
        })
      )
    }
  }
}
