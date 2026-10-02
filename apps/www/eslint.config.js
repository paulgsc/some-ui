import {
  appsRecommended,
  intentGuardConfig,
  queryGuardConfig,
} from "@some-ui/eslint-kit"
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
//
// queryGuardConfig (#968/MS8) is the same kind of opt-in, for the same
// reason: this is the one workspace with query hooks (`src/lib/tenant/`)
// whose `data` is worth guarding against a silently-defaulted destructure.
//
// LA1 (docs/learner-data-authority.md): the network globals are restricted in
// `src/` so a request carrying learner state cannot be written beside the
// account transport and skip its authority check. The files that may use them
// are the ones that ARE the choke point (below); everything else asks one of
// them. A package under `packages/` that makes its own requests (speech, ws,
// fetch-kit corpus reads) is outside this rule, and the doc says so.
const NETWORK_GUARD =
  "Network access goes through createFileHostTransport (lib/file-host-config/client.ts), which refuses to send unless the learner's data authority allows it. See docs/learner-data-authority.md, LA1."

export default defineConfig([
  ...appsRecommended,
  ...intentGuardConfig,
  ...queryGuardConfig,

  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].map(
          (name) => ({ name, message: NETWORK_GUARD })
        ),
      ],
      "no-restricted-properties": [
        "error",
        ...["window", "globalThis", "self"].flatMap((object) =>
          ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].map(
            (property) => ({ object, property, message: NETWORK_GUARD })
          )
        ),
        { object: "navigator", property: "sendBeacon", message: NETWORK_GUARD },
      ],
    },
  },
  {
    // The two files that are the choke point: the account/ceremony transport,
    // and the Android build's wrapper that answers `file_host` routes from the
    // device's own database. Tests stub the network on purpose.
    files: [
      "src/lib/file-host-config/client.ts",
      "src/lib/device-backend/interceptor/index.ts",
      "src/test-support/**",
      "src/**/__tests__/**",
      "src/**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
    },
  },

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
