import type { Rule, Scope } from "eslint"
import type * as ESTree from "estree"

import { isKeyOrType, keyName, propertyName, staticText } from "./ast-names.js"
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
 *   - the global `setInterval`, called or taken as a value, also through
 *     `window` / `globalThis` / `self` or destructured from one;
 *   - a call to a method named `interval` or `loop` on anything;
 *   - `alarms` on the global `browser` or `chrome`, read, destructured, or
 *     reached through `globalThis`;
 *   - the event names `timeupdate` and `progress` as a value (not a key, a
 *     type, or `createElement("progress")`), and the `ontimeupdate` /
 *     `onprogress` handler properties.
 *
 * A `setTimeout` re-armed from its own callback is a schedule too, but
 * telling it from a one-shot needs data flow, so it stays with review.
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
        "`alarms` wakes on a schedule: read playback on a message, a hotkey or a media event instead (some-drama README, LP1).",
      event:
        "`{{name}}` fires several times a second while a video plays, which turns the tab into a poller: listen for the events in PLAYBACK_EVENTS instead (some-drama README, LP1).",
    },
  },
  create(context) {
    const scopeOf = (node: ESTree.Node): Scope.Scope =>
      context.sourceCode.getScope(node)
    const isGlobalName = (node: ESTree.Node, names: Set<string>): boolean =>
      node.type === "Identifier" &&
      names.has(node.name) &&
      isGlobal(node.name, scopeOf(node))
    /** `browser`, or `globalThis.browser` (any page-lifetime target). */
    const isNamespace = (node: ESTree.Node): boolean =>
      isGlobalName(node, EXTENSION_NAMESPACES) ||
      (node.type === "MemberExpression" &&
        EXTENSION_NAMESPACES.has(propertyName(node) ?? "") &&
        isGlobalName(node.object, PAGE_LIFETIME_TARGETS))
    const event = (node: Rule.Node, text: string): void => {
      if (!POLLING_EVENTS.has(text) || isKeyOrType(node)) return
      const parent = node.parent
      if (
        parent?.type === "CallExpression" &&
        parent.callee.type === "MemberExpression" &&
        propertyName(parent.callee) === "createElement"
      )
        return
      context.report({ node, messageId: "event", data: { name: text } })
    }
    return {
      Identifier(node): void {
        if (node.name !== "setInterval") return
        const parent = node.parent
        // A property name or key is handled where its object is known.
        if (parent.type === "MemberExpression" && parent.property === node)
          return
        if (parent.type === "Property" && parent.key === node) return
        if (!isGlobal("setInterval", scopeOf(node))) return
        context.report({
          node,
          messageId: "timer",
          data: { name: "setInterval" },
        })
      },
      CallExpression(node): void {
        if (node.callee.type !== "MemberExpression") return
        const name = propertyName(node.callee)
        if (name !== null && REPEATING_METHODS.has(name))
          context.report({
            node,
            messageId: "timer",
            data: { name: `.${name}(` },
          })
      },
      MemberExpression(node): void {
        const name = propertyName(node)
        if (name === null) return
        if (POLLING_HANDLERS.has(name))
          context.report({ node, messageId: "event", data: { name } })
        else if (name === "alarms" && isNamespace(node.object))
          context.report({ node, messageId: "alarms" })
        else if (
          name === "setInterval" &&
          isGlobalName(node.object, PAGE_LIFETIME_TARGETS)
        )
          context.report({ node, messageId: "timer", data: { name } })
      },
      VariableDeclarator(node): void {
        if (node.id.type !== "ObjectPattern" || !node.init) return
        const fromPage = isGlobalName(node.init, PAGE_LIFETIME_TARGETS)
        const fromNamespace = isNamespace(node.init)
        for (const property of node.id.properties) {
          if (property.type !== "Property") continue
          const name = keyName(property.key, property.computed)
          if (name === "setInterval" && fromPage)
            context.report({
              node: property,
              messageId: "timer",
              data: { name },
            })
          else if (name === "alarms" && fromNamespace)
            context.report({ node: property, messageId: "alarms" })
        }
      },
      Literal(node): void {
        if (typeof node.value === "string") event(node, node.value)
      },
      TemplateLiteral(node): void {
        const text = staticText(node)
        if (text !== null) event(node, text)
      },
    }
  },
}
