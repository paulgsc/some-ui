// The change-kind record (CLAUDE.md, "Two kinds of pull request"): every
// commit but a merge, a revert or a fixup carries `Change-Kind: story` or
// `Change-Kind: defect` in its final paragraph, and the `Promise:` and
// `Relates:` lines beside it follow their shapes:
//
//   Promise: <ID> <path>… | <dimension>, …
//   Relates: <ID> breaks | widens | shares <dimension>
//
// A `Relates:` line belongs to a defect (it relates a failing state to an
// earlier promise), so it needs `Change-Kind: defect` beside it.
//
// Whether the kind is the right one, and whether a promise's Family and Proof
// hold, is still review's (REVIEW.md, "Change kind"). This module checks only
// what a message shows. `scripts/check-commit-trailers.ts` runs it from the
// commit-msg hook over the message being written, and from pr.yml over every
// commit a pull request adds. Commits a bot writes are exempt (`isBotIdentity`,
// on the author or the committer: create-pull-request authors its commit as
// whoever started the workflow and commits it as `github-actions[bot]`).

const KIND_VALUES = new Set(["story", "defect"])
const PROMISE_ID = "[A-Z]{1,4}\\d+"
const PROMISE_SHAPE = new RegExp(`^${PROMISE_ID}\\s+\\S.*?\\s+\\|\\s+\\S.*$`)
const RELATES_SHAPE = new RegExp(
  `^${PROMISE_ID}\\s+(?:breaks|widens|shares\\s+\\S.*)$`
)
const TRAILER_LINE = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*?)\s*$/
const RECORD_KEYS = ["Change-Kind", "Promise", "Relates"] as const
type RecordKey = (typeof RECORD_KEYS)[number]

// commitlint's default ignores (`@commitlint/is-ignored`'s `wildcards`),
// kept in step by hand because this runs with no install: merges, reverts and
// reapplies, the autosquash prefixes and a bare version bump.
const EXEMPT_SUBJECT = [
  /^Merge (?:pull request|branch|tag) /,
  /^Merge .*? into /,
  /^[Rr]evert /,
  /^[Rr]eapply /,
  /^(?:amend|fixup|squash)!/,
  /^(?:Merged .*?(?:in|into) .*|Merged PR .*: .*)/,
  /^Merge remote-tracking branch/,
  /^Automatic merge/,
  /^Auto-merged .*? into /,
]
const VERSION_BUMP =
  /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export type TrailerFinding =
  | { readonly kind: "missingKind" }
  | { readonly kind: "kindNotFinal" }
  | { readonly kind: "duplicateKind" }
  | { readonly kind: "badKind"; readonly value: string }
  | { readonly kind: "notFinal"; readonly key: "Promise" | "Relates" }
  | { readonly kind: "badPromise"; readonly value: string }
  | { readonly kind: "badRelates"; readonly value: string }
  | { readonly kind: "relatesOnStory" }

/**
 * The message as git stores it: comment lines and everything below a
 * scissors line removed, trailing blank lines trimmed. Only a message from a
 * file the commit-msg hook receives needs this; git has already cleaned one
 * read back from a commit.
 */
export function cleanCommitMessage(raw: string): string {
  const lines: Array<string> = []
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    if (/^# -+ >8 -+$/.test(line)) break
    if (line.startsWith("#")) continue
    lines.push(line)
  }
  return lines.join("\n").trim()
}

function isExemptSubject(message: string): boolean {
  const subject = message.trimStart().split("\n", 1)[0] ?? ""
  if (EXEMPT_SUBJECT.some((pattern) => pattern.test(subject))) return true
  const version = subject
    .replace(/^chore(?:\([^)]+\))?:/, "")
    .replace(/[[(](?:skip|ci)[-\s](?:ci|skip)[\])]/i, "")
    .trim()
  return VERSION_BUMP.test(version)
}

