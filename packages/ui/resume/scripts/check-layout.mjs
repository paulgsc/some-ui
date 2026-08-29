#!/usr/bin/env node
// Typographic regression check: prove that no two lines of the rendered
// documents are set tighter than ordinary body leading.
//
// Why this exists. The templates stack a title over a subtitle in several
// places (name over role, project over stack, rail heading over its blurb).
// Typst's `#v(.., weak: true)` collapses against an adjoining block, so those
// gaps silently went to zero and the subtitle's line box rode up into the line
// above it. Nothing in the source looked wrong, the one-page assertion still
// passed, and the ATS text check still passed — the text was all there, just
// overlapping. Only looking at the PDF caught it.
//
// So it is measured instead. `pdftotext -bbox-layout` reports a bounding box
// per rendered line; for each pair of vertically adjacent lines that share a
// column, this asserts the gap between their boxes.
//
// The metric is (next.yMin - current.yMax) normalised by the shorter line's
// height, which makes it independent of the type scale that lib/fit.typ solves
// for. Note the zero point is not "touching": a text box includes the font's
// full ascent and descent, so lines at normal leading measure slightly
// positive, and a *negative* value means the boxes genuinely overlap.
//
// Calibration, measured across all nine documents:
//
//   Lato templates (rail, compact)   body leading sits at +0.030
//   PT Serif template (classic)      body leading sits at +0.042
//   worst legitimate pair observed   -0.009
//   defects this check was built on  -0.120, -0.183, -0.196, -0.229,
//                                    -0.309, -0.517
//
// -0.05 sits below every legitimate pair and above every defect. PT Serif's
// ascent/descent run taller than Lato's at the same nominal size, which is why
// the shared gap constants in src/lib/parts.typ are set for the serif.
//
// What this cannot do: judge whether spacing looks *good*. It is a floor, not
// a designer. It catches cramming and collision, which is the failure mode
// that actually ships unnoticed.
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { basename, join } from "node:path"

import { outDir } from "./typst.mjs"

const extractor = process.env.PDFTOTEXT_BIN ?? "pdftotext"

const MIN_GAP_RATIO = -0.05
// Two lines belong to the same column when they overlap horizontally by more
// than half the narrower one. This is what keeps a rail line from being
// compared against a main-column line that merely happens to sit near it.
const COLUMN_OVERLAP = 0.5

const variants = ["backend", "platform", "fullstack"]
const templates = [
  "rail",
  "classic",
  "compact",
  "vanilla",
  "safe",
  "conventional",
]
const DEFAULT_TEMPLATE = "rail"

const LINE_RE =
  /<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g
const WORD_RE = />([^<]*)<\/word>/g
const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
}

function decode(text) {
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (e) => ENTITIES[e])
}

function readLines(pdfFile) {
  let xml
  try {
    xml = execFileSync(extractor, ["-bbox-layout", pdfFile, "-"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "Layout check requires `pdftotext` (Poppler). It is provided by the " +
          "repo's nix shells; outside nix, install poppler-utils or set " +
          "PDFTOTEXT_BIN to a compatible executable."
      )
    }
    throw error
  }

  const lines = []
  for (const match of xml.matchAll(LINE_RE)) {
    const [, xMin, yMin, xMax, yMax, inner] = match
    const text = decode(
      [...inner.matchAll(WORD_RE)].map((w) => w[1]).join(" ")
    ).trim()
    if (text === "") continue
    lines.push({
      xMin: Number(xMin),
      yMin: Number(yMin),
      xMax: Number(xMax),
      yMax: Number(yMax),
      height: Number(yMax) - Number(yMin),
      text,
    })
  }
  lines.sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin)
  return lines
}

function sameColumn(a, b) {
  const overlap = Math.min(a.xMax, b.xMax) - Math.max(a.xMin, b.xMin)
  return overlap > COLUMN_OVERLAP * Math.min(a.xMax - a.xMin, b.xMax - b.xMin)
}

function excerpt(line) {
  return line.text.length > 48 ? `${line.text.slice(0, 48)}…` : line.text
}

function checkDocument(pdfFile, label) {
  if (!existsSync(pdfFile)) throw new Error(`Missing generated PDF: ${pdfFile}`)
  const lines = readLines(pdfFile)
  const offences = []
  let checked = 0

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i]
    // Only the nearest following line in the same column matters; anything
    // past that is separated by an intervening line anyway.
    const next = lines
      .slice(i + 1)
      .find((candidate) => sameColumn(current, candidate))
    if (next === undefined) continue

    checked += 1
    const gap = next.yMin - current.yMax
    const ratio = gap / Math.min(current.height, next.height)
    if (ratio < MIN_GAP_RATIO) {
      offences.push({ ratio, gap, current, next })
    }
  }

  if (offences.length) {
    const detail = offences
      .sort((a, b) => a.ratio - b.ratio)
      .map(
        (o) =>
          `    ${o.ratio.toFixed(3)} (${o.gap.toFixed(2)}pt)  ` +
          `"${excerpt(o.current)}"\n        over  "${excerpt(o.next)}"`
      )
      .join("\n")
    throw new Error(
      `${basename(pdfFile)} sets ${offences.length} line pair(s) tighter than ` +
        `the ${MIN_GAP_RATIO} floor:\n${detail}\n` +
        `  Widen the relevant gap in src/lib/parts.typ (STACK-GAP / ` +
        `HEADING-GAP) or the template's own par/list spacing.`
    )
  }

  // eslint-disable-next-line no-console
  console.log(
    `[resume] layout check passed: ${label} (${checked} adjacent line pairs)`
  )
}

for (const template of templates) {
  for (const variant of variants) {
    const stem =
      template === DEFAULT_TEMPLATE
        ? `resume-${variant}`
        : `resume-${variant}-${template}`
    checkDocument(join(outDir, `${stem}.pdf`), `${variant} / ${template}`)
  }
}
