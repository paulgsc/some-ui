import eslint from "@eslint/js"
import typescriptParser from "@typescript-eslint/parser"
import { defineConfig } from "eslint/config"
import tseslint from "typescript-eslint"

const unusedVarsOptions = {
  vars: "all",
  caughtErrors: "all",
  varsIgnorePattern: "^_",
  argsIgnorePattern: "^_",
} as const

// The core rules `eslintRecommended` switches off on TS files because the
// compiler reports them, at their `@eslint/js` recommended settings. Not the
// three that cannot see TypeScript declarations: they report overloads and
// type-only globals (NodeJS.ProcessEnv, JSX.Element).
const typeBlindRules = new Set([
  "no-redeclare",
  "no-dupe-class-members",
  "no-undef",
])
const compilerOwnedCoreRules = Object.fromEntries(
  Object.entries(eslint.configs.recommended.rules).filter(
    ([rule]) =>
      Object.hasOwn(tseslint.configs.eslintRecommended.rules ?? {}, rule) &&
      !typeBlindRules.has(rule)
  )
)

export default defineConfig(
  // Every file, JS included. On TS files `eslintRecommended` (below) turns
  // off the core rules the compiler already enforces, `no-undef` among them;
  // `no-unreachable` only while the tsconfig keeps allowUnreachableCode false.
  eslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-unused-vars": ["error", unusedVarsOptions],
    },
  },
  {
    files: ["**/*.{ts,tsx,cts,mts}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        projectService: true,
      },
    },
    extends: [tseslint.configs.eslintRecommended],
    rules: {
      // ── Unused vars ──────────────────────────────────────────────────────
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", unusedVarsOptions],
      "@typescript-eslint/no-unused-expressions": "error",

      // ── Redeclaration ────────────────────────────────────────────────────
      // Core `no-redeclare` cannot see TypeScript, so it reports every
      // overload signature as a redeclaration of the implementation - which
      // is not a mistake, it is the only way to write an overloaded function.
      // The typescript-eslint version understands overloads and declaration
      // merging, and is the documented replacement (`eslintRecommended`
      // turns the core rule off).
      "@typescript-eslint/no-redeclare": "error",

      // ── Imports / types ──────────────────────────────────────────────────
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", disallowTypeAnnotations: true },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
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

  // ── Rollup configs: relax type-aware rules ────────────────────────────────
  {
    files: ["**/*rollup*.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-deprecated": "off",
    },
  },

  // ── Tool config files: disable type-aware parsing ─────────────────────────
  // vitest.config.ts and similar tool configs often have peer-dep version
  // mismatches that make them impossible to type-check with the project's
  // tsconfig. Disabling type-aware parsing avoids "not found by project
  // service" errors without requiring these files to be in tsconfig.json.
  // Most packages' tsconfig covers only src/, so no compiler checks these
  // either: the compiler-owned core rules that understand TypeScript come
  // back.
  {
    files: [
      "**/vitest.config.{ts,js}",
      "**/vitest.config.*.{ts,js}",
      "**/vite.config.{ts,js}",
      "**/vite.config.*.{ts,js}",
    ],
    extends: [tseslint.configs.disableTypeChecked],
    rules: compilerOwnedCoreRules,
  },
  // The TS-aware stand-in for core no-dupe-class-members, on the TS configs
  // only: the plugin is not loaded for .js files.
  {
    files: [
      "**/vitest.config.ts",
      "**/vitest.config.*.ts",
      "**/vite.config.ts",
      "**/vite.config.*.ts",
    ],
    rules: {
      "@typescript-eslint/no-dupe-class-members": "error",
    },
  }
)
