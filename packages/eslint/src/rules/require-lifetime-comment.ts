import type { Rule } from "eslint"

import { commentBlockAbove } from "./comment-block.js"

/** The two Charter §5/§8 rules whose exemptions must say what ends a resource. */
const LIFETIME_RULES = new Set([
  "extension-charter/require-named-lifetime",
  "extension-charter/require-scoped-lifetime",
])

const DIRECTIVE = /^\s*eslint-disable(?:-next-line|-line)?(?:\s+([^]*))?$/

/**
 * Invariant L3 in extensions/common's GOOD_CITIZEN.md: an exemption from
 * `require-named-lifetime` or `require-scoped-lifetime` names what ends the
 * resource, in a line starting `Lifetime:` inside the unbroken run of `//`
 * comment lines directly above the directive (for `eslint-disable-line`,
 * directly above the line it sits on).
 *
 * The rule checks only that the line is there. Whether what it says is true
 * needs a person to read it, and that half of L3 stays with review.
 *
 * It reads directives that name either rule. A bare `eslint-disable` names
 * none; whether one silences a lifetime rule depends on the line below it,
 * so those stay with review.
 */
export const requireLifetimeComment: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a `Lifetime:` comment line directly above every exemption from the Charter's lifetime rules (Good-Citizen invariant L3)",
    },
    schema: [],
    messages: {
      missing:
        "An exemption from {{rules}} needs a line starting `Lifetime:` in the `//` comment block directly above it, saying what ends the resource (GOOD_CITIZEN.md, L3).",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    return {
      Program(): void {
        const blockAbove = commentBlockAbove(sourceCode)
        for (const comment of sourceCode.getAllComments()) {
          const rules = exemptedLifetimeRules(comment.value)
          if (rules.length === 0 || !comment.loc) continue
          const named = blockAbove(comment.loc.start.line, (above) =>
            above.value.trimStart().startsWith("Lifetime:")
          )
          if (named) continue
          context.report({
            loc: { start: comment.loc.start, end: comment.loc.end },
            messageId: "missing",
            data: { rules: rules.join(" and ") },
          })
        }
      },
    }
  },
}

/** The lifetime rules a directive comment exempts; none for other comments. */
function exemptedLifetimeRules(value: string): Array<string> {
  const match = DIRECTIVE.exec(value)
  if (!match) return []
  const list = (match[1] ?? "").split(/\s--(?:\s|$)/)[0] ?? ""
  return list
    .split(",")
    .map((name) => name.trim())
    .filter((name) => LIFETIME_RULES.has(name))
}
