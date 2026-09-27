import type { Rule, Scope } from "eslint"
import type * as ESTree from "estree"

/**
 * Receivers whose listeners live as long as the page, whatever added them.
 * An element's listeners go when the element does; these never do.
 */
const PAGE_LIFETIME_TARGETS = new Set([
  "document",
  "window",
  "globalThis",
  "self",
])
const PAGE_LIFETIME_MEMBERS = new Set(["body", "documentElement"])

/**
 * Good-Citizen Charter §8 — every acquired resource is bound to the lifetime
 * of whatever acquired it.
 *
 * `require-named-lifetime` covers the two standing *timers*. It said, of
 * everything else, that listeners are "covered by whatever governs listeners
 * generally" — and nothing did. This rule is that governance, for the two
 * shapes that got past it in some-drama:
 *
 * ## A listener on the page, added by something shorter-lived
 *
 * `document.addEventListener("pointermove", …)` in a drag controller that is
 * rebuilt on every state change: each instance added two more listeners to
 * the document and none were ever removed. A listener on `document` or
 * `window` outlives its owner by default, so the only question that matters
 * is whether it is tied to one — and at the call site that is visible: the
 * options carry a `signal` (from an AbortController, or a lifetime object
 * such as commons' `Disposables`), or `once: true`.
 *
 * As with `require-named-lifetime`, a matching `removeEventListener` is not
 * accepted as the answer: pairing is checkable and was not the defect. What
 * matters is *which lifetime* removes it, and a signal names one.
 *
 * ## A frame loop
 *
 * `const track = () => { …; requestAnimationFrame(track) }` is a standing
 * resource exactly like `setInterval` — it runs until someone cancels it —
 * but it is spelled as a one-shot call, so the timer rule never saw it. A
 * one-shot `requestAnimationFrame(() => …)` is fine; a callback that
 * reschedules *itself* is the loop, and that is what is flagged.
 *
 * ## What it recognizes, and what it leaves to review
 *
 * The rule is syntactic, so it names the shapes it reads and no more:
 *
 * - listeners: `addEventListener` called on `document`, `window`,
 *   `globalThis`, `self`, `document.body` or `document.documentElement`, or
 *   bare (window's own); scoped by an options object (inline, or a `const`
 *   holding one) with `once: true` or a `signal` that is a signal on every
 *   path;
 * - frame loops: a `requestAnimationFrame` whose callback names the
 *   function it is called from (`f`, `this.f`, a `.bind(…)` of either) or is
 *   an inline wrapper that calls it.
 *
 * Other spellings of the same resource — an aliased receiver
 * (`const d = document`), a computed member (`window["addEventListener"]`),
 * options or callbacks passed through a variable the rule does not resolve —
 * are out of its reach by construction, not oversights to patch one at a
 * time. They are held by review invariant L8 in extensions/common's
 * GOOD_CITIZEN.md.
 *
 * Exemptions are per call site, with a comment naming what ends the resource.
 * Default severity is `warn` in the shared config: the rule lands as an audit
 * across every workspace, and a workspace makes it an `error` once it has
 * adopted a lifetime helper (see extensions/common `Disposables`).
 */
