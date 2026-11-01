import type { Rule } from "eslint"
import type * as ESTree from "estree"

/**
 * MIC7 (#2377): every way a take ends is said once, in the kit's table
 * (`TAKE_ENDING_WORDS`, from `VOICE_NOTE_SAID` and `RECORDING_FAILURE_COPY`).
 * Outside the owner's files (`owner`, a path fragment) a string, a
 * template's first text or a JSX text that starts with one of those
 * sentences' opening clause (`leads`: "Too short to keep", "Another screen
 * is recording", …), in any case and with either apostrophe, is a screen's
 * own copy of it and is reported. A paraphrase is not: a screen may say its
 * own thing in its own words. A screen
 * reads the kit's line, or its own table starts from the kit's.
 */
export const noLocalTakeWords: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid a copy of @some-ui/voice-capture's take-ending words outside its table",
    },
    schema: [
      {
        type: "object",
        properties: {
          owner: { type: "string" },
          leads: { type: "array", items: { type: "string" } },
        },
        required: ["owner", "leads"],
        additionalProperties: false,
      },
    ],
    messages: {
      copy: '"{{lead}}…" is how @some-ui/voice-capture says a take ended. Say it from the kit\'s table (`TAKE_ENDING_WORDS`, `TAKE_WORDS.ended`), not a copy of your own.',
    },
  },
  create(context) {
    const options: unknown = context.options[0]
    const owner = String(Reflect.get(Object(options), "owner"))
    const leadOption: unknown = Reflect.get(Object(options), "leads")
    const leads = Array.isArray(leadOption)
      ? leadOption.filter((lead): lead is string => typeof lead === "string")
      : []
    const filename = context.filename.replaceAll("\\", "/")
    if (filename.includes(owner)) return {}

    // Compared as a person reads them: any case, either apostrophe.
    const said = (text: string): string =>
      text
        .trimStart()
        .replaceAll(/[\u2018\u2019]/g, "'")
        .toLowerCase()
    const folded = leads.map((lead) => [lead, said(lead)] as const)

    function check(node: ESTree.Node, text: string | null | undefined): void {
      if (text == null) return
      const reads = said(text)
      const lead = folded.find(([, candidate]) =>
        reads.startsWith(candidate)
      )?.[0]
      if (lead !== undefined)
        context.report({ node, messageId: "copy", data: { lead } })
    }

    return {
      Literal(node): void {
        if (typeof node.value === "string") check(node, node.value)
      },
      TemplateLiteral(node): void {
        check(node, node.quasis[0]?.value.cooked)
      },
      // JSX is outside ESTree's map.
      JSXText(node: Rule.Node): void {
        const value: unknown = Reflect.get(node, "value")
        if (typeof value === "string") check(node, value)
      },
    }
  },
}
