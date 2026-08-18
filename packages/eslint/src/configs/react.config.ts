// NOTE: FlatCompat has been removed from this file.
// - eslint-plugin-react-hooks now exports configs.flat.recommended directly
// - eslint-plugin-import has been replaced with eslint-plugin-import-x
//   (maintained drop-in replacement with native flat config support)
// - react/jsx-uses-vars has been removed: ESLint v10 tracks JSX references
//   natively via scope analysis, making this rule redundant/conflicting.
// - fixupConfigRules wraps eslint-plugin-react and eslint-plugin-jsx-a11y
//   recommended configs: both plugins still call context.getFilename() and
//   other ESLint v8/v9 context methods removed in ESLint v10.
import path from "node:path"
import { fixupConfigRules } from "@eslint/compat"
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript"
import importPlugin from "eslint-plugin-import-x"
import jsxA11yPlugin from "eslint-plugin-jsx-a11y"
import reactPlugin from "eslint-plugin-react"
import reactHooksPlugin from "eslint-plugin-react-hooks"
import { defineConfig } from "eslint/config"

const files = ["**/*.{mdx,js,jsx,ts,tsx}"]

/**
 * Exported so a workspace that must turn off the parent-relative dynamic
 * import guard below (a raw-source package with no self-alias - see
 * base.config.ts's `no-restricted-imports` for the full rationale) can
 * redeclare `no-restricted-syntax` with just these two selectors, instead
 * of silently dropping the React-import ban too. Flat config replaces a
 * rule's value wholesale at the most specific matching config; there is no
 * way to remove one selector from this array without restating the rest.
 */
/**
 * Same reasoning as `reactImportBanSelectors` above, but this one has a
 * second reason to be exported: `extensions-security.config.ts` also
 * defines `no-restricted-syntax`, spread *after* this file inside
 * `extensionsRecommended`, so it wins the same way this file wins over
 * typescript.config.ts. Every extensions/* workspace needs this selector
 * spread into that file's array too, or it goes dark there exactly like it
 * would have in typescript.config.ts.
 */
export const parentRelativeDynamicImportSelector = {
  selector: "ImportExpression[source.value=/^\\.\\./]",
  message:
    "Parent-relative dynamic imports ('../') are not allowed - use this workspace's path alias instead.",
}

export const reactImportBanSelectors = [
  {
    selector:
      "ImportDeclaration[source.value='react'][specifiers.0.type='ImportDefaultSpecifier']",
    message:
      "Default React import not allowed since we use the TypeScript jsx-transform. If you need a global type that collides with a React named export (such as `MouseEvent`), try using `globalThis.MouseHandler`",
  },
  {
    selector:
      "ImportDeclaration[source.value='react'] :matches(ImportNamespaceSpecifier)",
    message:
      "Named * React import is not allowed. Please import what you need from React with Named Imports",
  },
]

// Cross-package specifiers (@some-ui/shared, some-ui-utils, ...) resolve
// via package.json main/exports pointing at dist/, which doesn't exist
// without a build. tsconfig.workspace-resolve.json maps them straight to
// source so every consuming package's ESLint run resolves them without
// requiring a build — see #394. Resolved to an absolute path (via
// import.meta.dirname, which follows the pnpm workspace symlink to this
// package's real location) so it works regardless of which package's
// eslint.config.js pulls this in or what its cwd is.
const workspaceResolveTsconfig = path.resolve(
  import.meta.dirname,
  "../../../tsconfig.workspace-resolve.json"
)

export default defineConfig([
  ...fixupConfigRules([
    { files, ...jsxA11yPlugin.flatConfigs.recommended },
    { files, ...reactPlugin.configs.flat.recommended },
    { files, ...reactHooksPlugin.configs.flat.recommended },
  ]),
  {
    files,
    plugins: {
      import: importPlugin,
    },
    settings: {
      react: {
        version: "detect",
      },
      // Two independent resolver instances, tried in order, rather than one
      // instance with a multi-entry `project` array: eslint-import-resolver-
      // typescript caches a resolved tsconfig's ResolverFactory keyed only by
      // tsconfig path, not by (tsconfig path, specifier). With a single
      // instance and multiple projects, the first specifier that resolves
      // via a package's own tsconfig.json poisons that cache entry, and
      // every later specifier short-circuits onto it — skipping the
      // workspace-resolve fallback entirely for the rest of the lint run.
      // Separate instances each get their own cache.
      "import-x/resolver-next": [
        createTypeScriptImportResolver({ alwaysTryTypes: true }),
        createTypeScriptImportResolver({
          project: workspaceResolveTsconfig,
          alwaysTryTypes: true,
        }),
      ],
    },
    rules: {
      // ── Import rules ────────────────────────────────────────────────────
      "import/no-unresolved": "error",
      "import/no-cycle": "error",
      "import/named": "error",
      "import/export": "error",
      "import/no-anonymous-default-export": "error",
      // Enforce consistent import ordering is handled by prettier plugin —
      // but flag duplicate imports at the ESLint level
      "import/no-duplicates": "error",
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: [
            "**/vite.config.*",
            "**/vitest.config.*",
            "**/playwright.config.*",

            "**/*.stories.*",
            "**/*.spec.*",
            "**/*.test.*",

            "**/*.setup.*",

            "**/__tests__/**",
            "**/tests/**",
          ],
        },
      ],
      // ── React component rules ────────────────────────────────────────────
      "react/function-component-definition": [
        "error",
        {
          namedComponents: "arrow-function",
          unnamedComponents: "arrow-function",
        },
      ],
      // react/jsx-uses-vars intentionally OMITTED: ESLint v10 tracks JSX
      // references natively via scope analysis — this rule is now redundant
      // and can produce conflicts with the native tracking.
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Catch common React footguns
      "react/no-array-index-key": "warn",
      "react/no-unstable-nested-components": ["error", { allowAsProps: false }],
      "react/self-closing-comp": "error",
      "react/jsx-no-useless-fragment": ["error", { allowExpressions: true }],
      "react/jsx-no-target-blank": "off",

      // ── React Hooks rules ────────────────────────────────────────────────
      // exhaustive-deps at error level — warnings get ignored in large codebases
      "react-hooks/exhaustive-deps": "error",

      // ── Accessibility rules ──────────────────────────────────────────────
      "jsx-a11y/alt-text": [
        "error",
        {
          elements: ["img"],
          img: ["Image"],
        },
      ],
      "jsx-a11y/heading-has-content": "off",
      "jsx-a11y/anchor-has-content": "off",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",

      // ── Restricted syntax ────────────────────────────────────────────────
      // Deliberately here, not in typescript.config.ts: flat config replaces
      // (never merges) a rule's value at the most specific matching config,
      // and this file's `files` glob (mdx/js/jsx/ts/tsx) is a superset of
      // typescript.config.ts's, spread after it in every preset - so a
      // `no-restricted-syntax` entry declared there would be silently
      // shadowed by this one for every file both configs match.
      "no-restricted-syntax": [
        "error",
        ...reactImportBanSelectors,
        parentRelativeDynamicImportSelector,
      ],
    },
  },
])