export const requireScopedLifetime: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require page-lifetime listeners (document/window) to carry a signal or once, and forbid self-rescheduling requestAnimationFrame loops outside a lifetime helper (Good-Citizen Charter §8)",
    },
    schema: [
      {
        type: "object",
        properties: {
          /** Where the workspace's lifetime helper lives, named in the message. */
          lifecycleModule: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unscopedListener:
        "This listener on {{target}} lives as long as the page, not as long as whatever added it. Pass a { signal } from its owner's lifetime ({{lifecycleModule}}, or an AbortController), or { once: true } — or exempt this call with a comment naming what removes it. A matching removeEventListener is not an answer: the drag listeners that piled up in some-drama had a teardown path; it was never tied to the card that added them.",
      unscopedFrameLoop:
        "This requestAnimationFrame callback reschedules itself: a frame loop that runs until someone cancels it, like setInterval. Run it from a lifetime that owns it ({{lifecycleModule}}), or exempt this call with a comment naming every transition that stops it.",
    },
  },
  create(context) {
    const lifecycleModule: string =
      context.options[0]?.lifecycleModule ?? "your workspace's lifetime helper"
    const sourceCode = context.sourceCode

    return {
      CallExpression(node): void {
        const callee = node.callee
        const method = calleeName(callee)
        if (method === "addEventListener") {
          const target =
            callee.type === "MemberExpression"
              ? pageLifetimeTarget(callee.object)
              : bareGlobalTarget(callee, sourceCode.getScope(node))
          if (target === null) return
          const options = node.arguments[2]
          if (options && optionsAreScoped(options, sourceCode.getScope(node))) {
            return
          }
          context.report({
            node,
            messageId: "unscopedListener",
            data: { target, lifecycleModule },
          })
          return
        }

        if (method === "requestAnimationFrame") {
          const callback = node.arguments[0]
          if (!callback) return
          const names = callbackNames(callback)
          if (names.length === 0) return
          // getAncestors is root-first, so each entry's parent is the one
          // before it.
          const ancestors = sourceCode.getAncestors(node)
          if (
            ancestors.some((a, i) =>
              names.some((name) => isFunctionNamed(a, ancestors[i - 1], name))
            )
          ) {
            context.report({
              node,
              messageId: "unscopedFrameLoop",
              data: { lifecycleModule },
            })
          }
        }
      },
    }
  },
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** `f(...)` → "f"; `a.b.f(...)` → "f". Computed members are not resolved. */
function calleeName(callee: ESTree.Node): string | null {
  if (callee.type === "Identifier") return callee.name
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name
  }
  return null
}

/** `document` / `window` / `document.body` … as written, or null. */
function pageLifetimeTarget(object: ESTree.Node): string | null {
  if (object.type === "Identifier" && PAGE_LIFETIME_TARGETS.has(object.name)) {
    return object.name
  }
  if (
    object.type === "MemberExpression" &&
    !object.computed &&
    object.object.type === "Identifier" &&
    object.object.name === "document" &&
    object.property.type === "Identifier" &&
    PAGE_LIFETIME_MEMBERS.has(object.property.name)
  ) {
    return `document.${object.property.name}`
  }
  return null
}

/**
 * A bare `addEventListener(…)` is the global object's own method — window's —
 * unless the name is bound in the file (a local function of that name).
 */
function bareGlobalTarget(
  callee: ESTree.Node,
  scope: Scope.Scope
): string | null {
  if (callee.type !== "Identifier") return null
  for (let s: Scope.Scope | null = scope; s !== null; s = s.upper) {
    const variable = s.set.get(callee.name)
    // Declared in the file (defs), or an import: not the global.
    if (variable && variable.defs.length > 0) return null
  }
  return "window"
}

/**
 * The options argument ties the listener to a lifetime: it has a `signal`
 * property, or `once: true`. A `const` holding an object literal is resolved;
 * anything else (a boolean capture flag, a parameter) is not scoped.
 */
function optionsAreScoped(options: ESTree.Node, scope: Scope.Scope): boolean {
  const object = resolveObject(options, scope)
  if (object === null) return false
  return object.properties.some((p) => {
    if (p.type !== "Property" || p.computed) return false
    const key =
      p.key.type === "Identifier"
        ? p.key.name
        : p.key.type === "Literal"
          ? String(p.key.value)
          : null
    if (key === "signal") return signalIsDefinite(p.value)
    return (
      key === "once" && p.value.type === "Literal" && p.value.value === true
    )
  })
}

/**
 * A `signal` value that is a signal on every path. `controller?.signal`,
 * `undefined`, `null`, and `a ? b : c` or `a ?? b` / `a || b` (either side
 * may be the missing one) can each hand addEventListener nothing, and then
 * the listener is the page's. An identifier or a plain member is trusted:
 * its type, not its spelling, would say more, and a type-aware rule is not
 * what this is.
 */
function signalIsDefinite(value: ESTree.Node): boolean {
  if (
    value.type === "ChainExpression" ||
    value.type === "ConditionalExpression" ||
    value.type === "LogicalExpression"
  ) {
    return false
  }
  if (value.type === "Identifier") return value.name !== "undefined"
  if (value.type === "Literal") return value.value !== null
  return true
}

