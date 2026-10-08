#!/usr/bin/env node
// Extracts each composition's content from the Typst document and writes it as
// TypeScript for the web reading view (src/react).
//
// apps/www needs the résumé as *text*: a PDF does not render inline on mobile
// browsers, and Typst's SVG export has no text at all. `typst query` reads the
// `<resume-export>` metadata src/main.typ attaches to the laid-out document,
// so the web view and the PDF cannot describe different résumés.

//
// The output is committed rather than generated into dist/. It is small
// (~7 KB/variant), it makes content changes reviewable as a diff, and it keeps
// `tsc`, eslint, and knip working without depending on build order. `pnpm
// build` regenerates it first, so CI always renders from fresh data.
//
// The emitted file is annotated with the types in src/react/types.ts, so `tsc`
// checks the data against the declared shape. The assert below covers what
// types cannot: that a composition is not empty.
//
// If rendering moves to a service (#1132), this script goes and the shape
// becomes the response body.
//
// After a compile (documents/manifest.json exists), it also writes the
// agent-readable documents (scripts/agent-documents.mjs) into documents/ and
// adds them to that manifest, so apps/www/scripts/sync-resume.mjs publishes
// them with the PDFs. Run alone, before any compile, it writes data.ts only.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

import {
  documentName,
  toJsonResume,
  toLlmsTxt,
  toMarkdown,
} from "./agent-documents.mjs"
import {
  baseArgs,
  DEFAULT_TEMPLATE,
  DEFAULT_VARIANT,
  inputArgs,
  outDir,
  packageDir,
  presentation,
  resolveTypst,
  sourceFile,
  variants,
} from "./typst.mjs"

const target = join(packageDir, "src", "react", "generated", "data.ts")
const repoRoot = join(packageDir, "..", "..", "..")
const manifestPath = join(outDir, "manifest.json")

// Where each evidence repository is checked out, if it is. paulgsc/server is
// not part of this build, so its paths are checked only when
// RESUME_SERVER_CHECKOUT names a clone; under apps/www/Dockerfile's
// `turbo prune` (SOME_UI_PRUNED_WORKSPACE) most of this repository is not on
// disk either, so neither is checked there.
function checkouts() {
  if (process.env.SOME_UI_PRUNED_WORKSPACE === "1") return {}
  const server = process.env.RESUME_SERVER_CHECKOUT
  return {
    "paulgsc/some-ui": repoRoot,
    ...(server ? { "paulgsc/server": server } : {}),
  }
}

// A structural assert, not a schema. `tsc` already checks the emitted data
// against src/react/types.ts; this runs first and fails with a message that
// names the Typst file to fix, rather than a type error pointing into
// generated output.
const REQUIRED_KEYS = [
  "variant",
  "profile",
  "label",
  "summary",
  "skills",
  "projects",
  "platform",
  "highlights",
  "toolbox",
  "repositories",
  "engagement",
  "education",
  "languages",
  "certifications",
  "interests",
  "additionalExperience",
]
const REQUIRED_PROFILE_KEYS = ["name", "title", "email", "github", "portfolio"]
const NON_EMPTY_ARRAYS = ["projects", "platform", "highlights", "toolbox"]

function assertShape(variant, data) {
  const missing = REQUIRED_KEYS.filter((key) => !(key in data))
  if (missing.length) {
    throw new Error(
      `${variant}: <resume-export> is missing ${missing.join(", ")}. ` +
        `Update the metadata block in src/main.typ.`
    )
  }
  const missingProfile = REQUIRED_PROFILE_KEYS.filter(
    (key) => typeof data.profile?.[key] !== "string"
  )
  if (missingProfile.length) {
    throw new Error(
      `${variant}: profile is missing string ${missingProfile.join(", ")}.`
    )
  }
  const claims = [
    ...data.projects.flatMap((project) => project.bullets),
    ...data.platform,
  ]
  const unsourced = claims.filter(
    (claim) => !Array.isArray(claim.evidence) || claim.evidence.length === 0
  )
  if (unsourced.length) {
    throw new Error(
      `${variant}: ${unsourced.length} claim(s) name no evidence, e.g. ` +
        `"${unsourced[0].text}". Give each one an \`evidence\` list in ` +
        "src/data/resume.typ."
    )
  }
  for (const key of NON_EMPTY_ARRAYS) {
    if (!Array.isArray(data[key]) || data[key].length === 0) {
      throw new Error(
        `${variant}: expected a non-empty array for "${key}". A composition ` +
          `that renders nothing here would publish a blank section.`
      )
    }
  }
}

