import type { Rule } from "eslint"

/**
 * Class patterns that hand overflow to a scrollbar rather than bounding,
 * tabbing, or paging the content. `overflow-x-auto` is deliberately absent:
 * a horizontally scrolling strip (a toolbar of stats, a row of chips) is a
 * legitimate, bounded pattern.
 */
const GREEDY = [
  /(^|\s)overflow-auto(\s|$)/,
  /(^|\s)overflow-y-auto(\s|$)/,
  /(^|\s)overflow-y-scroll(\s|$)/,
  /(^|\s)max-h-\[\d+vh\]/,
]

const OPT_OUT = "scroll-intent:"

export const noGreedyOverflow: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Ban vertical scroll fallbacks in overlay surfaces; fit the content to the box (tabs, paging, a rail) or declare the scroll deliberate",
    },
    schema: [
      {
        type: "object",
        properties: {
          // Files whose whole job is a long scrollable surface.
          allowInFiles: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      greedyOverflow:
        'Greedy vertical overflow ("{{match}}"). A dialog/drawer/sheet should fit its content to the box — bound the surface and split the content with tabs, a paged list (useFittedPage), or a stage rail. If this scroll really is the interaction, declare it: put the class list in braces with a `// {{optOut}} <reason>` comment above it — className={{"{"}}/* {{optOut}} … */ "…overflow-auto"{{"}"}} — and add data-scroll-intent to the element. A comment outside the braces does not attach to the string and will not be seen.',
    },
  },
  create(context) {
    const rawAllow: unknown = context.options[0]?.allowInFiles
    const allowInFiles: Array<string> = Array.isArray(rawAllow)
      ? rawAllow.filter((entry): entry is string => typeof entry === "string")
      : []

    const filename = context.filename
    if (allowInFiles.some((fragment) => filename.includes(fragment))) {
      return {}
    }

    const source = context.sourceCode

    function hasOptOut(node: Rule.Node): boolean {
      return source
        .getCommentsBefore(node)
        .some((comment) => comment.value.includes(OPT_OUT))
    }

    function check(value: string, node: Rule.Node): void {
      const pattern = GREEDY.find((candidate) => candidate.test(value))
      if (!pattern) return
      // The opt-out can sit on the attribute, the string, or the enclosing
      // JSX element — authors reach for whichever reads best.
      let scope: Rule.Node | null = node
      for (let depth = 0; depth < 3 && scope; depth += 1) {
        if (hasOptOut(scope)) return
        scope = scope.parent ?? null
      }

      const match = pattern.exec(value)?.[0]?.trim() ?? "overflow"
      context.report({
        node,
        messageId: "greedyOverflow",
        data: { match, optOut: OPT_OUT },
      })
    }

    return {
      Literal(node): void {
        if (typeof node.value !== "string") return
        check(node.value, node)
      },
      TemplateElement(node): void {
        check(node.value.raw, node)
      },
    }
  },
}