function resolveObject(
  node: ESTree.Node,
  scope: Scope.Scope
): ESTree.ObjectExpression | null {
  if (node.type === "ObjectExpression") return node
  if (node.type !== "Identifier") return null
  for (let s: Scope.Scope | null = scope; s !== null; s = s.upper) {
    const variable = s.set.get(node.name)
    if (!variable) continue
    const def = variable.defs[0]
    if (
      def?.type === "Variable" &&
      def.node.init?.type === "ObjectExpression" &&
      def.parent.kind === "const"
    ) {
      return def.node.init
    }
    return null
  }
  return null
}

/**
 * The names a frame callback may reschedule through: the function it names
 * (`f`, `this.f`), or — for an inline wrapper, `() => tick()` — every function
 * its body calls by name. Calls inside functions the wrapper only defines are
 * not calls it makes, so those are not followed.
 */
function callbackNames(callback: ESTree.Node): Array<string> {
  const named = callbackName(callback)
  if (named !== null) return [named]
  if (
    callback.type !== "ArrowFunctionExpression" &&
    callback.type !== "FunctionExpression"
  ) {
    return []
  }
  const names: Array<string> = []
  const visit = (node: ESTree.Node): void => {
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      return
    }
    if (node.type === "CallExpression") {
      const name = callbackName(node.callee)
      if (name !== null) names.push(name)
    }
    for (const child of childNodes(node)) visit(child)
  }
  visit(callback.body)
  return names
}

/** The AST nodes directly under `node` (ESLint's `parent` link excluded). */
function childNodes(node: ESTree.Node): Array<ESTree.Node> {
  const out: Array<ESTree.Node> = []
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue
    for (const item of Array.isArray(value) ? value : [value]) {
      if (isNode(item)) out.push(item)
    }
  }
  return out
}

function isNode(v: unknown): v is ESTree.Node {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    typeof v.type === "string"
  )
}

/**
 * The name a callback refers to: `f` → "f", `this.f` → "f", and a bound
 * copy of either, `f.bind(…)` / `this.f.bind(…)`, → "f".
 */
function callbackName(callback: ESTree.Node): string | null {
  if (
    callback.type === "CallExpression" &&
    callback.callee.type === "MemberExpression" &&
    !callback.callee.computed &&
    callback.callee.property.type === "Identifier" &&
    callback.callee.property.name === "bind" &&
    callback.callee.object.type !== "Super"
  ) {
    return callbackName(callback.callee.object)
  }
  if (callback.type === "Identifier") return callback.name
  if (
    callback.type === "MemberExpression" &&
    callback.object.type === "ThisExpression" &&
    !callback.computed &&
    callback.property.type === "Identifier"
  ) {
    return callback.property.name
  }
  return null
}

/**
 * Whether `node` is a function bound to `name` — by its own id, or by what
 * `parent` binds it to (const, assignment, method, class field, property).
 */
function isFunctionNamed(
  node: ESTree.Node,
  parent: ESTree.Node | undefined,
  name: string
): boolean {
  if (
    node.type !== "FunctionDeclaration" &&
    node.type !== "FunctionExpression" &&
    node.type !== "ArrowFunctionExpression"
  ) {
    return false
  }
  if (node.type !== "ArrowFunctionExpression" && node.id?.name === name) {
    return true
  }
  if (!parent) return false
  if (parent.type === "VariableDeclarator") {
    return parent.id.type === "Identifier" && parent.id.name === name
  }
  if (parent.type === "AssignmentExpression") {
    const left = parent.left
    if (left.type === "Identifier") return left.name === name
    return (
      left.type === "MemberExpression" &&
      !left.computed &&
      left.property.type === "Identifier" &&
      left.property.name === name
    )
  }
  if (
    parent.type === "MethodDefinition" ||
    parent.type === "PropertyDefinition" ||
    parent.type === "Property"
  ) {
    return (
      !parent.computed &&
      parent.key.type === "Identifier" &&
      parent.key.name === name
    )
  }
  return false
}
