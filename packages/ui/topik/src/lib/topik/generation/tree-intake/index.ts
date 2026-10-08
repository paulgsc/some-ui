/**
 * Taking a scene tree back from a model (docs/makjang/README.md,
 * "4. Authoring").
 *
 * The tree's counterpart of `intakeLesson`: it finds the tree in whatever was
 * pasted, holds it to makjang's story audit (shape), then to topik's teaching
 * audit (items), in the browser. A story finding rejects the tree whole; a
 * teaching finding drops the choice it names, and the tree plays without it.
 * Nothing is sent anywhere.
 */

import type { Lesson } from "@some-ui/makjang"
import { auditStory } from "@some-ui/makjang"
import type { ChoiceProbe } from "@topik/lib/topik/core/probe"
import type { TreeFinding } from "@topik/lib/topik/core/tree-audit"
import { auditTeaching } from "@topik/lib/topik/core/tree-audit"
import { jsonValues } from "@topik/lib/topik/generation/intake"

export type TreeIntake =
  /** The reply holds no scene tree at all. */
  | { status: "absent"; error: string }
  /** A tree that cannot be played: every finding, by path. */
  | { status: "rejected"; findings: Array<TreeFinding> }
  | {
      status: "checked"
      /** The tree as it plays: every choice an error names is pruned. */
      lesson: Lesson<ChoiceProbe>
      findings: Array<TreeFinding>
    }

const isTree = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "root" in value

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
export const findingPlace = ({ path }: TreeFinding): string =>
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
