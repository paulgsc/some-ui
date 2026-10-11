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
 * and these rules catch a component stepping out of the last arrow:
 * `no-theme-boundary` a component opening its own boundary (replacing the
 * tokens for its subtree), `no-structural-palette-color` a substrate role
 * painted with a literal gray, `no-fixed-status-color` a state (correct,
 * wrong, warning, an added or removed line) painted with a literal hue. All
 * three look like ordinary class names.
 *
 */

// ESTree shapes aren't modeled precisely by @types/eslint's Node union.
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
 * `packages/some-styles/src/theme/__tests__/registry.test.ts` reads this array back out
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
  "rose-night",
  "harvest-sky",
  "mochi",
  "scheduler",
  "code",
  "cdrama",
  "topik",
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

/** Matched against {@link bareUtility}; any opacity form (`/50`, `/[7%]`). */
const STRUCTURAL_COLOR_RE = new RegExp(
  `^(${Object.keys(STRUCTURAL_ROLES).join(
    "|"
  )})-(?:${NEUTRAL_FAMILIES.join("|")})-\\d{2,3}(?:\\/\\S+)?$`
)

/**
 * The whole class tokens a node carries statically: a string literal's
 * tokens, or a template literal's. A template is read around `${}`, since
 * `${base} text-red-500` paints red whatever `base` is, but a token that
 * touches an expression with no whitespace between them is only part of a
 * class (`dark${mode}` may be `darkroom`, `text-red-500${suffix}` may be
 * `text-red-500-ish`), so it is not judged.
 */
function classTokens(node: any): Array<string> | undefined {
  if (node.type === "Literal" && typeof node.value === "string") {
    const value: string = node.value
    return value.split(/\s+/)
  }
  if (node.type !== "TemplateLiteral") return undefined
  const quasis: Array<any> = node.quasis
  return quasis.flatMap((quasi, index): Array<string> => {
    const text: string = quasi.value.cooked ?? quasi.value.raw ?? ""
    const tokens = text.split(/\s+/)
    // An expression before this part glues onto its first token, one after
    // it onto its last; split() leaves an empty edge token where whitespace
    // separates them, so dropping the edge drops only a fragment.
    if (index > 0) tokens.shift()
    if (index < quasis.length - 1) tokens.pop()
    return tokens
  })
}

/**
 * A class token reduced to its utility: variants (`dark:`, `hover:`,
 * `[&>svg]:`, `data-[state=open]:`) and important markers (`!text-red-500`,
 * `text-red-500!`) stripped, so a palette color is matched however it is
 * qualified. A colon inside brackets belongs to an arbitrary variant, not to
 * the chain.
 */
