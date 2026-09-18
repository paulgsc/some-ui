import type { Rule } from "eslint"

/**
 * Resources whose cost is *standing* — they keep running after the call
 * returns, for as long as nobody stops them.
 *
 * `setTimeout` is deliberately absent: a one-shot timer's lifetime is its
 * delay, which the call site already states. What this rule is about is a
 * resource whose lifetime is not visible from where it is created.
 */
const STANDING_RESOURCES = new Set([
  "setInterval",
  "requestIdleCallback",
  "matchMedia",
])

/**
 * Good-Citizen Charter §5 — every standing resource names its full lifetime.
 *
 * ## Why "is there a matching clear?" is the wrong question
 *
 * This rule exists because of a measured incident, and the shape of that
 * incident is the whole justification for enforcing it this way rather than
 * the obvious way.
 *
 * `some-filter` ran three 250ms `setInterval` polls per tab. On a profile
 * carrying 200+ tabs that was thousands of callbacks per second across a
 * shared pool of content processes, and it hung the browser. Every one of
 * those `setInterval`s already had a matching `clearInterval` in a
 * `teardown()`. A cleanup-pairing lint would have passed, cleanly, on the
 * code that caused it.
 *
 * The defect was never a missing clear. It was that teardown had been wired
 * to *one* lifecycle — a mode change, and unload — and not to visibility, so
 * a tab the user opened once and left behind polled forever. "Is there a
 * matching clear?" is syntactically checkable and was already true. "Is this
 * stopped on every transition that ought to stop it?" is the question that
 * mattered, and no linter can answer it, because the answer is not at the
 * call site — it is in whichever module decides when teardown runs.
 *
 * ## So this rule does the only useful thing a linter can
 *
 * It makes the raw primitive unavailable, which forces the lifetime to be
 * named somewhere that *can* enforce it — a lifecycle type whose fields are
 * required, so an unanswered lifetime is a type error rather than an
 * omission nobody notices. The linter's job here is not to verify the
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
        "Forbid standing resources (setInterval, requestIdleCallback, matchMedia) whose lifetime is not stated where they are created; drive them from a lifecycle whose stop/resume are required (Good-Citizen Charter §5)",
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
        '"{{name}}" keeps running after this call returns, and nothing here says what stops it. Drive it from {{lifecycleModule}}, whose lifecycle type requires stop/resume together — or exempt this call with a comment naming when it stops. A matching clear is not an answer: the polls that hung a 200-tab profile all had one.',
    },
  },
  create(context) {
    // context.options is any[] per @types/eslint.
    const extraArr: Array<string> = context.options[0]?.additionalResources ?? []
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
