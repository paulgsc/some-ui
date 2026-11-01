import {
  appsRecommended,
  compiledPackageStyleImportBanPattern,
  intentGuardConfig,
  keptRecordConfig,
  ownerGuardConfig,
  parentRelativeImportPattern,
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
// ownerGuardConfig state seeded from a prop or the clock (frozen at mount),
// and keptRecordConfig the page's storage (KR1; its exemptions are below).
//
// LA1 (docs/learner-data-authority.md): the network globals are restricted in
// `src/` so a request carrying learner state cannot be written beside the
// account transport and skip its authority check. The files that may use them
// are the ones that ARE the choke point (below); everything else asks one of
// them. A package under `packages/` that makes its own requests (speech, ws,
// fetch-kit corpus reads) is outside this rule, and the doc says so.
const NETWORK_GUARD =
  "Network access goes through createFileHostTransport (lib/file-host-config/client.ts), which refuses to send unless the learner's data authority allows it. See docs/learner-data-authority.md, LA1."

// LA16: what holds or shows a reflection, what those may import from `@/`,
// and the only other modules that may import them. `lib/agent-export` is the
// whole export's share: it reads the sessions repository, so it is not held
// to the first list, and LA16's falsifier names it for review instead, as it
// does the drain's modules that send the written ones home.
const REFLECTION_MODULES = [
  "src/lib/session-reflection/**",
  "src/lib/reflection-voice/**",
  "src/components/reflection/**",
]
const REFLECTION_MAY_IMPORT = [
  "lib/session-reflection",
  "lib/reflection-voice",
  "lib/bounded-list",
  "lib/clock",
  "lib/format",
  "lib/intent",
  "lib/tenant$",
  // MIC2: Let go owes a spoken reflection's set-aside mark, its id and when,
  // in the voice lane's record (LA13); it sends nothing itself.
  "lib/voice-marks$",
  "components/reflection",
  "components/player/toggle-chips$",
]
const REFLECTION_IMPORTERS = [
  "src/lib/agent-export/**",
  // LA13: the voice lane reads spoken reflections to copy them for home,
  // and only while its person keeps voice notes there.
  "src/lib/home-link/voice.ts",
  "src/lib/home-link/voice-copy.ts",
  // LA16: the drain sends the written ones home and lets go of the ones past
  // the offline set home holds; the Practice lane follows the store.
  "src/lib/home-link/reflections.ts",
  "src/lib/home-link/going.ts",
  "src/lib/home-link/practice.ts",
  // Practice's footnote says the offline set in the strip's own words.
  "src/lib/home-link/words.ts",
  "src/main.tsx",
  "src/components/player/completion-summary.tsx",
  "src/components/player/live-player.tsx",
  "src/components/player/session-chrome.tsx",
  "src/routes/_dashboard/sessions/index.tsx",
  "src/routes/_dashboard/_apk/soundbites.tsx",
]
const TESTS = ["src/**/__tests__/**", "src/**/*.test.{ts,tsx}"]

// A4 (packages/some-vite-config/AUDIENCES.md): the web surface's door hands
// out its gated workspaces only through its index, so nothing reaches below
// it. The door's own files are held to it too; none imports another through `@/`.
const DOOR_PATTERN = {
  regex: "^@/lib/web-surface/",
  message:
    "Import the web surface through its door, `@/lib/web-surface`, never below it: the index keeps each gated workspace behind its guard. See packages/some-vite-config/AUDIENCES.md, A4.",
}

const REFLECTION_GUARD =
  "A written reflection goes home only through the drain (lib/home-link/reflections), a spoken one only as its voice note, and the one-tap answers never: never by another server transport or a session record. See docs/learner-data-authority.md, LA16."

export default defineConfig([
  ...appsRecommended,
  ...intentGuardConfig,
  ...queryGuardConfig,
  ...ownerGuardConfig,
  {
    ...keptRecordConfig[0],
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...(keptRecordConfig[0]?.ignores ?? []),
      "src/lib/tenant/storage.ts",
      "src/lib/demo/viewer-storage.ts",
    ],
  },

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

  // LA16 (docs/learner-data-authority.md): what may send a reflection home. Both
  // blocks are allowlists, and restate base.config.ts's patterns, which a
  // block setting this rule would otherwise replace.
  {
    files: REFLECTION_MODULES,
    ignores: TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/tenant",
              allowImportNames: ["useSessions"],
              message: REFLECTION_GUARD,
            },
          ],
          patterns: [
            parentRelativeImportPattern,
            compiledPackageStyleImportBanPattern,
            DOOR_PATTERN,
            {
              regex: `^@/(?!(${REFLECTION_MAY_IMPORT.join("|")})(/|$))`,
              message: REFLECTION_GUARD,
            },
            {
              group: ["@some-ui/fetch-kit", "@some-ui/fetch-kit/*"],
              message: REFLECTION_GUARD,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...REFLECTION_MODULES, ...REFLECTION_IMPORTERS, ...TESTS],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            compiledPackageStyleImportBanPattern,
            DOOR_PATTERN,
            {
              // `reflection-voice/budget` is a size, which the storage
              // budget reserves; it holds no reflection.
              regex:
                "^@/(lib/(session-reflection|agent-export)|lib/reflection-voice(?!/budget$)|components/reflection)(/|$)",
              message: REFLECTION_GUARD,
            },
          ],
        },
      ],
    },
  },

  {
    // A4 for what both LA16 blocks leave out, restating the preset's patterns.
    files: [...REFLECTION_IMPORTERS, ...TESTS],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            parentRelativeImportPattern,
            compiledPackageStyleImportBanPattern,
            DOOR_PATTERN,
          ],
        },
      ],
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
