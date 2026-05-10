//@ts-check
// NOTE: FlatCompat has been removed from this file.
// - eslint-plugin-react-hooks now exports configs.flat.recommended directly
// - eslint-plugin-import has been replaced with eslint-plugin-import-x
//   (maintained drop-in replacement with native flat config support)
// - react/jsx-uses-vars has been removed: ESLint v10 tracks JSX references
//   natively via scope analysis, making this rule redundant/conflicting.
import importPlugin from "eslint-plugin-import-x"
import jsxA11yPlugin from "eslint-plugin-jsx-a11y"
import reactPlugin from "eslint-plugin-react"
import reactHooksPlugin from "eslint-plugin-react-hooks"
import type { ConfigWithExtends } from "typescript-eslint"

const config: Array<ConfigWithExtends> = [
  {
    files: ["**/*.{mdx,jsx,tsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      import: importPlugin,
    },
    extends: [
      jsxA11yPlugin.flatConfigs.recommended,
      reactPlugin.configs.flat?.recommended,
      // Native flat config — no FlatCompat or fixupPluginRules needed
      reactHooksPlugin.configs?.["flat/recommended"] ||
        reactHooksPlugin.configs?.recommended,
    ].filter(Boolean),
    settings: {
      react: {
        version: "detect",
      },
      "import-x/resolver": {
        typescript: true,
        node: true,
      },
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
      // Catch imports of devDependencies in source (not test) files
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: [
            "**/*.test.{ts,tsx}",
            "**/*.spec.{ts,tsx}",
            "**/*.stories.{ts,tsx}",
            "**/tests/**",
            "**/vite.config.*",
            "**/vitest.config.*",
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
      "no-restricted-syntax": [
        "error",
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
      ],
    },
  },
]

export default config