// A link to a path that does not exist is worse than no link: it reads as
// evidence and checks nothing.
function checkEvidencePaths(exported) {
  const roots = checkouts()
  const missing = new Set()
  for (const data of Object.values(exported)) {
    const claims = [
      ...data.projects.flatMap((project) => project.bullets),
      ...data.platform,
    ]
    for (const { repo, path } of claims.flatMap((claim) => claim.evidence)) {
      const root = roots[repo]
      if (root !== undefined && !existsSync(join(root, path))) {
        missing.add(`${repo}: ${path}`)
      }
    }
  }
  if (missing.size) {
    throw new Error(
      "src/data/resume.typ cites evidence that does not exist:\n  " +
        `${[...missing].join("\n  ")}\nFix the path, or cut the claim if ` +
        "nothing supports it any more."
    )
  }
  return Object.keys(roots)
}

function writeAgentDocuments(exported) {
  if (!existsSync(manifestPath)) {
    // eslint-disable-next-line no-console
    console.log(
      "[resume] documents/ has no manifest (not compiled), so only data.ts " +
        "was written; `pnpm build` writes the Markdown/JSON documents too"
    )
    return
  }
  const files = new Map([["llms.txt", toLlmsTxt(exported)]])
  for (const [variant, data] of Object.entries(exported)) {
    const markdown = toMarkdown(data, variants)
    const json = `${JSON.stringify(toJsonResume(data), null, 2)}\n`
    files.set(documentName(variant, "md"), markdown)
    files.set(documentName(variant, "json"), json)
    if (variant === DEFAULT_VARIANT) {
      files.set("resume.md", markdown)
      files.set("resume.json", json)
    }
  }
  for (const [name, content] of files) {
    writeFileSync(join(outDir, name), content)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  writeFileSync(
    manifestPath,
    `${JSON.stringify([...new Set([...manifest, ...files.keys()])].sort(), null, 2)}\n`
  )
  // eslint-disable-next-line no-console
  console.log(
    `[resume] wrote ${files.size} agent-readable documents to ${relative(
      packageDir,
      outDir
    )}`
  )
}

async function main() {
  const { bin, fontPath } = await resolveTypst()

  const exported = {}
  for (const variant of variants) {
    const json = execFileSync(
      bin,
      [
        "query",
        sourceFile,
        "<resume-export>",
        "--field",
        "value",
        "--one",
        "--format",
        "json",
        ...baseArgs(fontPath),
        ...inputArgs({
          variant,
          template: DEFAULT_TEMPLATE,
          ...presentation[DEFAULT_TEMPLATE],
        }),
      ],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    )
    const data = JSON.parse(json)
    assertShape(variant, data)
    exported[variant] = data
    // eslint-disable-next-line no-console
    console.log(
      `[resume] exported ${variant}: ${data.projects.length} projects, ` +
        `${data.highlights.length} highlights`
    )
  }

  const checked = checkEvidencePaths(exported)
  // eslint-disable-next-line no-console
  console.log(
    `[resume] evidence paths exist in ${checked.join(", ") || "no checkout"}${
      checked.includes("paulgsc/server")
        ? ""
        : " (paulgsc/server unchecked: set RESUME_SERVER_CHECKOUT to a clone)"
    }`
  )

  const banner = `// GENERATED by scripts/export-data.mjs — do not edit.
//
// Source of truth is src/data/resume.typ (content) and src/data/personal.typ
// (facts that cannot be derived from the source repositories). Run
// \`pnpm --filter @some-ui/resume export:data\` after changing either.

import type { ResumeData, ResumeVariant } from "@resume/types"

`
  writeFileSync(
    target,
    `${banner}export const resumeData: Record<ResumeVariant, ResumeData> = ` +
      `${JSON.stringify(exported, null, 2)}\n`
  )
  // eslint-disable-next-line no-console
  console.log(`[resume] wrote ${target}`)

  writeAgentDocuments(exported)
}

main().catch((err) => {
  // Same reason as scripts/compile.mjs: a `fetch()` failure says nothing
  // useful until `err.cause` is printed with it.
  const cause = err.cause?.message ?? err.cause
  // eslint-disable-next-line no-console
  console.error(`[resume] ${err.message}${cause ? `: ${cause}` : ""}`)
  process.exitCode = 1
})
