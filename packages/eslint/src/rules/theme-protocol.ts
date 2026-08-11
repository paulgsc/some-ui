import type { Rule } from "eslint"

/**
 * The two rules in this file enforce the theme protocol described in
 * `packages/some-styles/src/theme/registry.ts`, from the one side that could
 * not be checked before: what a *reusable component* is allowed to author.
 *
 * The protocol is
 *
 *     session preference → host adapter → DOM boundary (class + data-theme)
 *       → semantic custom properties → components inherit
 *
 * and both failures this file catches are ways a component steps out of that
 * last arrow. `no-theme-boundary` catches a component opening its own
 * boundary, which replaces the tokens for its whole subtree. `no-structural-
 * palette-color` catches a component painting a substrate role with a literal
 * gray, which ignores the tokens entirely. Neither is visible in review — both
 * look like ordinary class names — and neither breaks a build, which is why
 * they accumulated across the ui workspaces unnoticed.
 */

// rawNode/parts: any — ESTree shapes not modeled precisely by @types/eslint's
// Node union; same "rawNode: any" convention documented in the other rules
// in this directory (no-unsafe-* is off repo-wide for this reason).
/* eslint-disable @typescript-eslint/no-explicit-any -- see comment above */

const DEFAULT_ATTRIBUTE_NAMES = ["className", "class"]
const DEFAULT_CALLEE_NAMES = [
  "cn",
  "clsx",
  "classNames",
  "classnames",
  "cva",
  "twMerge",
  "twJoin",
]

/**
 * Classes that replace the semantic contract (`--background`, `--foreground`,
 * …) for their subtree — every `session` and `feature` scoped theme in
 * `@some-ui/styles`.
 *
 * Duplicated here rather than imported: this package compiles to CJS and ESM
 * and typechecks under node16 resolution, so it cannot resolve the design
 * system's source — and a lint kit reaching into the design system to lint it
 * is the wrong direction anyway. The copy is not left to rot:
 * `packages/some-styles/src/theme/registry.test.ts` reads this array back out
 * of this file and asserts it equals the registry's own
 * `BOUNDARY_OVERRIDE_CLASSES`, so registering a theme and forgetting this list
 * fails there rather than leaving the rule quiet on the new class.
 *
 * Deliberately *not* included: `component`-scoped skins such as `headline`,
 * which declare only their own namespaced tokens and cannot shadow the user's
 * theme. A component applying one of those to itself is correct.
 */
const BOUNDARY_OVERRIDE_CLASSES = [
  "dark",
  "strawberry-moon",
  "peachy-blossom",
  "scheduler",
  "code",
  "cdrama",
  "topik",
  "conveyor",
]

/**
 * Palette families that stand in for the substrate roles. A themeable surface
 * painted with one of these cannot respond to a token change, which is the
 * entire failure being prevented.
 *
 * `white` / `black` are deliberately absent. Over a photo, a video, a scrim or
 * a colored fill they are content-semantic rather than theme-dependent —
 * `fill-white` on a play icon sitting on a thumbnail is correct at every theme
 * — and banning them would bury the real findings under exceptions.
 */
const NEUTRAL_FAMILIES = [
  "slate",
  "gray",
  "grey",
  "zinc",
  "neutral",
  "stone",
  "ink",
]

/** Utility prefixes that paint a structural role. */
const STRUCTURAL_ROLES: Record<string, string> = {
  bg: "bg-background / bg-card / bg-muted / bg-secondary / bg-popover",
  text: "text-foreground / text-muted-foreground / text-card-foreground",
  border: "border-border / border-input",
  divide: "divide-border",
  outline: "outline-ring",
  ring: "ring-ring",
  placeholder: "placeholder:text-muted-foreground",
  caret: "caret-foreground",
  decoration: "decoration-muted-foreground",
  fill: "fill-foreground / fill-muted-foreground",
  stroke: "stroke-border / stroke-foreground",
  shadow: "a shadow built from a semantic color",
  accent: "accent-primary",
  from: "the semantic token for the surface this gradient sits on",
  via: "the semantic token for the surface this gradient sits on",
  to: "the semantic token for the surface this gradient sits on",
}

