import { appsRecommended, intentGuardConfig } from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

// `appsRecommended`, not the default export: this is a deployable host with
// an entry chunk, so the lints about what lands in that chunk apply here and
// nowhere else. See the preset's doc comment.
//
// intentGuardConfig (#937 S1) is opt-in per its own doc comment - enabled
// here because this is the one workspace with an intent boundary
// (`src/lib/intent/`) to guard. `no-unbounded-intent` catches an effect
// initiated from inside a JSX event handler without going through
// `useIntent`/`useAsyncIntent`.
export default defineConfig([
  ...appsRecommended,
  ...intentGuardConfig,

  // #937 S2: the compiler half of the boundary. `switch-exhaustiveness-check`
  // is type-aware (already available here via typescriptConfig's
  // `projectService: true`) and fires when a `switch` over a union type
  // is missing a case - the exact failure mode a fifth `Intent` status
  // would produce in a raw `switch (intent.status)` that isn't routed
  // through `matchIntent`. `considerDefaultExhaustiveForUnions: false`
  // deliberately: a `default` that silently absorbs a newly-added member is
  // the failure this whole epic is about, so a `default` arm must not count
  // as covering every case - `switch-lint/require-fail-fast-default`
  // (already active via `maishatuRecommended`) is what makes a `default`
  // legal at all, by requiring it to fail fast rather than absorb.
  {
    files: ["**/*.{ts,tsx}"],
    // Same tool-config globs typescript.config.ts's own override disables
    // type-aware parsing for - a type-aware rule re-enabled here for one of
    // them would hit "don't have parserOptions set to generate type
    // information for this file" the moment it's linted.
    ignores: [
      "**/vitest.config.{ts,js}",
      "**/vitest.config.*.{ts,js}",
      "**/vite.config.{ts,js}",
      "**/vite.config.*.{ts,js}",
    ],
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: false },
      ],
    },
  },
])
