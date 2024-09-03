//@ts-check
import url from "node:url"
import { FlatCompat } from "@eslint/eslintrc"
import eslint from "@eslint/js"
import tsPlugin from "@typescript-eslint/eslint-plugin"
import typescriptParser from "@typescript-eslint/parser"
import prettier from "eslint-config-prettier"
import deprecationPlugin from "eslint-plugin-deprecation"
import importPlugin from "eslint-plugin-import"
import jsonPlugin from "eslint-plugin-json"
import jsxA11yPlugin from "eslint-plugin-jsx-a11y"
import prettierPlugin from "eslint-plugin-prettier"
import reactPlugin from "eslint-plugin-react"
import reactHooksPlugin from "eslint-plugin-react-hooks"
import eslintPluginStorybook from "eslint-plugin-storybook"
import tailwindPlugin from "eslint-plugin-tailwindcss"
import unicornPlugin from "eslint-plugin-unicorn"
import unusedImports from "eslint-plugin-unused-imports"
import globals from "globals"
import tseslint from "typescript-eslint"

const __dirname = url.fileURLToPath(new URL(".", import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

export default tseslint.config(
  prettier,
  {
    plugins: {
      prettier: prettierPlugin,
      "unused-imports": unusedImports,
      "@typescript-eslint/eslint-plugin": tsPlugin,
      deprecation: deprecationPlugin,
      ["unicorn"]: unicornPlugin,
      ["react-hooks"]: reactHooksPlugin,
      ["react"]: reactPlugin,
      ["import"]: importPlugin,
      ["tailwindcss"]: tailwindPlugin,
      ["json"]: jsonPlugin,
      ["storybook"]: eslintPluginStorybook,
    },
  },
  {
    ignores: [
      "**/jest.config.js",
      "**/tailwind.config.js",
      "**/node_modules/**",
      "**/dist/**",
      "**/package.json",
      "**/package-lock.json",
      "**/fixtures/**",
      "**/coverage/**",
      "**/__snapshots__/**",
      "**/.docusaurus/**",
      "**/build/**",
      "**/.next/**",
      "**/tsconfig.json",
      "**/storybook-static/**",

      ".stylelintrc.mjs",
      "**/vite-env.d.ts",
    ],
  },
  {
    settings: {
      tailwindcss: {
        callees: ["cn", "cva"],
      },
    },
  },
  {
    languageOptions: {
      parser: typescriptParser,
      ...jsxA11yPlugin.flatConfigs.recommended.languageOptions,
      globals: {
        ...globals.es2020,
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        allowAutomaticSingleRunInference: true,
        ecmaFeatures: {
          jsx: true,
        },
        cacheLifetime: {
          // we pretty well never create/change tsconfig structure - so no need to ever evict the cache
          // in the rare case that we do - just need to manually restart their IDE.
          glob: "Infinity",
        },
        project: [
          "./packages/*/tsconfig.json",
          "./packages/ui/*/tsconfig.json",
        ],
        tsconfigRootDir: __dirname,
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    rules: {
      "logical-assignment-operators": "error",
      "no-else-return": "error",
      "no-mixed-operators": "error",
      "no-console": "error",
      "no-process-exit": "error",
      "no-fallthrough": [
        "error",
        { commentPattern: ".*intentional fallthrough.*" },
      ],
      "one-var": ["error", "never"],

      // tailwindcss
      "tailwindcss/classnames-order": "warn",
      "tailwindcss/enforces-shorthand": "warn",
      "tailwindcss/no-custom-classname": "warn",
      "tailwindcss/no-contradicting-classname": "error",
      "tailwindcss/no-unnecessary-arbitrary-value": "error",
    },
  },

  {
    files: ["packages/**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      // turn off other type-aware rules
      "deprecation/deprecation": "off",
      "@typescript-eslint/internal/no-poorly-typed-ts-props": "off",

      // turn off rules that don't apply to JS code
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },

  // tools and tests
  //
  {
    files: [
      "**/tools/**/*.{ts,tsx,cts,mts}",
      "**/tests/**/*.{ts,tsx,cts,mts}",
      "packages/repo-tools/**/*.{ts,tsx,cts,mts}",
      "packages/integration-tests/**/*.{ts,tsx,cts,mts}",
    ],
    rules: {
      // allow console logs in tools and tests
      "no-console": "off",
    },
  },
  {
    files: ["eslint.config.{js,cjs,mjs}"],
    rules: {
      // requirement
      "import/no-default-export": "off",
    },
  },
  {
    files: ["packages/**/*.{ts,tsx,cts,mts}"],

    extends: [
      eslint.configs.recommended,
      jsxA11yPlugin.flatConfigs.recommended,
      reactPlugin.configs.flat.recommended,

      ...compat.config(reactHooksPlugin.configs.recommended),

      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],

    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // ts rules

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          caughtErrors: "all",
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", disallowTypeAnnotations: true },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowIIFEs: true },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        { allowConstantLoopConditions: true },
      ],
      "@typescript-eslint/prefer-literal-enum-member": [
        "error",
        {
          allowBitwiseExpressions: true,
        },
      ],
      "@typescript-eslint/prefer-string-starts-ends-with": [
        "error",
        {
          allowSingleElementEquality: "always",
        },
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
      "@typescript-eslint/prefer-nullish-coalescing": [
        "error",
        {
          ignoreConditionalTests: true,
          ignorePrimitives: true,
        },
      ],
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      // eslint-plugin-unicorn
      "unicorn/no-typeof-undefined": "error",
      // make sure we're not leveraging any deprecated APIs
      // 'deprecation/deprecation': 'error'

      "@typescript-eslint/array-type": ["error", { default: "generic" }],
    },
  },
  {
    files: ["packages/**/*.{mdx,jsx,tsx}"],

    rules: {
      "react/function-component-definition": [
        "error",
        {
          namedComponents: "arrow-function",
          unnamedComponents: "arrow-function",
        },
      ],
      "import/no-anonymous-default-export": "error",
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
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
      "react/jsx-no-target-blank": "off",

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
  {
    files: ["**/*.stories.tsx"],
    extends: [...eslintPluginStorybook.configs["flat/recommended"]],
    rules: {
      "import/no-anonymous-default-export": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-mixed-operators": "off",
    },
  },
  {
    files: ["packages/**/*rollup*.ts"],
    rules: {
      // turn off other type-aware rules
      "deprecation/deprecation": "off",
      "@typescript-eslint/internal/no-poorly-typed-ts-props": "off",

      // turn off rules that don't apply to JS code
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  }
)