const STRUCTURAL_COLOR_RE = new RegExp(
  `^(?:[a-z0-9-]+:)*(${Object.keys(STRUCTURAL_ROLES).join(
    "|"
  )})-(?:${NEUTRAL_FAMILIES.join("|")})-\\d{2,3}(?:\\/\\d+)?$`
)

function staticText(node: any): string | undefined {
  if (node.type === "Literal" && typeof node.value === "string") {
    const value: string = node.value
    return value
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    const cooked: string =
      node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? ""
    return cooked
  }
  return undefined
}

/** True when `objectNode` is passed directly to cn(...)/clsx(...)/…. */
function isClassMergeArgument(
  objectNode: any,
  calleeNames: Array<string>
): boolean {
  const call = objectNode?.parent
  const isArgument: boolean = Boolean(
    objectNode?.type === "ObjectExpression" &&
      call?.type === "CallExpression" &&
      call.callee?.type === "Identifier" &&
      calleeNames.includes(String(call.callee.name)) &&
      Array.isArray(call.arguments) &&
      call.arguments.includes(objectNode)
  )
  return isArgument
}

/**
 * True when this string literal is somewhere a class name is being built.
 *
 * Three shapes count, and the third is what stops the rule being trivially
 * sidestepped: the class list hoisted to a `const THEME_CLASS = { … }` lookup
 * table, which the attribute/callee walk alone would never see.
 */
function isClassNameContext(
  rawNode: any,
  attributeNames: Array<string>,
  calleeNames: Array<string>,
  identifierPattern: RegExp
): boolean {
  // Object keys cut both ways, and which way depends on what holds the object.
  //
  //   cn({ "text-gray-500": !neon })          → the key IS the class
  //   const THEME_CLASS = { "strawberry-moon": "headline--…" }
  //                                           → the key is a lookup id
  //
  // clsx's conditional-object form makes keys markup; a table keyed by theme
  // id makes them names of the thing being selected. Reading every key as
  // markup flags the second for naming the theme it maps, and reading none as
  // markup goes blind to the first — which is the form that actually appears
  // in components. So the object's own position decides.
  if (
    rawNode.parent?.type === "Property" &&
    rawNode.parent.key === rawNode &&
    !rawNode.parent.computed &&
    !isClassMergeArgument(rawNode.parent.parent, calleeNames)
  ) {
    return false
  }

  let current = rawNode.parent
  while (current) {
    if (
      current.type === "JSXAttribute" &&
      current.name?.type === "JSXIdentifier" &&
      attributeNames.includes(String(current.name.name))
    ) {
      return true
    }
    if (
      current.type === "CallExpression" &&
      current.callee?.type === "Identifier" &&
      calleeNames.includes(String(current.callee.name))
    ) {
      return true
    }
    if (
      current.type === "VariableDeclarator" &&
      current.id?.type === "Identifier" &&
      identifierPattern.test(String(current.id.name))
    ) {
      return true
    }
    if (current.type === "Property" && !current.computed) {
      const key = current.key
      const name =
        key?.type === "Identifier"
          ? String(key.name)
          : key?.type === "Literal"
            ? String(key.value)
            : ""
      if (identifierPattern.test(name)) return true
    }
    current = current.parent
  }
  return false
}

type Options = {
  attributeNames: Array<string>
  calleeNames: Array<string>
  identifierPattern: RegExp
}

function readOptions(context: Rule.RuleContext): Options {
  // context.options is any[] per @types/eslint; no-unsafe-assignment is
  // intentionally off repo-wide for exactly this — same shape as
  // no-interpolated-classname.
  const raw = context.options[0] ?? {}
  const attributeNames: Array<string> =
    raw.attributeNames ?? DEFAULT_ATTRIBUTE_NAMES
  const calleeNames: Array<string> = raw.calleeNames ?? DEFAULT_CALLEE_NAMES
  const identifierPattern: string =
    raw.identifierPattern ?? "class(?:name)?e?s?$"
  return {
    attributeNames,
    calleeNames,
    identifierPattern: new RegExp(identifierPattern, "i"),
  }
}

