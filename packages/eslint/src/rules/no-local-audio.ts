import type { Rule } from "eslint"
import type * as ESTree from "estree"

const GLOBALS = new Set(["window", "globalThis", "self"])

/**
 * VC4 (`@some-ui/voice-capture`, `lib/take-pattern.ts`): a recording plays
 * through the kit's player, which stops it when the page is hidden, as a
 * screen's `leave()` stops it when the screen goes. Outside the owner's
 * files (`owner`, a path fragment) this reports the ways ordinary code
 * plays audio of its own, each of which would play on behind a hidden page:
 *
 *   - `new Audio(…)`, the global or read off `window`, `globalThis` or
 *     `self`; a local binding named `Audio` is not the global;
 *   - `createElement("audio")` on anything;
 *   - an `<audio>` element in JSX.
 *
 * `AudioContext` is not reported: the recorder's level meter reads one, and
 * it plays nothing.
 */
export const noLocalAudio: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid playing audio outside @some-ui/voice-capture's player (VC4)",
    },
    schema: [
      {
        type: "object",
        properties: { owner: { type: "string" } },
        required: ["owner"],
        additionalProperties: false,
      },
    ],
    messages: {
      audio:
        "Play a recording through @some-ui/voice-capture's player (`audioPlayer`, or a take pattern), which stops it when the page is hidden (VC4); an Audio of your own plays on behind it.",
    },
  },
  create(context) {
    const options: unknown = context.options[0]
    const owner = String(Reflect.get(Object(options), "owner"))
    const filename = context.filename.replaceAll("\\", "/")
    if (filename.includes(owner)) return {}

    /** `Audio` resolving to no binding of the file's own. */
    function globalAudio(node: ESTree.Identifier): boolean {
      if (node.name !== "Audio") return false
      let scope: ReturnType<typeof context.sourceCode.getScope> | null =
        context.sourceCode.getScope(node)
      while (scope !== null) {
        const variable = scope.set.get("Audio")
        if (variable !== undefined && variable.defs.length > 0) return false
        scope = scope.upper
      }
      return true
    }

    return {
      NewExpression(node): void {
        const { callee } = node
        const audio =
          callee.type === "Identifier"
            ? globalAudio(callee)
            : callee.type === "MemberExpression" &&
              !callee.computed &&
              callee.object.type === "Identifier" &&
              GLOBALS.has(callee.object.name) &&
              callee.property.type === "Identifier" &&
              callee.property.name === "Audio"
        if (audio) context.report({ node, messageId: "audio" })
      },
      CallExpression(node): void {
        const { callee } = node
        const [first] = node.arguments
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "createElement" &&
          first?.type === "Literal" &&
          typeof first.value === "string" &&
          first.value.toLowerCase() === "audio"
        )
          context.report({ node, messageId: "audio" })
      },
      // JSX is outside ESTree's map.
      JSXOpeningElement(node: Rule.Node): void {
        const name: unknown = Reflect.get(node, "name")
        if (
          Reflect.get(Object(name), "type") === "JSXIdentifier" &&
          Reflect.get(Object(name), "name") === "audio"
        )
          context.report({ node, messageId: "audio" })
      },
    }
  },
}
