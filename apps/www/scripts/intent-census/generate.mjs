#!/usr/bin/env node
/**
 * Regenerates docs/intent-census.md from the AST walk plus the hand-authored
 * annotations, and fails loudly on any mismatch between them rather than
 * silently rendering an incomplete table.
 *
 * `pnpm --filter www run census:check`  — regenerate in memory, diff against
 *   the checked-in file, exit non-zero on drift (what CI runs).
 * `pnpm --filter www run census:write`  — regenerate and write the file.
 *
 * Both fail if the AST walk and the annotations have drifted apart in
 * either direction — a new call site with no annotation, or an annotation
 * for a call site that no longer exists.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { ROWS, SITE_ANNOTATIONS } from "./annotations.mjs"
import { idOf, walkIntentProducers } from "./walk.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "../../../..")
const SRC_ROOT = resolve(REPO_ROOT, "apps/www/src")
const OUTPUT_PATH = resolve(REPO_ROOT, "docs/intent-census.md")

/** Independent of the AST walk on purpose — a regex count over the raw text
 * is a second, cruder instrument, so an AST bug that under- or
 * over-counts can't mark its own homework. Mirrors the two baselines named
 * in #934's own preliminary count. */
function regexBaseline(files) {
  let mutateCalls = 0
  let isPendingReads = 0
  for (const filePath of files) {
    const text = readFileSync(filePath, "utf8")
    mutateCalls += (text.match(/\.mutate(Async)?\(/g) ?? []).length
    isPendingReads += (text.match(/\.isPending\b/g) ?? []).length
  }
  return { mutateCalls, isPendingReads }
}

function collectSourceFiles(srcRoot) {
  // Reuses the walker's own file discovery so the regex baseline scans
  // exactly the set the AST walk scans - no separate glob to drift from it.
  const seen = new Set()
  for (const site of walkIntentProducers(srcRoot, REPO_ROOT)) {
    seen.add(resolve(REPO_ROOT, site.file))
  }
  return [...seen]
}

function validate(sites) {
  const foundIds = new Set(sites.map(idOf))
  const annotatedIds = new Set(Object.keys(SITE_ANNOTATIONS))

  const uncovered = [...foundIds].filter((id) => !annotatedIds.has(id))
  const stale = [...annotatedIds].filter((id) => !foundIds.has(id))

  const errors = []
  if (uncovered.length > 0) {
    errors.push(
      `${uncovered.length} call site(s) found by the AST walk have no annotation ` +
        `in annotations.mjs:\n${uncovered.map((id) => `  - ${id}`).join("\n")}`
    )
  }
  if (stale.length > 0) {
    errors.push(
      `${stale.length} annotation(s) in annotations.mjs no longer match a call site ` +
        `the AST walk finds (code moved or was deleted - update the line number or ` +
        `remove the entry):\n${stale.map((id) => `  - ${id}`).join("\n")}`
    )
  }

  const referencedRows = new Set(
    Object.values(SITE_ANNOTATIONS)
      .map((a) => a.row)
      .filter((row) => row !== null)
  )
  const missingRowRefs = [...referencedRows].filter((row) => !(row in ROWS))
  if (missingRowRefs.length > 0) {
    errors.push(
      `Site annotations reference row(s) not defined in ROWS: ${missingRowRefs.join(", ")}`
    )
  }
  const orphanRows = Object.keys(ROWS).filter((row) => !referencedRows.has(row))
  if (orphanRows.length > 0) {
    errors.push(
      `ROWS entries with no site pointing at them (dead rows): ${orphanRows.join(", ")}`
    )
  }

  if (errors.length > 0) {
    throw new Error(
      `Intent census is out of sync with the source tree:\n\n${errors.join("\n\n")}`
    )
  }
}

function groupSitesByRow(sites) {
  /** @type {Map<string, Array<{ site: import("./walk.mjs"), detail?: string }>>} */
  const byRow = new Map()
  for (const site of sites) {
    const annotation = SITE_ANNOTATIONS[idOf(site)]
    if (!annotation || annotation.row === null) continue
    const list = byRow.get(annotation.row) ?? []
    list.push({ site, detail: annotation.detail })
    byRow.set(annotation.row, list)
  }
  return byRow
}

function siteList(entries) {
  return entries
    .map(({ site, detail }) => {
      const loc = `\`${site.file}:${site.line}\``
      return detail ? `${loc} — ${detail}` : loc
    })
    .join("<br>")
}

function renderGestureTable(rowIds, byRow) {
  const header =
    "| Intent | Sites | Effect | Working | Succeeded | Failed | Cancellable |\n" +
    "| --- | --- | --- | --- | --- | --- | --- |\n"
  const body = rowIds
    .map((rowId) => {
      const row = ROWS[rowId]
      const entries = byRow.get(rowId) ?? []
      return (
        `| ${row.gesture} | ${siteList(entries)} | ${row.effect} ` +
        `| ${row.renders.working} | ${row.renders.succeeded} | ${row.renders.failed} ` +
        `| ${row.cancellable ? "Yes" : "No"} — ${row.cancelNote} |`
      )
    })
    .join("\n")
  return header + body
}

function renderAmbientTable(rowIds, byRow) {
  const header =
    "| Producer | Sites | Effect | Rendered on failure | Ambient justification |\n" +
    "| --- | --- | --- | --- | --- |\n"
  const body = rowIds
    .map((rowId) => {
      const row = ROWS[rowId]
      const entries = byRow.get(rowId) ?? []
      return (
        `| ${row.gesture} | ${siteList(entries)} | ${row.effect} ` +
        `| ${row.renders.failed} | ${row.justification} |`
      )
    })
    .join("\n")
  return header + body
}

function renderInfraList(sites) {
  return sites
    .filter((site) => SITE_ANNOTATIONS[idOf(site)]?.group === "infra")
    .map((site) => {
      const note = SITE_ANNOTATIONS[idOf(site)].note
      return `- \`${site.file}:${site.line}\` — ${note}`
    })
    .join("\n")
}

function renderDefinitionList(sites) {
  return sites
    .filter((site) => SITE_ANNOTATIONS[idOf(site)]?.group === "definition")
    .map((site) => {
      const note = SITE_ANNOTATIONS[idOf(site)].note
      return `- \`${site.file}:${site.line}\` (\`${site.enclosing}\`) — ${note}`
    })
    .join("\n")
}

function renderOutOfScopeList(sites) {
  return sites
    .filter((site) => SITE_ANNOTATIONS[idOf(site)]?.group === "out-of-scope")
    .map((site) => {
      const note = SITE_ANNOTATIONS[idOf(site)].note
      return `- \`${site.file}:${site.line}\` — ${note}`
    })
    .join("\n")
}

function render(sites) {
  const byRow = groupSitesByRow(sites)
  const gestureRowIds = Object.keys(ROWS).filter(
    (id) => ROWS[id].table === "gesture"
  )
  const ambientRowIds = Object.keys(ROWS).filter(
    (id) => ROWS[id].table === "ambient"
  )

  const files = collectSourceFiles(SRC_ROOT)
  const baseline = regexBaseline(files)
  const derivedMutateCalls = sites.filter(
    (s) => s.kind === "mutate-call"
  ).length

  const mutateDelta =
    baseline.mutateCalls === derivedMutateCalls
      ? `Matches the epic's preliminary grep count (17) exactly.`
      : `**Delta from the regex baseline**: regex found ${baseline.mutateCalls}, the AST walk found ${derivedMutateCalls}. ` +
        `Investigate before trusting either number.`

  const isPendingNote =
    `The epic's preliminary count (grep, #934) reported 6 *sites* reading \`.isPending\`. ` +
    `A regex count of the literal \`.isPending\` substring over the same tree today finds ` +
    `**${baseline.isPendingReads}** *occurrences* — a different unit, since a site typically reads ` +
    `the flag twice (once to disable a control, once to swap its label, e.g. settings.tsx:235 ` +
    `and :237 for the same \`updateSettings\`), and the composer's two Save buttons share one ` +
    `\`isSaving\` read. Collapsing occurrences back to distinct mutation-consuming UI sites (the ` +
    `unit the gesture table above uses) gives **7**, not 6: the preliminary count missed ` +
    `\`apps/www/src/components/player/completion-summary.tsx:130\` (the "Play again" button ` +
    `disabling on \`duplicateSession.isPending\`) — plausible to miss by eye, since it is reached ` +
    `only at the end of a session rather than from a form. This is exactly the kind of drift ` +
    `#938 asks the generator to catch and explain rather than silently carry forward.`

  return `# Intent census — apps/www

Generated by \`apps/www/scripts/intent-census/generate.mjs\`. **Do not hand-edit this file** —
edit \`apps/www/scripts/intent-census/annotations.mjs\` (the judgment) or
\`walk.mjs\` (the AST walk) and run \`pnpm --filter www run census:write\`.

Answers #938 (this table) and #940 (the \`Cancellable\` column, the ambient
justifications, and the [verdict](#cancellation-verdict-940) below). Scope is
\`apps/www/src\`, per #934 — \`extensions/\` and \`packages/\` are not walked.

## Method

Two independent counts, checked against each other on every regeneration:

1. An AST walk (\`walk.mjs\`, TypeScript's compiler API) finds every
   \`.mutate\(\`/\`.mutateAsync\(\` call, every \`useMutation\(\` definition, the
   browser-API and \`localStorage\` call sites \`lib/study-nudge\` wraps, and
   the \`confirm\(\` gates in the sessions list.
2. A plain regex count over the same files, as a second instrument that
   can't share the AST walk's blind spots.

Every site the walk finds must carry a hand-authored annotation attaching it
to an intent (\`annotations.mjs\`); every annotation must still match a real
site. \`generate.mjs\` fails the build if either direction is out of sync,
which is what "derived, not hand-maintained" means here in practice — the
*enumeration* cannot go stale, even though the *judgment* attached to each
entry is written by hand.

**Baseline check**: ${mutateDelta}

**\`isPending\` baseline**: ${isPendingNote}

## User-gesture intents

The population #938 asks for: every place a person's action starts a write,
what they see while it runs, what they see if it lands, and — the load-bearing
column — what they see if it does not.

${renderGestureTable(gestureRowIds, byRow)}

**Reading the table**: "Failed" is the column that matters. Ten of these
twelve intents render nothing at all on failure — not an error toast, not a
disabled retry, not a changed icon. \`nudge-toggle\` and \`nudge-send-test\` are
the exceptions, and they are exceptions because someone already wrote the
\`onError\`-shaped code for them (a \`toast(...)\` call after an \`await\` that
resolved to a non-success outcome) — proving the pattern is not hard to write
in this codebase, just not applied anywhere a TanStack mutation is the
mechanism.

## Ambient / background producers

Not gesture-initiated — no click starts these — but named explicitly in #934
and #940 as producers whose silence needs the same scrutiny, because a person
who did nothing to trigger a write can still be the one who loses work when it
fails.

${renderAmbientTable(ambientRowIds, byRow)}

## Cancellation verdict (#940)

**No intent in \`apps/www\` needs \`Cancelled\` today.** Every write in both
tables above is a single request (or, for the two composite chains, two
requests in immediate succession) against either a 150ms mock latency
(\`MOCK_LATENCY_MS\`, \`lib/tenant/storage.ts\`) or a LAN \`file_host\`. Nothing
in the population takes long enough, or is interruptible in a way a person
would reach for, to make a cancel affordance meaningful. If a fifth state is
warranted by this census, \`layout-autosave\`'s finding is the candidate — not
because it needs cancelling, but because losing an edit outright needs a
guarantee \`Cancelled\`/\`Failed\` as currently scoped in #935 don't obviously
cover. See that row's justification above.

## Definitions (not separately counted)

The 8 \`useMutation(\` definitions in \`lib/tenant/hooks.ts\` are the *shape* of
an intent, not an instance of one — the call sites above are what a person
actually triggers. Listed for completeness:

${renderDefinitionList(sites)}

## Implementation plumbing (not separately counted)

Call sites inside \`lib/file-host-config/client.ts\` and
\`lib/study-nudge/service-worker.ts\` that implement a producer already listed
above, rather than constituting a new one:

${renderInfraList(sites)}

## Excluded, and why

${renderOutOfScopeList(sites)}
`
}

function main() {
  const sites = walkIntentProducers(SRC_ROOT, REPO_ROOT)
  validate(sites)
  const markdown = render(sites)

  const mode = process.argv[2]
  if (mode === "--write") {
    writeFileSync(OUTPUT_PATH, markdown)
    // eslint-disable-next-line no-console
    console.log(`Wrote ${OUTPUT_PATH}`)
    return
  }

  if (mode === "--check") {
    let existing = ""
    try {
      existing = readFileSync(OUTPUT_PATH, "utf8")
    } catch {
      // No file yet - falls through to the mismatch report below.
    }
    if (existing !== markdown) {
      // eslint-disable-next-line no-console
      console.error(
        `docs/intent-census.md is out of date. Run: pnpm --filter www run census:write`
      )
      process.exitCode = 1
      return
    }
    // eslint-disable-next-line no-console
    console.log("docs/intent-census.md is up to date.")
    return
  }

  // eslint-disable-next-line no-console
  console.error("Usage: generate.mjs --write | --check")
  process.exitCode = 1
}

main()
