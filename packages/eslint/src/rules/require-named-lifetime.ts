import type { Rule } from "eslint"

/**
 * Resources whose cost is *standing* — they keep running after the call
 * returns, for as long as nobody stops them.
 *
 * `setTimeout` is deliberately absent: a one-shot timer's lifetime is its
 * delay, which the call site already states. What this rule is about is a
 * resource whose lifetime is not visible from where it is created.
 *
 * `matchMedia` is absent too: it is standing only when subscribed to, and
 * its common use is a one-shot `matchMedia(q).matches` read. Telling the two
 * apart needs flow analysis this rule does not do.
 */
const STANDING_RESOURCES = new Set(["setInterval", "requestIdleCallback"])

/**
 * Good-Citizen Charter §5 — every standing resource names its full lifetime.
 *
 * ## Why "is there a matching clear?" is the wrong question
 *
 * `some-filter`'s per-tab 250ms polls hung a 200+ tab browser, and every one
 * had a matching `clearInterval`: a cleanup-pairing lint would have passed.
 * The defect was teardown wired to mode change and unload but not to
 * visibility. "Is this stopped on every transition that ought to stop it?"
 * is the question, and its answer is not at the call site but in whichever
 * module decides when teardown runs.

 *
 * ## So this rule does the only useful thing a linter can
 *
 * It makes the raw primitive unavailable, which forces the lifetime to be
 * named somewhere that *can* enforce it — ideally a lifecycle object the
 * caller has to hold, so the answer lives with the resource rather than in
 * a teardown three files away. The linter's job here is not to verify the
 * answer; it is to make the question unskippable.
 *
 * Exemptions are per call site and must carry a comment, which is the point:
 * the exemption list becomes a short, greppable audit trail of every
 * standing resource in the codebase, and adding to it is a deliberate act
 * rather than a default.
 */
export const requireNamedLifetime: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid standing resources (setInterval, requestIdleCallback) whose lifetime is not stated where they are created; drive them from a lifecycle whose stop/resume are required (Good-Citizen Charter §5)",
    },
    schema: [
      {
        type: "object",
        properties: {
          /** Extra global names to treat as standing resources. */
          additionalResources: { type: "array", items: { type: "string" } },
          /** Where the workspace's lifecycle helper lives, named in the message. */
          lifecycleModule: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unnamedLifetime:
        '"{{name}}" keeps running after this call returns, and nothing here says what stops it. Drive it from {{lifecycleModule}}, or exempt this call with a comment naming every transition that stops it. A matching clear is not an answer: the polls that hung a 200-tab profile all had one.',
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint.
    const extraArr: Array<string> =
      context.options[0]?.additionalResources ?? []
    const lifecycleModule: string =
      context.options[0]?.lifecycleModule ?? "your workspace's lifecycle helper"
    const resources = new Set([...STANDING_RESOURCES, ...extraArr])

    return {
      CallExpression(rawNode): void {
        const callee = rawNode.callee
        // Both `setInterval(...)` and `window.setInterval(...)`: the second
        // is the same resource wearing a receiver, and letting it through
        // would make the rule trivially avoidable.
        const name: string | null =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" &&
                !callee.computed &&
                callee.property.type === "Identifier"
              ? callee.property.name
              : null

        if (name === null || !resources.has(name)) return

        context.report({
          node: rawNode,
          messageId: "unnamedLifetime",
          data: { name, lifecycleModule },
        })
      },
    }
  },
}
