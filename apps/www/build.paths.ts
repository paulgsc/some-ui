import type { PathRules } from "@some-ui/vite-config/bundle-paths"
import { definePaths } from "@some-ui/vite-config/bundle-paths"

import { gates, MOBILE_PROFILE, profiles } from "./build.profiles.ts"

/**
 * What each profile's output may carry, checked against a real build by
 * `pnpm --filter www check:bundle-paths` (check-bundle-paths.ts; rule in
 * packages/some-vite-config/AUDIENCES.md, "Paths"). A profile ships only the
 * code on its own path. Audiences (build.profiles.ts) cover whole
 * `packages/ui/*` workspaces; these rules cover www's own modules, npm
 * packages, and chunks nothing loads.
 */
type Profile = keyof typeof profiles

function isProfile(name: string): name is Profile {
  return name in profiles
}

/** Every profile build.profiles.ts defines, in its order. */
export const PROFILES: ReadonlyArray<Profile> =
  Object.keys(profiles).filter(isProfile)

/**
 * The environment each deployable builds with, beside `SOME_UI_PROFILE`, kept
 * in step by hand with the Dockerfile (`lan`), .github/workflows/pages.yml
 * (`pages`; base path is the repository name) and apps/mobile's `build:web`
 * (`mobile`). Every profile sets all three, so a shell export cannot change
 * what is checked.
 */
export const profileBuildEnv: Readonly<
  Record<Profile, Readonly<Record<string, string>>>
> = {
  lan: { VITE_DEVICE_BACKEND: "", VITE_STATIC_DATA: "", VITE_BASE_PATH: "/" },
  pages: {
    VITE_DEVICE_BACKEND: "",
    VITE_STATIC_DATA: "true",
    VITE_BASE_PATH: "/some-ui/",
  },
  [MOBILE_PROFILE]: {
    VITE_DEVICE_BACKEND: "true",
    VITE_STATIC_DATA: "false",
    VITE_BASE_PATH: "/",
  },
}

/**
 * The route files on the Android app's path: the root, the layouts above
 * `MOBILE_SURFACE`'s routes (src/lib/app-surface), and those routes. The
 * mobile-surface test fails when this list and the route tree differ.
 */
export const MOBILE_ROUTE_FILES = [
  "apps/www/src/routes/__root.tsx*",
  "apps/www/src/routes/_dashboard.tsx*",
  "apps/www/src/routes/_dashboard/_apk.tsx*",
  "apps/www/src/routes/_dashboard/_apk/**",
  "apps/www/src/routes/_dashboard/sessions/**",
  "apps/www/src/routes/_dashboard/settings.tsx*",
  "apps/www/src/routes/auth.tsx*",
] as const

/**
 * `@some-ui/speech`'s backend entries, one per voice (packages/speech,
 * src/lib/adapters/registry.ts). Its main entry is in every profile.
 */
const SPEECH_ENTRY = "packages/speech/dist/@some-ui/speech"

/** Modules that exist for the phone: the device backend and its plugins. */
const DEVICE_MODULES = [
  `${SPEECH_ENTRY}/native.es.js`,
  "apps/www/src/lib/device-backend/**",
  "apps/www/src/lib/device-speech/**",
  "apps/www/src/lib/dictation/**",
  "apps/www/src/lib/study-nudge/native.ts",
  "apps/www/src/lib/study-nudge/schedule.ts",
  "apps/www/src/components/settings/device-*.tsx",
  "node_modules/@capacitor/**",
  "node_modules/@capacitor-community/**",
]

/**
 * A gate directory's routes are on the path of the profiles that carry its
 * audience and no other: elsewhere its layout sends every visit to
 * not-found, and the workspaces its pages render are stubs.
 */
const gatedRoutes = Object.entries(gates).map(([audience, dirs]) => ({
  modules: dirs.flatMap((dir) => [
    `apps/www/${dir}.tsx*`,
    `apps/www/${dir}/**`,
  ]),
  profiles: PROFILES.filter((profile) =>
    profiles[profile].audiences.some((carried) => carried === audience)
  ),
  why: `a route gated to the "${audience}" audience (build.profiles.ts, \`gates\`), which this profile does not carry`,
}))

type Debt = PathRules<Profile>["debt"][number]

