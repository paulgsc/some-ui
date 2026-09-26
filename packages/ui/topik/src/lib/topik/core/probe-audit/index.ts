/**
 * What a topik file's probes will actually do on the handheld surface, said
 * before anyone studies them.
 *
 * Probes fail quietly by design: a malformed one is dropped at load rather
 * than failing the topik (canon Rem. 4.7, Thm. 8.2), an anchor that names no
 * line falls back to the last one, a build that cannot be tiled is left out
 * (`isDeliverable`). That is the right runtime behaviour and the wrong
 * authoring one - a generated file can lose half its probes and still load.
 * This audit reports each of those outcomes by probe, reusing the functions
 * that decide them, so it cannot disagree with the lesson about what happens.
 *
 * Two findings are pedagogy rather than mechanics, both from canon §4: a probe
 * whose keyed candidate is a gloss is a first-order item (Prop. 4.2, withheld
 * by Cor. 4.5), and a structural candidate that rewrites more than its
 * relation acts on lets content-word matching back in.
 */

import type { Message, MorphismRelation, Probe } from "@topik/lib/topik"
import { ProbeSchema, TopikFileSchema } from "@topik/lib/topik"
import { anchorOf, isDeliverable } from "@topik/lib/topik/core/lesson-track"
import {
  diffUtterance,
  MIN_DIFF_SIMILARITY,
} from "@topik/lib/topik/core/morph-diff"
import { acceptedForms } from "@topik/lib/topik/core/probe"
import {
  excerptRevealsAnswer,
  tokenize,
} from "@topik/lib/topik/core/tile-assembly"
import { assertNever } from "some-ui-utils"

export type ProbeFinding = {
  /** The conversation's authored id, or null for a file-level finding. */
  batch: number | null
  /** The probe's id, or its position (`#2`) when it has none. */
  probe: string | null
  /** An error changes what is delivered; a warning is authoring judgement. */
  severity: "error" | "warning"
  message: string
}

/** Relations whose validity is structural - canon Def. 4.7's order two. */
const STRUCTURAL: ReadonlySet<MorphismRelation> = new Set([
  "past",
  "future",
  "negation",
  "question",
  "paraphrase",
])

/** Relations whose validity is pragmatic - order three. */
const PRAGMATIC: ReadonlySet<MorphismRelation> = new Set([
  "reply",
  "register",
  "situation",
])

const lineText = (message: Message): string => message.korean || message.content

/** Spacing and closing punctuation aside - but not `?`, which is the whole of
 * a question form's change. */