/** True for an identity GitHub marks as an app (`name[bot]`). */
export function isBotIdentity(name: string, email: string): boolean {
  return (
    name.trim().endsWith("[bot]") ||
    /\[bot\]@users\.noreply\.github\.com$/i.test(email.trim())
  )
}

function recordLines(paragraph: string): Array<[RecordKey, string]> {
  const found: Array<[RecordKey, string]> = []
  for (const line of paragraph.split("\n")) {
    const match = TRAILER_LINE.exec(line)
    if (!match) continue
    const key = RECORD_KEYS.find((k) => k === match[1])
    if (key) found.push([key, match[2] ?? ""])
  }
  return found
}

/**
 * Findings for one commit message (already cleaned), in a stable order; empty
 * when the record is well formed or the subject is exempt.
 */
export function checkCommitTrailers(message: string): Array<TrailerFinding> {
  const text = message.trim()
  if (text === "" || isExemptSubject(text)) return []

  const paragraphs = text.split(/\n[ \t]*\n/)
  const final = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : ""
  const earlier = paragraphs.slice(1, -1).join("\n\n")
  const inFinal = recordLines(final ?? "")
  const inEarlier = recordLines(earlier)
  const findings: Array<TrailerFinding> = []

  const kinds = inFinal.filter(([key]) => key === "Change-Kind")
  if (kinds.length === 0) {
    findings.push(
      inEarlier.some(([key]) => key === "Change-Kind")
        ? { kind: "kindNotFinal" }
        : { kind: "missingKind" }
    )
  } else if (kinds.length > 1) {
    findings.push({ kind: "duplicateKind" })
  }
  for (const [, value] of kinds) {
    if (!KIND_VALUES.has(value)) findings.push({ kind: "badKind", value })
  }

  for (const key of ["Promise", "Relates"] as const) {
    if (inEarlier.some(([k]) => k === key)) {
      findings.push({ kind: "notFinal", key })
    }
  }
  for (const [key, value] of inFinal) {
    if (key === "Promise" && !PROMISE_SHAPE.test(value)) {
      findings.push({ kind: "badPromise", value })
    }
    if (key === "Relates" && !RELATES_SHAPE.test(value)) {
      findings.push({ kind: "badRelates", value })
    }
  }
  if (
    inFinal.some(([key]) => key === "Relates") &&
    kinds.length === 1 &&
    kinds[0]?.[1] === "story"
  ) {
    findings.push({ kind: "relatesOnStory" })
  }
  return findings
}

/** One human-readable line per finding, naming the fix. */
export function describeTrailerFinding(finding: TrailerFinding): string {
  switch (finding.kind) {
    case "missingKind": {
      return "no Change-Kind trailer. End the message with a paragraph holding `Change-Kind: story` or `Change-Kind: defect`."
    }
    case "kindNotFinal": {
      return "Change-Kind is not in the final paragraph. Remove the blank line between it and the lines below it (Co-Authored-By and the rest)."
    }
    case "duplicateKind": {
      return "more than one Change-Kind trailer. A commit is one kind; a change that is both is two PRs."
    }
    case "badKind": {
      return `Change-Kind is \`${finding.value}\`; it must be \`story\` or \`defect\`.`
    }
    case "notFinal": {
      return `${finding.key} is not in the final paragraph. Keep it with Change-Kind, with no blank line between them.`
    }
    case "badPromise": {
      return `\`Promise: ${finding.value}\` does not read \`Promise: <ID> <path>… | <dimension>, …\` (an ID such as SS2, its scope's paths, then \` | \` and its Family's dimensions).`
    }
    case "badRelates": {
      return `\`Relates: ${finding.value}\` does not read \`Relates: <ID> breaks\`, \`Relates: <ID> widens\` or \`Relates: <ID> shares <dimension>\`.`
    }
    case "relatesOnStory": {
      return "Relates: relates a failing state to an earlier promise, so it goes with `Change-Kind: defect`, not story."
    }
    default: {
      const unhandled: never = finding
      throw new Error(`Unhandled trailer finding: ${String(unhandled)}`)
    }
  }
}