const SHARED_ROUTE_TREE =
  "every profile builds the one shared route tree; removed when this deployable gets its own"

export const paths: PathRules<Profile> = definePaths<Profile>({
  exclusive: [
    ...gatedRoutes,
    {
      modules: [
        "apps/www/src/lib/tenant/sessions-transfer/**",
        "apps/www/src/lib/tenant/transfer-lock/**",
        "apps/www/src/lib/tts-config/**",
        "apps/www/src/components/settings/account-section.tsx",
        "apps/www/src/components/settings/data-home-section.tsx",
        "apps/www/src/components/settings/hosted-voice-fields.tsx",
      ],
      profiles: ["lan", "pages"],
      why: "web-only code: the Android app has no account to move sessions to or sign out of, and no hosted voice (it speaks with the phone's engine)",
    },
    {
      modules: [
        `${SPEECH_ENTRY}/http.es.js`,
        `${SPEECH_ENTRY}/web-speech.es.js`,
      ],
      profiles: ["lan", "pages"],
      why: "the web builds' voices, the hosted service and the browser's own synthesizer: the Android app speaks only with the phone's engine (src/providers/tts.tsx)",
    },
    {
      modules: DEVICE_MODULES,
      profiles: [MOBILE_PROFILE],
      why: "native-only code, which runs only in the Android app (src/lib/device-backend, src/vite-env.d.ts on VITE_DEVICE_BACKEND)",
    },
  ],
  decidedElsewhere: [
    {
      modules: ["packages/ui/**"],
      why: "a packages/ui workspace ships where its audience does (build.profiles.ts)",
    },
    {
      modules: ["node_modules/**"],
      why: "an npm module ships where what imports it does; that is what is classified",
    },
  ],
  allowlists: [
    {
      profile: MOBILE_PROFILE,
      within: "apps/www/src/routes/**",
      allow: MOBILE_ROUTE_FILES,
      why: "a route off the Android app's surface (src/lib/app-surface), which it redirects away from before anything renders",
    },
  ],
  required: [
    {
      profile: MOBILE_PROFILE,
      modules: [
        "apps/www/src/lib/device-backend/backend/index.ts",
        "apps/www/src/lib/device-backend/capacitor-sqlite/index.ts",
        "apps/www/src/lib/device-speech/native.ts",
        `${SPEECH_ENTRY}/native.es.js`,
        "apps/www/src/lib/study-nudge/native.ts",
        "apps/www/src/lib/study-nudge/schedule.ts",
        "apps/www/src/lib/dictation/index.ts",
      ],
      why: "the Android app answers file_host, speaks, nudges and takes dictation through these; a build without one is an APK that installs and then fails",
    },
    // Also what keeps the web-voices rule in `exclusive` from passing by
    // matching nothing, should the speech dist layout move.
    ...(["lan", "pages"] as const).map((profile) => ({
      profile,
      modules: [
        `${SPEECH_ENTRY}/http.es.js`,
        `${SPEECH_ENTRY}/web-speech.es.js`,
      ],
      why: "the web builds speak through these (src/providers/tts.tsx); a build without them is silent",
    })),
  ],
  // Every profile builds one shared route tree (AUDIENCES.md, "Build
  // audiences"), so an off-path route ships as a stub in the startup chunk
  // plus its page chunk. Paid off by per-deployable route trees; each entry
  // goes with the change that drops it.
  debt: [
    ...(["lan", "pages"] as const).map(
      (profile): Debt => ({
        profile,
        module: "apps/www/src/routes/_dashboard/_apk**",
        why: SHARED_ROUTE_TREE,
      })
    ),
    {
      profile: "pages",
      module: "apps/www/src/routes/_dashboard/_lan**",
      why: SHARED_ROUTE_TREE,
    },
    ...[
      "_dashboard/_lan**",
      "index.tsx*",
      "mission.tsx*",
      "extensions.tsx*",
      "_dashboard/app.tsx*",
      "_dashboard/jobs.tsx*",
      "_dashboard/profile.tsx*",
      "_dashboard/resume.tsx*",
    ].map(
      (route): Debt => ({
        profile: MOBILE_PROFILE,
        module: `apps/www/src/routes/${route}`,
        why: SHARED_ROUTE_TREE,
      })
    ),
  ],
})