function bareUtility(token: string): string {
  let depth = 0
  let start = 0
  for (let index = 0; index < token.length; index++) {
    const char = token[index]
    if (char === "[" || char === "(") depth++
    else if (char === "]" || char === ")") depth--
    else if (char === ":" && depth === 0) start = index + 1
  }
  return token.slice(start).replace(/^!/, "").replace(/!$/, "")
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

/**
 * The shape all three rules share: find the class text in a class-name
 * context, split it into tokens, and let `judge` decide which token to report
 * and how. Only the judgment differs between the rules.
 */
function classTokenRule(
  meta: Rule.RuleMetaData,
  judge: (
    token: string
  ) => { messageId: string; data: Record<string, string> } | undefined
): Rule.RuleModule {
  return {
    meta,
    create(context): Rule.RuleListener {
      const options = readOptions(context)

      function check(rawNode: any): void {
        const tokens = classTokens(rawNode)
        if (tokens === undefined) return
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
        for (const token of tokens) {
          const finding = judge(token)
          if (finding) context.report({ node: rawNode, ...finding })
        }
      }

      return {
        Literal: check,
        TemplateLiteral: check,
      }
    },
  }
}

export const noThemeBoundary: Rule.RuleModule = classTokenRule(
  {
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
  (token) =>
    BOUNDARY_OVERRIDE_CLASSES.includes(token)
      ? {
          messageId: token === "dark" ? "darkVariantRoot" : "boundary",
          data: { className: token },
        }
      : undefined
)

export const noStructuralPaletteColor: Rule.RuleModule = classTokenRule(
  {
    type: "problem",
    docs: {
      description:
        "Forbid painting a structural role (surface, text, border, ring, …) with a literal neutral from the Tailwind palette inside reusable UI. bg-slate-900 and text-gray-400 are fixed values: they cannot follow --background or --muted-foreground, so the component is 90% themed and wrong in the remaining 10%, which reads as a component bug rather than a theming gap. Chromatic colors are not flagged here — a chart series or a syntax token may legitimately be fixed, and status hues are no-fixed-status-color's — and neither are white/black, which are usually correct over media and scrims.",
    },
    schema: [SHARED_SCHEMA],
    messages: {
      structural:
        '"{{token}}" is a fixed palette color in a structural role, so it cannot follow the active theme. Use a semantic token ({{suggestion}}). If this color is genuinely content-semantic rather than substrate — a chart series, a syntax category, a brand identity — keep it and add an eslint-disable-next-line with the reason.',
    },
  },
  (token) => {
    const match = STRUCTURAL_COLOR_RE.exec(bareUtility(token))
    if (!match) return undefined
    return {
      messageId: "structural",
      data: {
        token,
        suggestion: STRUCTURAL_ROLES[match[1] ?? ""] ?? "a semantic token",
      },
    }
  }
)

/**
 * Hue families that read as a state: green for correct or done, red for wrong
 * or an error, amber for a warning. A component that paints a state with one
 * of these cannot follow the theme's own state colours, so under a pink or
 * coral theme its "correct" and "wrong" stop matching every other surface.
 * Blue, purple, cyan and the rest stay allowed: they carry charts, syntax and
 * brand identity, where a fixed hue is the point.
 */
const STATUS_FAMILIES: Record<string, string> = {
  green: "success",
  emerald: "success",
  lime: "success",
  red: "destructive",
  rose: "destructive",
  amber: "warning",
  yellow: "warning",
  orange: "warning",
}

/** Utilities that take a color, including the per-side border forms. */
const COLOR_UTILITIES = [
  "bg",
  "text",
  "border(?:-[xytrblse])?",
  "divide",
  "outline",
  "ring(?:-offset)?",
  "inset-ring",
  "placeholder",
  "caret",
  "decoration",
  "fill",
  "stroke",
  "shadow",
  "inset-shadow",
  "text-shadow",
  "drop-shadow",
  "accent",
  "from",
  "via",
  "to",
]

/** Matched against {@link bareUtility}; any opacity form (`/60`, `/[0.07]`). */
const STATUS_COLOR_RE = new RegExp(
  `^(?:${COLOR_UTILITIES.join("|")})-(${Object.keys(STATUS_FAMILIES).join(
    "|"
  )})-\\d{2,3}(?:\\/\\S+)?$`
)

export const noFixedStatusColor: Rule.RuleModule = classTokenRule(
  {
    type: "problem",
    docs: {
      description:
        "Forbid painting a state with a literal status hue (green, emerald, lime, red, rose, amber, yellow, orange) inside reusable UI. The theme defines --success, --destructive and --warning, and --diff-add / --diff-remove for a diff, so a component that hard-codes text-emerald-400 for correct keeps that green under every theme.",
    },
    schema: [SHARED_SCHEMA],
    messages: {
      status:
        '"{{token}}" paints a state with a fixed hue, so it cannot follow the active theme. Use the {{role}} token (text-{{role}}, bg-{{role}}/10, …), or diff-add / diff-remove for the lines of a diff. If the hue is content rather than state, such as a category or a chart series, keep it and add an eslint-disable-next-line with the reason.',
    },
  },
  (token) => {
    const match = STATUS_COLOR_RE.exec(bareUtility(token))
    const role = STATUS_FAMILIES[match?.[1] ?? ""]
    if (!role) return undefined
    return { messageId: "status", data: { token, role } }
  }
)
