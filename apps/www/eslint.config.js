import {
  appsRecommended,
  intentGuardConfig,
  ownerGuardConfig,
  queryGuardConfig,
} from "@some-ui/eslint-kit"
import { defineConfig } from "eslint/config"

// `appsRecommended`, not the default export: this is a deployable host with
// an entry chunk (see the preset's doc comment).
//
// The opt-in guards, on because this workspace has what they guard:
// intentGuardConfig the intent boundary (`src/lib/intent/`; an effect from a
// JSX handler must go through `useIntent`/`useAsyncIntent`), queryGuardConfig
// the query hooks (`src/lib/tenant/`; no silently-defaulted `data`), and
// ownerGuardConfig state seeded from a prop or the clock (frozen at mount).
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
  ...ownerGuardConfig,

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

  // `switch-exhaustiveness-check` fires on a `switch` over a union missing a
  // case (a new `Intent` status outside `matchIntent`). A `default` must not
  // count as covering every case: `switch-lint/require-fail-fast-default`
  // already makes a `default` fail fast rather than absorb.
  {
    files: ["**/*.{ts,tsx}"],
    // The tool-config globs typescript.config.ts excludes from type-aware
    // parsing; a type-aware rule would fail on them.
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
