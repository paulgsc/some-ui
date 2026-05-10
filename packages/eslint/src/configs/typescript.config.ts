//@ts-check
import eslint from "@eslint/js"
import tsPlugin from "@typescript-eslint/eslint-plugin"
import typescriptParser from "@typescript-eslint/parser"
import tseslint from "typescript-eslint"
import type { ConfigWithExtends } from "typescript-eslint"

// NOTE: eslint-plugin-deprecation has been removed. Its functionality is
// superseded by @typescript-eslint/no-deprecated (type-aware, more accurate).

const config: Array<ConfigWithExtends> = [
  {
    files: ["**/*.{ts,tsx,cts,mts}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        // projectService replaces `project: true` — uses TS language service
        // for faster, more accurate type-aware linting in monorepos (stable TS-ESLint v8+)
        projectService: true,
        allowAutomaticSingleRunInference: true,
        ecmaFeatures: {
          jsx: true,
        },
        cacheLifetime: {
          glob: "Infinity",
        },
        warnOnUnsupportedTypeScriptVersion: false,
      },
      globals: {
        React: "readonly",
      },
    },
    extends: [eslint.configs.recommended],
    rules: {
      "no-mixed-operators": "off",

      // ── Unused vars ──────────────────────────────────────────────────────
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          caughtErrors: "all",
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-unused-expressions": "error",

      // ── Imports / types ──────────────────────────────────────────────────
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", disallowTypeAnnotations: true },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],

      // ── Function signatures ──────────────────────────────────────────────
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowIIFEs: true },
      ],

      // ── any / unknown safety ─────────────────────────────────────────────
      "@typescript-eslint/no-explicit-any": "error",
      // These three are off because they produce too much noise on codebases
      // that haven't fully annotated external boundaries. Re-enable per-project.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      // These two are worth keeping on — they're more targeted
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      // ── Conditions / control flow ────────────────────────────────────────
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        { allowConstantLoopConditions: true },
      ],

      // ── Async / promises (type-aware, replaces manual footguns) ──────────
      "@typescript-eslint/no-floating-promises": [
        "error",
        { ignoreVoid: true },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",

      // ── Deprecation (replaces eslint-plugin-deprecation) ─────────────────
      "@typescript-eslint/no-deprecated": "error",

      // ── Enum / literal safety ────────────────────────────────────────────
      "@typescript-eslint/prefer-literal-enum-member": [
        "error",
        { allowBitwiseExpressions: true },
      ],
      "@typescript-eslint/no-mixed-enums": "error",

      // ── String / template safety ─────────────────────────────────────────
      "@typescript-eslint/prefer-string-starts-ends-with": [
        "error",
        { allowSingleElementEquality: "always" },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: false,
          allowAny: false,
          allowNullish: false,
          allowRegExp: true,
        },
      ],

      // ── Nullish / optional chaining ──────────────────────────────────────
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        {
          ignoreConditionalTests: true,
          ignorePrimitives: true,
        },
      ],
      "@typescript-eslint/prefer-optional-chain": "error",

      // ── Indexed access safety ────────────────────────────────────────────
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[computed=true]",
          message:
            "Unsafe indexed access. Prefer iteration, .at(), or a safe helper.",
        },
      ],

      // ── Type parameters / generics ───────────────────────────────────────
      "@typescript-eslint/array-type": ["error", { default: "generic" }],
      "@typescript-eslint/no-unnecessary-type-arguments": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unnecessary-type-constraint": "error",
      "@typescript-eslint/no-unnecessary-type-parameters": "error",

      // ── Return type safety ───────────────────────────────────────────────
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],

      // ── Class / constructor ──────────────────────────────────────────────
      "@typescript-eslint/no-useless-constructor": "error",
    },
  },

  // ── JS files: disable type-checked rules ──────────────────────────────────
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/require-await": "off",
    },
  },

  // ── Rollup configs: relax type-aware rules ────────────────────────────────
  {
    files: ["**/*rollup*.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-deprecated": "off",
    },
  },
]

export default config
