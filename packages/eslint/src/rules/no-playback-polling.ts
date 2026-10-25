import type { Rule } from "eslint"
import type * as ESTree from "estree"

import { isGlobal, PAGE_LIFETIME_TARGETS } from "./require-scoped-lifetime.js"

/** A `Disposables` (or any scope helper) method that repeats on a schedule. */
const REPEATING_METHODS = new Set(["interval", "loop"])
/** Media events that fire several times a second while a video plays. */
const POLLING_EVENTS = new Set(["timeupdate", "progress"])
const POLLING_HANDLERS = new Set(["ontimeupdate", "onprogress"])
const EXTENSION_NAMESPACES = new Set(["browser", "chrome"])

/**
 * Invariant LP1 in extensions/some-drama's README ("Live playback"): playback
 * is read on events, never on a schedule. In an adopted scope this reports
 * the names a schedule is built from:
 *
 *   - a call to the global `setInterval` (also as `window.setInterval`), or
 *     to a method named `interval` or `loop` on anything;
 *   - `browser.alarms` or `chrome.alarms`;
 *   - the event names `timeupdate` and `progress` as a string, and the
 *     `ontimeupdate` / `onprogress` handler properties.
 *
 * A `setTimeout` re-armed from its own callback is a schedule too, but
 * telling it from a one-shot needs data flow, so it stays with review (LP1's
 * falsifier). Off in the shared config; some-drama turns it on for the
 * scope LP1 names.
 */
export const noPlaybackPolling: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Read playback on events, never on a schedule (some-drama invariant LP1)",
    },
    schema: [],
    messages: {
      timer:
        "`{{name}}` repeats on a schedule: read playback on a message, a hotkey or a media event instead (some-drama README, LP1).",
      alarms:
        "`{{name}}.alarms` wakes on a schedule: read playback on a message, a hotkey or a media event instead (some-drama README, LP1).",
      event:
        "`{{name}}` fires several times a second while a video plays, which turns the tab into a poller: listen for the events in PLAYBACK_EVENTS instead (some-drama README, LP1).",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    return {
      CallExpression(node): void {
        const callee = node.callee
        if (callee.type === "Identifier") {
          if (
            callee.name === "setInterval" &&
            isGlobal("setInterval", sourceCode.getScope(node))
          )
            context.report({
              node,
              messageId: "timer",
              data: { name: "setInterval" },
            })
          return
        }
        if (callee.type !== "MemberExpression") return
        const name = propertyName(callee)
        if (name === null) return
        if (REPEATING_METHODS.has(name)) {
          context.report({
            node,
            messageId: "timer",
            data: { name: `.${name}(` },
          })
          return
        }
        if (
          name === "setInterval" &&
          callee.object.type === "Identifier" &&
          PAGE_LIFETIME_TARGETS.has(callee.object.name) &&
          isGlobal(callee.object.name, sourceCode.getScope(node))
        )
          context.report({
            node,
            messageId: "timer",
            data: { name: "setInterval" },
          })
      },
      MemberExpression(node): void {
        const name = propertyName(node)
        if (name === null) return
        if (POLLING_HANDLERS.has(name)) {
          context.report({ node, messageId: "event", data: { name } })
          return
        }
        if (
          name === "alarms" &&
          node.object.type === "Identifier" &&
          EXTENSION_NAMESPACES.has(node.object.name) &&
          isGlobal(node.object.name, sourceCode.getScope(node))
        )
          context.report({
            node,
            messageId: "alarms",
            data: { name: node.object.name },
          })
      },
      Literal(node): void {
        if (typeof node.value !== "string" || !POLLING_EVENTS.has(node.value))
          return
        if (isPropertyKey(node)) return
        context.report({ node, messageId: "event", data: { name: node.value } })
      },
      TemplateLiteral(node): void {
        const text = staticText(node)
        if (text === null || !POLLING_EVENTS.has(text)) return
        context.report({ node, messageId: "event", data: { name: text } })
      },
    }
  },
}

function propertyName(node: ESTree.MemberExpression): string | null {
  if (node.property.type === "PrivateIdentifier") return null
  if (!node.computed && node.property.type === "Identifier")
    return node.property.name
  if (
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  )
    return node.property.value
  return null
}

/** `{ progress: 0 }` names a field, not an event; `{ "progress": 0 }` too. */
function isPropertyKey(
  node: ESTree.Literal & Rule.NodeParentExtension
): boolean {
  const parent = node.parent
  return (
    (parent.type === "Property" || parent.type === "PropertyDefinition") &&
    parent.key === node &&
    !parent.computed
  )
}

function staticText(node: ESTree.TemplateLiteral): string | null {
  if (node.expressions.length > 0) return null
  return node.quasis[0]?.value.cooked ?? null
}
