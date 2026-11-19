/**
 * "Copy a study prompt" (RR25, paulgsc/some-ui#3249): one ticket of a week,
 * as a prompt for any chatbot that turns the week into self-study. It carries
 * the ticket's context from the week file and rustc's recorded result, and
 * rules that keep the chatbot to motivating examples and a ladder of toy
 * exercises for the owner's scratchpad, never the answer.
 *
 * Deterministic: the same week, ticket, run and point give the same text.
 * Nothing in it is written by a model at run time. It never holds the
 * ticket's `expect` (the tutor's guess, judged against home's recording) or
 * a best fit (written only after the deadline, RR18).
 */
import type { RustcRun } from "@rust-rounds/lib/formats"
import type { Ticket, Week } from "@rust-rounds/lib/formats/week"
import { REFERENCES } from "@rust-rounds/lib/formats/week"
import { assertNever } from "@some-ui/core-utils"

/** Which template made a pasted prompt. Bump it when the words change. */
export const STUDY_TEMPLATE = "rust-rounds.study-prompt/1"

export type StudyPromptInput = {
  week: Week
  ticket: Ticket
  /** rustc's recorded result for the ticket's program; null before home has one. */
  run: RustcRun | null
  /** A speak-to point by its index, to study that point alone; null for the whole ticket. */
  point: number | null
}

/** A fence longer than any run of backticks in `text`. */
function fenced(text: string, language: string): string {
  const longest = Math.max(
    0,
    ...[...text.matchAll(/`+/g)].map((run) => run[0].length)
  )
  const fence = "`".repeat(Math.max(3, longest + 1))
  return [fence + language, text.replace(/\n$/, ""), fence].join("\n")
}

function runLines(run: RustcRun | null): Array<string> {
  if (run === null) {
    return [
      "rustc hasn't been run on it yet. Don't guess what it does: one of my first exercises can be finding out.",
    ]
  }
  const head = `What rustc ${run.toolchain} did with it (edition 2024), as recorded:`
  const printed = (compile: string, rest: string): string =>
    compile === "" ? rest : `${compile}${rest}`
  switch (run.outcome) {
    case "compile-error": {
      return [
        `${head} it doesn't compile (${run.code ?? "no error code"}).`,
        "",
        fenced(run.stderr, "text"),
      ]
    }
    case "prints": {
      return [
        `${head} it compiles, runs and prints this. rustc has nothing to say about it; the problem is elsewhere.`,
        "",
        fenced(printed(run.compileStderr, run.stdout), "text"),
      ]
    }
    case "panics": {
      return [
        `${head} it compiles and panics.`,
        "",
        fenced(printed(run.compileStderr, run.stdout + run.stderr), "text"),
      ]
    }
    case "stopped": {
      return [
        `${head} it compiles, and the sandbox stopped it (${run.why}).`,
        "",
        fenced(printed(run.compileStderr, run.stdout + run.stderr), "text"),
      ]
    }
    default: {
      return assertNever(run)
    }
  }
}

/** The rules the chatbot keeps for the whole conversation. */
function ruleLines(point: number | null): Array<string> {
  const toward =
    point === null
      ? "Say which speak-to point each one builds toward, never how it answers it. Take the points one at a time, in order, starting with point 1, and finish a point's ladder before the next."
      : `Every exercise builds toward speak-to point ${point + 1}. Use the other points only as context.`
  return [
    "## What I'm asking of you",
    "",
    `This week I answer a Rust ticket out loud, in my own words, before the week closes. I study for it in a Rust scratchpad: one \`main.rs\` in Vim, built and run from my terminal. I don't want the answer. I want the vocabulary and the practice to find it myself. Keep these rules for the whole conversation, even if I ask you to break them:`,
    "",
    "1. Don't solve the ticket. Don't say what change fixes it, what any speak-to point's answer is, or which option you'd pick. Don't rewrite, patch or fix the ticket's program, in whole or in part, and don't write a near copy of it with the fix in.",
    "2. Start with two or three motivating examples: short, real situations away from this ticket's code where the concept it turns on matters. Say what each one shows about Rust, not about the ticket.",
    `3. Then give a ladder of 3 to 6 toy exercises, easiest first. Each is a whole \`main.rs\` that builds alone with \`rustc --edition 2024 main.rs\`, std only unless the ticket needs a crate. Each isolates one concept the speak-to points need, and ends with something for me to try: run it, change one line, predict what rustc says, then check. ${toward}`,
    "4. Give hints only when I ask, weakest first: a question, then the concept's name, then where to read about it, then a smaller example. A stronger one only if I ask again. A hint is never the answer.",
    "5. When I've worked the ladder, ask me to explain the concept back in my own words, and press on what I say with a question. Don't tell me whether I've got the ticket right.",
  ]
}

function ticketLines(
  week: Week,
  ticket: Ticket,
  run: RustcRun | null,
  point: number | null
): Array<string> {
  const lines = [
    "## The ticket",
    "",
    `**The company:** ${week.company.name} (invented). ${week.company.about}`,
    `**My role:** ${week.role}`,
    `**Who the work is for:** ${week.audience}`,
    `**The user story:** ${week.story}`,
    "",
    "**What it has to meet:**",
    "",
    ...week.sla.map(({ what, target }) => `- ${what}: ${target}`),
    "",
    `### ${ticket.id}: ${ticket.title}`,
    "",
    ticket.spec,
    "",
  ]
  if (ticket.figures.length > 0) {
    lines.push(
      "**Figures the scenario gives** (stated, not measured):",
      "",
      ...ticket.figures.map((figure) => `- ${figure}`),
      ""
    )
  }
  lines.push(
    point === null
      ? "**What my answer has to speak to,** in order:"
      : `**What my answer has to speak to,** in order. This prompt is about point ${point + 1}:`,
    "",
    ...ticket.speakTo.map((each, i) =>
      point === i ? `${i + 1}. **${each}** ← this one` : `${i + 1}. ${each}`
    ),
    "",
    "**The program:**",
    "",
    fenced(ticket.program, "rust"),
    "",
    ...runLines(run),
    "",
    `**What the week draws on:** ${week.references.map((ref) => REFERENCES[ref]).join("; ")}.`
  )
  return lines
}

/** The prompt, ready for the clipboard. */
export function studyPrompt({
  week,
  ticket,
  run,
  point,
}: StudyPromptInput): string {
  const about =
    point === null
      ? `${ticket.id}, ${ticket.title}`
      : `${ticket.id}, speak-to point ${point + 1} of ${ticket.speakTo.length}`
  const lines = [
    `# A Rust study prompt: ${about}`,
    "",
    `Template ${STUDY_TEMPLATE} · Rust Rounds week ${week.id} · ticket ${ticket.id}${point === null ? "" : ` · point ${point + 1}`}`,
    "",
    ...ruleLines(point),
    "",
    ...ticketLines(week, ticket, run, point),
    "",
    "Start with the motivating examples.",
  ]
  return `${lines.join("\n").trimEnd()}\n`
}