const normalize = (text: string): string => text.replace(/[\s.,!~…'"]+/g, "")

/**
 * The relation a probe's answer stands in: the one invalid candidate of an
 * odd-one-out, the one valid candidate of a pick-valid, a build's own. It is
 * what the learner is actually judged on, so it decides the probe's order.
 */
function keyedRelation(probe: Probe): MorphismRelation | undefined {
  switch (probe.kind) {
    case "odd-one-out": {
      return probe.options.find((option) => !option.valid)?.relation
    }
    case "pick-valid": {
      return probe.options.find((option) => option.valid)?.relation
    }
    case "build": {
      return probe.relation
    }
    default: {
      return assertNever(probe)
    }
  }
}

function auditProbe(
  probe: Probe,
  messages: Array<Message>,
  report: (severity: ProbeFinding["severity"], message: string) => void
): void {
  if (probe.anchorMessageId === undefined) {
    report(
      "warning",
      "no anchorMessageId: its line is guessed from `source`, and it is asked after the last line if nothing matches"
    )
  } else if (!messages.some((m) => m.id === probe.anchorMessageId)) {
    report(
      "error",
      `anchorMessageId "${probe.anchorMessageId}" is not a line of this conversation; it would be asked after the last line instead`
    )
  }

  const anchor = anchorOf(
    { anchorMessageId: probe.anchorMessageId, excerpt: probe.source },
    messages
  )
  const anchorLine = messages[anchor]
  const source = probe.source ?? (anchorLine ? lineText(anchorLine) : "")

  const keyed = keyedRelation(probe)
  if (keyed === "gloss") {
    report(
      "error",
      "its answer is a gloss - a first-order item (canon Prop. 4.2), which the handheld lesson must not ask (Cor. 4.5)"
    )
  } else if (keyed !== undefined) {
    const expected = STRUCTURAL.has(keyed) ? 2 : PRAGMATIC.has(keyed) ? 3 : null
    if (expected !== null && expected !== probe.order) {
      report(
        "warning",
        `declared order ${probe.order}, but its answer is a "${keyed}" relation, which is order ${expected} (canon Def. 4.7)`
      )
    }
  }

  if (probe.kind === "build") {
    if (!isDeliverable(probe)) {
      const split = tokenize(probe.target)
      report(
        "error",
        split === null
          ? `target "${probe.target}" cannot be split into tiles (one word needs 2+ Hangul syllables); it is left out on handheld`
          : `target "${probe.target}" needs ${split.tokens.length} tiles, over the limit; it is left out on handheld`
      )
    }
    if (source !== "" && normalize(source) === normalize(probe.target)) {
      report("error", "target is the source itself: nothing to transform")
    }
    if (source !== "" && excerptRevealsAnswer(source, acceptedForms(probe))) {
      report(
        "warning",
        "the source contains the answer, so the source line is hidden; the prompt has to stand on its own"
      )
    }
    const pieces = new Set(tokenize(probe.target)?.tokens ?? [])
    for (const distractor of probe.distractors ?? []) {
      if (pieces.has(distractor)) {
        report(
          "warning",
          `distractor "${distractor}" is a piece of the answer and is never shown`
        )
      }
    }
    return
  }

  const seen = new Set<string>()
  for (const option of probe.options) {
    const label = `"${option.text}"`
    if (seen.has(option.text)) {
      report("error", `candidate ${label} appears twice`)
    }
    seen.add(option.text)
    if (option.why.trim() === "") {
      report(
        "error",
        `candidate ${label} has no \`why\`: its feedback line would be blank`
      )
    }
    if (
      option.lang !== "en" &&
      STRUCTURAL.has(option.relation) &&
      source !== ""
    ) {
      if (normalize(option.text) === normalize(source)) {
        report(
          "warning",
          `candidate ${label} is the source unchanged, not a ${option.relation}`
        )
        continue
      }
      const { similarity } = diffUtterance(source, option.text)
      if (similarity < MIN_DIFF_SIMILARITY) {
        report(
          "warning",
          `candidate ${label} rewrites more than a ${option.relation} acts on (similarity ${similarity.toFixed(2)}): hold the content words fixed (canon Prop. 4.2); its diff will not be shown`
        )
      }
    }
  }
}

/**
 * Every finding for a topik file, in file order. Empty means every probe is
 * delivered as written. `raw` is the parsed JSON, before any schema - the
 * point is to see what the schema would silently drop.
 */
export function auditTopikFile(raw: unknown): Array<ProbeFinding> {
  const parsed = TopikFileSchema.safeParse(raw)
  if (!parsed.success || !Array.isArray(raw)) {
    const issue = parsed.error?.issues[0]
    return [
      {
        batch: null,
        probe: null,
        severity: "error",
        message: `not a topik file${issue ? `: ${issue.path.join(".")} ${issue.message}` : ""}`,
      },
    ]
  }

  const findings: Array<ProbeFinding> = []
  parsed.data.forEach((batch, index) => {
    const entry: unknown = raw[index]
    const rawProbes: Array<unknown> =
      typeof entry === "object" &&
      entry !== null &&
      "probes" in entry &&
      Array.isArray(entry.probes)
        ? entry.probes
        : []

    if (rawProbes.length === 0) {
      findings.push({
        batch: batch.id,
        probe: null,
        severity: "warning",
        message:
          "no probes: this conversation is listening only on handheld (canon Cor. 4.5)",
      })
      return
    }

    const ids = new Set<string>()
    rawProbes.forEach((candidate, position) => {
      const name =
        typeof candidate === "object" &&
        candidate !== null &&
        "id" in candidate &&
        typeof candidate.id === "string"
          ? candidate.id
          : `#${position}`
      const report = (
        severity: ProbeFinding["severity"],
        message: string
      ): void => {
        findings.push({ batch: batch.id, probe: name, severity, message })
      }

      const probe = ProbeSchema.safeParse(candidate)
      if (!probe.success) {
        const issue = probe.error.issues[0]
        const where = issue?.path.length ? `${issue.path.join(".")}: ` : ""
        report(
          "error",
          `dropped at load - ${where}${issue?.message ?? "invalid probe"}`
        )
        return
      }
      if (ids.has(probe.data.id)) {
        report(
          "error",
          "shares its id with an earlier probe in this conversation; only the first is delivered"
        )
        return
      }
      ids.add(probe.data.id)
      auditProbe(probe.data, batch.messages, report)
    })
  })
  return findings
}
