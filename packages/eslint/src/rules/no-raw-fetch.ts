import type { Rule } from "eslint"

function normalized(path: string): string {
  return path.replaceAll("\\", "/")
}

export const noRawFetch: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid unbounded raw fetch calls in apps and packages; use @some-ui/fetch-kit instead",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowlist: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawFetch:
        "Raw fetch() has no timeout. Use @some-ui/fetch-kit, which declares a bounded default timeout.",
    },
  },
  create(context) {
    const filename = normalized(context.filename)
    const appIndex = filename.lastIndexOf("/apps/")
    const packageIndex = filename.lastIndexOf("/packages/")
    const extensionIndex = filename.lastIndexOf("/extensions/")
    if (
      Math.max(appIndex, packageIndex) === -1 ||
      extensionIndex > Math.max(appIndex, packageIndex)
    ) {
      return {}
    }

    const allowlistArr: Array<string> = context.options[0]?.allowlist ?? []
    const allowed = allowlistArr.some((entry) =>
      filename.endsWith(normalized(entry))
    )
    if (allowed) return {}

    return {
      CallExpression(node): void {
        if (node.callee.type !== "Identifier" || node.callee.name !== "fetch")
          return
        context.report({ node, messageId: "rawFetch" })
      },
    }
  },
}
