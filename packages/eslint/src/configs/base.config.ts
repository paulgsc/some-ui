import prettier from "eslint-config-prettier"
import prettierPlugin from "eslint-plugin-prettier"
import unusedImports from "eslint-plugin-unused-imports"
import { defineConfig } from "eslint/config"
import globals from "globals"

import { noRawFetch } from "../rules/index.js"

const networkBoundaryPlugin = {
  meta: { name: "network-boundary", version: "0.0.1" },
  rules: { "no-raw-fetch": noRawFetch },
}

export default defineConfig(
  prettier,
  {
    plugins: {
      prettier: prettierPlugin,
      "unused-imports": unusedImports,
      "network-boundary": networkBoundaryPlugin,
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
      // Warn first so existing application exceptions remain visible while
      // migrations land; promote to error once the allowlist is retired.
      "network-boundary/no-raw-fetch": [
        "warn",
        {
          allowlist: [
            // The primitive that implements the bounded client itself.
            "packages/fetch-kit/src/lib/fetch-client/index.ts",
            // Preserves file_host-specific error envelopes at this boundary;
            // tracked for a transport adapter migration.
            "apps/www/src/lib/file-host-config/client.ts",
            // Executable probe supplies its own AbortSignal deadline.
            "packages/contract-harness/src/probe.ts",
          ],
        },
      ],
    },
  }
)
