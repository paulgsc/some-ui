/**
 * The teaching audit of a scene tree: whether each choice is an item the
 * handheld lesson may ask (docs/makjang/README.md, "4. Authoring: two audits,
 * by owner").
 *
 * It runs after makjang's story audit, on a tree whose shape already holds,
 * and checks what makjang carries without reading:
 * - each choice's `check` loads as a `pick-valid` or `odd-one-out` probe (a
 *   `build` has no candidates to be options);
 * - its candidate ids match the choice's option ids one to one, since an
 *   option shows the candidate with its id;
 * - the probe rules every handheld item is held to (`auditItem`), plus two a
 *   choice adds: no candidate is an English gloss (canon v1.13, a choice is
 *   about its scene), an odd-one-out names its `source`, having no anchor
 *   line to default to, and no two checks share an id;
 * - every scene names a feeling the renderer has (`core/feeling`).
 *
 * A choice with an error is not asked: its scene becomes a leaf and the
 * subtree under it is dropped, the tree's version of Remark 4.7's "dropped at
 * load" (`withholdErrors` is the conversation file's). A feeling outside the
 * vocabulary or a level outside TOPIK's has no smaller piece to drop, so it
 * rejects the tree. Findings are reported over the whole tree, a dropped
 * subtree included, so one round of fixes covers everything.
 *
 * Invariants (full text in docs/makjang/README.md, "Invariants"):
 * - MK4: every choice the handheld asks has passed this audit; a rejected
 *   one is pruned to a leaf.
 */

import type { Lesson, Scene } from "@some-ui/makjang"
import { GLOSS_RELATION, ProbeSchema } from "@topik/lib/topik"
import { FEELING_KEYS, isFeelingKey } from "@topik/lib/topik/core/feeling"
import type { ChoiceProbe } from "@topik/lib/topik/core/probe"
import type { ProbeReport } from "@topik/lib/topik/core/probe-audit"
import { auditItem } from "@topik/lib/topik/core/probe-audit"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"

export type TreeFinding = {
  /** Shape (makjang's story audit) or items (this one). */
  audit: "story" | "teaching"
  /** An error rejects the tree or drops a choice; a warning is judgement. */
  severity: "error" | "warning"
  /** A dotted path into the tree (`root.choice.options.1.child.choice`). */
  path: string
  message: string
}

export type TeachingAudit =
  | {
      ok: true
      /** The tree as it plays: every choice an error names is pruned. */
      lesson: Lesson<ChoiceProbe>
      findings: Array<TreeFinding>
    }
  | { ok: false; findings: Array<TreeFinding> }

/** The check, if it may be asked as this choice; findings either way. */
function auditChoice(
  check: unknown,
  optionIds: Array<string>,
  probeIds: Set<string>,
  report: ProbeReport
): ChoiceProbe | undefined {
  const parsed = ProbeSchema.safeParse(check)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : ""
    report(
      "error",
      `the check does not load - ${where}${issue?.message ?? "invalid probe"}`
    )
    return undefined
  }
  const probe = parsed.data
  if (probe.kind === "build") {
    report(
      "error",
      "a build check has no candidates, so it cannot be a choice: use pick-valid or odd-one-out"
    )
    return undefined
  }

  // Set from inside `reject`, which `auditItem` calls too.
  const verdict = { rejected: false }
  const reject: ProbeReport = (severity, message) => {
    if (severity === "error") verdict.rejected = true
    report(severity, message)
  }

  // First tries are keyed by the probe's id (Thm. 1.1), across the tree.
  if (probeIds.has(probe.id)) {
    reject("error", `check id "${probe.id}" is already another choice's`)
  }
  probeIds.add(probe.id)

  const candidateIds = new Set<string>()
  probe.options.forEach((option, index) => {
    if (option.id === undefined) {
      reject("error", `candidate ${index} ("${option.text}") has no id`)
    } else if (candidateIds.has(option.id)) {
      reject("error", `candidate id "${option.id}" is used twice`)
    } else {
      candidateIds.add(option.id)
    }
    if (option.relation.trim().toLowerCase() === GLOSS_RELATION) {
      reject(
        "error",
        `candidate "${option.text}" is a gloss: a choice's candidates carry no English rendering, which would spell out what the item tests (canon Prop. 4.2)`
      )
    }
  })
  for (const id of optionIds) {
    if (!candidateIds.has(id)) {
      reject("error", `option "${id}" names no candidate of the check`)
    }
  }
  for (const id of candidateIds) {
    if (!optionIds.includes(id)) {
      reject("error", `candidate "${id}" is no option of the choice`)
    }
  }

  if (probe.anchorMessageId !== undefined) {
    report(
      "warning",
      "anchorMessageId is ignored in a scene tree: a choice is asked at the end of its scene; set `source` to the utterance it tests"
    )
  }
  if (probe.kind === "odd-one-out" && !probe.source?.trim()) {
    reject(
      "error",
      "an odd-one-out in a scene tree names its `source`: there is no anchor line to transform"
    )
  }
  auditItem(probe, probe.source ?? "", reject)

  return verdict.rejected ? undefined : probe
}

type Context = {
  findings: Array<TreeFinding>
  /** Set by a finding no pruning can mend. */
  rejected: boolean
  /** Every check id seen so far, in depth-first order. */
  probeIds: Set<string>
}

const reporter =
  (context: Context, path: string): ProbeReport =>
  (severity, message) => {
    context.findings.push({ audit: "teaching", severity, path, message })
  }

function rejectTree(context: Context, path: string, message: string): void {
  context.rejected = true
  reporter(context, path)("error", message)
}

/** Audits `scene` and its subtree; returns it as it plays. */
function auditScene(
  scene: Scene<unknown>,
  path: string,
  context: Context
): Scene<ChoiceProbe> {
  if (!isFeelingKey(scene.feeling)) {
    rejectTree(
      context,
      `${path}.feeling`,
      `"${scene.feeling}" is not a feeling the renderer has (${FEELING_KEYS.join(", ")})`
    )
  }

  const { choice, ...leaf } = scene
  if (choice === undefined) return leaf
  const choicePath = `${path}.choice`
  const check = auditChoice(
    choice.check,
    choice.options.map(({ id }) => id),
    context.probeIds,
    reporter(context, `${choicePath}.check`)
  )
  const options = choice.options.map((option, index) => ({
    ...option,
    child: auditScene(
      option.child,
      `${choicePath}.options.${index}.child`,
      context
    ),
  }))
  if (check === undefined) {
    reporter(context, choicePath)(
      "error",
      "not asked: this scene ends here, and the scenes under its options are dropped"
    )
    return leaf
  }
  return { ...leaf, choice: { ...choice, check, options } }
}

/**
 * Every teaching finding for a tree that passed the story audit, and the tree
 * as it plays. Never throws.
 */
export function auditTeaching(lesson: Lesson<unknown>): TeachingAudit {
  const context: Context = {
    findings: [],
    rejected: false,
    probeIds: new Set(),
  }
  if (!TOPIK_LEVELS.some((level) => level === lesson.level)) {
    rejectTree(context, "level", `${lesson.level} is not a TOPIK level (1-6)`)
  }
  const root = auditScene(lesson.root, "root", context)
  if (context.rejected) return { ok: false, findings: context.findings }
  if (root.choice === undefined) {
    reporter(context, "root")(
      "warning",
      "no choice is asked: the lesson plays as one scene"
    )
  }
  return { ok: true, lesson: { ...lesson, root }, findings: context.findings }
}
