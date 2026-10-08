/**
 * Taking a scene tree back from a model: the tree's counterpart of
 * `intakeLesson` (docs/makjang/README.md, "4. Authoring"). Both audits are
 * described in `core/tree-audit`. Nothing is sent anywhere.
 */

import type { Lesson } from "@some-ui/makjang"
import { auditStory } from "@some-ui/makjang"
import type { ChoiceProbe } from "@topik/lib/topik/core/probe"
import type { TreeFinding } from "@topik/lib/topik/core/tree-audit"
import { auditTeaching } from "@topik/lib/topik/core/tree-audit"
import { isRecord, jsonValues } from "@topik/lib/topik/generation/intake"

export type TreeIntake =
  /** The reply holds no scene tree at all. */
  | { status: "absent"; error: string }
  /** A tree that cannot be played: every finding, by path. */
  | { status: "rejected"; findings: Array<TreeFinding> }
  | {
      status: "checked"
      lesson: Lesson<ChoiceProbe>
      findings: Array<TreeFinding>
    }

const isTree = (value: unknown): boolean => isRecord(value) && "root" in value

/** Reads a pasted reply. Never throws. */
export function intakeTree(reply: string): TreeIntake {
  const raw = jsonValues(reply).find(isTree)
  if (raw === undefined) {
    return {
      status: "absent",
      error:
        "No scene tree found. The reply should contain the tree as one JSON object with a `root` scene.",
    }
  }
  const story = auditStory(raw)
  if (!story.ok) {
    return {
      status: "rejected",
      findings: story.findings.map(({ path, message }) => ({
        audit: "story",
        severity: "error",
        path,
        message,
      })),
    }
  }
  const teaching = auditTeaching(story.lesson)
  if (!teaching.ok) {
    return { status: "rejected", findings: teaching.findings }
  }
  return {
    status: "checked",
    lesson: teaching.lesson,
    findings: teaching.findings,
  }
}

/** Where a finding is, as a person reads it: the path, or the lesson. */
const findingPlace = ({ path }: TreeFinding): string =>
  path === "" ? "the lesson" : path

/**
 * The findings, as a message to send back to the model that wrote the tree:
 * the loop that fixes it runs between the author and their model.
 */
export function treeFixRequest(findings: Array<TreeFinding>): string {
  return [
    "The app checked the scene tree you wrote and found these problems. Fix them and return the whole tree again, in one JSON block:",
    "",
    ...findings.map(
      (finding) =>
        `- ${finding.severity} (${finding.audit}) at ${findingPlace(finding)}: ${finding.message}`
    ),
    "",
  ].join("\n")
}

/** One finding as a list shows it. */
export type FindingRow = { key: string; error: boolean; text: string }

/**
 * A tree finding as the phone and the lesson CRM list it. The key carries the
 * position: two findings can read the same, and both are shown.
 */
export const treeFindingRow = (
  finding: TreeFinding,
  position: number
): FindingRow => ({
  key: `${position}:${finding.audit}:${finding.path}:${finding.message}`,
  error: finding.severity === "error",
  text: `${finding.severity === "error" ? "Error" : "Warning"} · ${finding.audit} · ${findingPlace(finding)}: ${finding.message}`,
})

/**
 * What a tree's audits mean for playing it, in one sentence; `null` when
 * every choice is asked as written.
 */
export function treeSummary(
  intake: Exclude<TreeIntake, { status: "absent" }>
): string | null {
  const { findings } = intake
  if (intake.status === "rejected") {
    return `This scene tree can't be played: ${findings.length} finding${findings.length === 1 ? "" : "s"}.`
  }
  if (findings.length === 0) return null
  return findings.some(({ severity }) => severity === "error")
    ? "A choice an error names is not asked: its scene ends there, and the scenes under it are dropped."
    : "Warnings only: the tree plays as written."
}
