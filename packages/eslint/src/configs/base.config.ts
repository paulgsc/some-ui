import prettier from "eslint-config-prettier"
import prettierPlugin from "eslint-plugin-prettier"
import unusedImports from "eslint-plugin-unused-imports"
import { defineConfig } from "eslint/config"
import globals from "globals"

/**
 * Exported so a config spread after this one - and that also sets
 * `no-restricted-imports` for the same files (theme-protocol.config.ts does,
 * for its app-theme-provider ban) - can restate this pattern instead of
 * silently dropping it. Flat config replaces this rule's value wholesale at
 * the most specific matching config; there is no way to keep both without
 * merging the pattern lists by hand.
 */
export const parentRelativeImportPattern = {
  group: ["../*"],
  message:
    "Parent-relative imports ('../') are not allowed - use this workspace's path alias (e.g. \"@your-alias/...\") instead. Same-directory relative imports ('./...') are still fine.",
}

export default defineConfig(
  prettier,
  {
    plugins: {
      prettier: prettierPlugin,
      "unused-imports": unusedImports,
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
      "**/public/**",
      "**/fixtures/**",
      "**/coverage/**",
      "**/__snapshots__/**",
      "**/.docusaurus/**",
      "**/*.cache/**",
      "**/build/**",
      "**/.next/**",
      "**/tsconfig.json",
      "**/storybook-static/**",
      ".stylelintrc.mjs",
      "**/vite-env.d.ts",

      ".playwright*/**",
      ".chromium*/**",

      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.es2020,
        ...globals.node,
        ...globals.browser,
        browser: "readonly",
        chrome: "readonly",
      },
    },
    rules: {
      "no-implicit-coercion": ["error", { boolean: false }],
      "no-lonely-if": "error",
      "logical-assignment-operators": "error",
      "no-else-return": "error",
      "no-console": "error",
      "no-process-exit": "error",
      "no-fallthrough": [
        "error",
        { commentPattern: ".*intentional fallthrough.*" },
      ],
      "no-unreachable-loop": "error",
      "no-useless-call": "error",
      "no-useless-computed-key": "error",
      "no-useless-concat": "error",
      "no-var": "error",
      "one-var": ["error", "never"],
      // Enforce explicit radix in parseInt — aligns with ESLint v10 deprecation
      // of the "always"/"as-needed" options; "always" is now the only behavior
      radix: "error",
      // Prefer template literals over string concatenation
      "prefer-template": "error",
      // Disallow loose equality
      eqeqeq: ["error", "always", { null: "ignore" }],
      // Enforce arrow callbacks where possible
      "prefer-arrow-callback": "error",

      // ── Import locality ──────────────────────────────────────────────────
      // `../` encodes filesystem traversal from the importer, not the
      // identity of the imported module - it breaks the moment the importer
      // moves, and multi-level paths require the reader to do path
      // arithmetic to know what's being imported. `./sibling` (same
      // directory) stays fine: it's genuinely local and doesn't traverse
      // anything. Crossing a directory boundary should go through the
      // workspace's own path alias instead.
      //
      // "../*" is a gitignore-style pattern (this rule matches import
      // specifiers with the `ignore` package), not a regex - `*` still
      // matches across `/` here because the match is anchored on a
      // relative-path root, so this one pattern catches "../x" and
      // "../../x" alike without needing one entry per depth.
      "no-restricted-imports": [
        "error",
        {
          patterns: [parentRelativeImportPattern],
        },
      ],
    },
  }
)
