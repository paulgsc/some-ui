import type { Rule } from "eslint"

// This rule inspects `createViteConfig`/`createReactLibConfig` call sites in a
// workspace's vite.config.ts. Those callees come from @some-ui/vite-config,
// whose createPlugins() already applies a canonical, centralized set of
// declaration-emit excludes:
//
//   - universal:        **/*.test.*, **/*.spec.*, **/*.stories.*,
//                       **/__tests__/**, **/__mocks__/**, **/stories/**
//   - content packages: **/demo/**, **/data/** (gated on `contentPackage: true`),
//                       ../../../assets/**, ../../some-content/src/**,
//                       ../../some-content-registry/src/**
//
// Re-listing any of those in a per-workspace `dtsOptions.exclude` is the exact
// whack-a-mole this rule prevents: the central list is the single place a new
// shared-content workspace (e.g. a future registry) should be added, so every
// consumer inherits it instead of each vite.config.ts having to remember. This
// rule leaves genuinely package-specific globs (e.g. "**/obs-monitor/**",
// "**/recap/**") untouched.
//
// ESTree nodes off `context.sourceCode` are typed loosely here (the eslint
// `Rule` types expose ESTree via `any`-ish unions), matching the convention in
// the sibling rules in this directory. no-unsafe-argument is disabled for the
// same reason: any-typed node ranges/tokens are handed to eslint's fixer/token
// APIs, which is the inherent ESTree-as-any tradeoff this directory accepts.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- ESTree node walking, see comment above */

const CENTRALIZED_CALLEES = new Set([
  "createViteConfig",
  "createReactLibConfig",
])

// Globs createPlugins applies unconditionally.
const UNIVERSAL_EXCLUDES = new Set([
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.stories.*",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/stories/**",
])

// Globs createPlugins applies only when `contentPackage: true`.
const CONTENT_PACKAGE_EXCLUDES = new Set(["**/demo/**", "**/data/**"])

// Cross-package shared-content / assets source paths that createPlugins covers
// for content packages. Matched structurally (not by exact string) so equivalent
// spellings of the same path still get flagged.
const CROSS_PACKAGE_CONTENT =
  /some-content(-registry)?[\\/]+src|(^|[\\/])assets[\\/]/

type Category = "universal" | "content-package" | "cross-package-content"

function categorize(
  value: string,
  contentPackage: boolean
): Category | undefined {
  if (UNIVERSAL_EXCLUDES.has(value)) return "universal"
  if (CROSS_PACKAGE_CONTENT.test(value)) return "cross-package-content"
  if (contentPackage && CONTENT_PACKAGE_EXCLUDES.has(value))
    return "content-package"
  return undefined
}

function findProperty(objectExpression: any, name: string): any {
  return objectExpression.properties.find(
    (prop: any) =>
      prop.type === "Property" &&
      !prop.computed &&
      ((prop.key.type === "Identifier" && prop.key.name === name) ||
        (prop.key.type === "Literal" && prop.key.value === name))
  )
}

export const noManualBuildExclude: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Forbid hand-maintaining centralized build excludes (tests, stories, data, assets, shared-content paths) in a workspace's vite.config.ts dtsOptions.exclude. These are applied centrally by @some-ui/vite-config; add new shared-content workspaces to createPlugins there, not per-workspace.",
    },
    schema: [],
    messages: {
      redundantExclude:
        'dtsOptions.exclude "{{value}}" is already applied centrally by @some-ui/vite-config ({{category}}). Remove it here — for new shared-content workspaces, add the path to createPlugins in @some-ui/vite-config so every consumer inherits it.',
      redundantExcludeAll:
        "Every dtsOptions.exclude glob here is already applied centrally by @some-ui/vite-config. Remove the exclude — for new shared-content workspaces, add the path to createPlugins in @some-ui/vite-config so every consumer inherits it.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode

    function removeArrayElement(
      fixer: Rule.RuleFixer,
      element: any,
      arr: any
    ): Rule.Fix {
      const index = arr.elements.indexOf(element)
      if (index < arr.elements.length - 1) {
        // Not last: swallow the comma that follows this element.
        const comma = sourceCode.getTokenAfter(element)
        const end = comma?.value === "," ? comma.range[1] : element.range[1]
        return fixer.removeRange([element.range[0], end])
      }
      // Last element: swallow the comma that precedes it, if any.
      const prev = sourceCode.getTokenBefore(element)
      const start = prev?.value === "," ? prev.range[0] : element.range[0]
      return fixer.removeRange([start, element.range[1]])
    }

    function removeProperty(
      fixer: Rule.RuleFixer,
      prop: any,
      objectExpression: any
    ): Rule.Fix {
      const index = objectExpression.properties.indexOf(prop)
      if (index < objectExpression.properties.length - 1) {
        const comma = sourceCode.getTokenAfter(prop)
        const end = comma?.value === "," ? comma.range[1] : prop.range[1]
        return fixer.removeRange([prop.range[0], end])
      }
      const prev = sourceCode.getTokenBefore(prop)
      const start = prev?.value === "," ? prev.range[0] : prop.range[0]
      return fixer.removeRange([start, prop.range[1]])
    }

    return {
      CallExpression(node: any): void {
        if (
          node.callee.type !== "Identifier" ||
          !CENTRALIZED_CALLEES.has(node.callee.name)
        )
          return

        const options = node.arguments[0]
        if (options?.type !== "ObjectExpression") return

        const contentPackageProp = findProperty(options, "contentPackage")
        const contentPackage =
          contentPackageProp?.value.type === "Literal" &&
          contentPackageProp.value.value === true

        const dtsProp = findProperty(options, "dtsOptions")
        if (dtsProp?.value.type !== "ObjectExpression") return

        const excludeProp = findProperty(dtsProp.value, "exclude")
        if (excludeProp?.value.type !== "ArrayExpression") return

        const elements: Array<any> = excludeProp.value.elements
        const flagged: Array<{ el: any; category: Category }> = []
        let hasKeeper = false

        for (const el of elements) {
          if (el?.type === "Literal" && typeof el.value === "string") {
            const category = categorize(el.value, contentPackage)
            if (category) {
              flagged.push({ el, category })
              continue
            }
          }
          // Non-string element (spread/identifier) or a package-specific glob.
          hasKeeper = true
        }

        if (flagged.length === 0) return

        // If nothing legitimate remains, drop the whole `exclude` property
        // (and dtsOptions if exclude was its only key) in one clean fix.
        if (!hasKeeper) {
          context.report({
            node: excludeProp,
            messageId: "redundantExcludeAll",
            fix(fixer) {
              const dtsObject = dtsProp.value
              if (dtsObject.properties.length === 1) {
                return removeProperty(fixer, dtsProp, options)
              }
              return removeProperty(fixer, excludeProp, dtsObject)
            },
          })
          return
        }

        for (const { el, category } of flagged) {
          context.report({
            node: el,
            messageId: "redundantExclude",
            data: { value: String(el.value), category },
            fix(fixer) {
              return removeArrayElement(fixer, el, excludeProp.value)
            },
          })
        }
      },
    }
  },
}