const SHARED_SCHEMA = {
  type: "object" as const,
  properties: {
    attributeNames: { type: "array", items: { type: "string" } },
    calleeNames: { type: "array", items: { type: "string" } },
    identifierPattern: { type: "string" },
  },
  additionalProperties: false,
}

export const noThemeBoundary: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Forbid a reusable component authoring a session or feature theme class (dark, code, topik, cdrama, scheduler, …) on its own markup. Those classes replace --background/--foreground and friends for the whole subtree, so a component that mounts one has silently opted its users out of the theme they selected — the host\'s session theme still changes, and this subtree does not follow. Take an `appearance` prop typed `Appearance` from @some-ui/styles/theme, default it to "inherit", and render `appearanceClassName(appearance)` so a host that genuinely wants the branded surface can ask for it.',
    },
    schema: [SHARED_SCHEMA],
    messages: {
      boundary:
        'Reusable UI must not apply the "{{className}}" theme class to its own markup: it replaces the semantic tokens for this subtree, so the user\'s session theme stops reaching it. Accept `appearance?: Appearance` (default "inherit") from @some-ui/styles/theme and render `appearanceClassName(appearance)` instead, letting the host opt in.',
      darkVariantRoot:
        'Reusable UI must not apply "dark" to its own markup. Beyond replacing the palette it pins every `dark:*` utility in this subtree on, so the component stays dark even under a light session theme. Use semantic tokens (bg-background, text-foreground) and let the host\'s boundary decide.',
    },
  },
  create(context): Rule.RuleListener {
    const options = readOptions(context)

    function check(rawNode: any): void {
      const text = staticText(rawNode)
      if (text === undefined) return
      if (
        !isClassNameContext(
          rawNode,
          options.attributeNames,
          options.calleeNames,
          options.identifierPattern
        )
      ) {
        return
      }
      for (const token of text.split(/\s+/)) {
        if (!BOUNDARY_OVERRIDE_CLASSES.includes(token)) continue
        context.report({
          node: rawNode,
          messageId: token === "dark" ? "darkVariantRoot" : "boundary",
          data: { className: token },
        })
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    }
  },
}

export const noStructuralPaletteColor: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid painting a structural role (surface, text, border, ring, …) with a literal neutral from the Tailwind palette inside reusable UI. bg-slate-900 and text-gray-400 are fixed values: they cannot follow --background or --muted-foreground, so the component is 90% themed and wrong in the remaining 10%, which reads as a component bug rather than a theming gap. Chromatic colors are not flagged — a chart series, a syntax token or a status hue may legitimately be fixed — and neither are white/black, which are usually correct over media and scrims.",
    },
    schema: [SHARED_SCHEMA],
    messages: {
      structural:
        '"{{token}}" is a fixed palette color in a structural role, so it cannot follow the active theme. Use a semantic token ({{suggestion}}). If this color is genuinely content-semantic rather than substrate — a chart series, a syntax category, a brand identity — keep it and add an eslint-disable-next-line with the reason.',
    },
  },
  create(context): Rule.RuleListener {
    const options = readOptions(context)

    function check(rawNode: any): void {
      const text = staticText(rawNode)
      if (text === undefined) return
      if (
        !isClassNameContext(
          rawNode,
          options.attributeNames,
          options.calleeNames,
          options.identifierPattern
        )
      ) {
        return
      }
      for (const token of text.split(/\s+/)) {
        const match = STRUCTURAL_COLOR_RE.exec(token)
        if (!match) continue
        context.report({
          node: rawNode,
          messageId: "structural",
          data: {
            token,
            suggestion: STRUCTURAL_ROLES[match[1] ?? ""] ?? "a semantic token",
          },
        })
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    }
  },
}

/** Exported for the drift test that pins this list to the canonical registry. */
export const THEME_BOUNDARY_OVERRIDE_CLASSES: ReadonlyArray<string> =
  BOUNDARY_OVERRIDE_CLASSES
