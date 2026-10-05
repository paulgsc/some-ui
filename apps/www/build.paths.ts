import type { PathRules } from "@some-ui/vite-config/bundle-paths"
import { definePaths } from "@some-ui/vite-config/bundle-paths"

import { gates, MOBILE_PROFILE, profiles } from "./build.profiles.ts"

/**
 * What each profile's output may carry, checked against a real build of it
 * by `pnpm --filter www check:bundle-paths` (check-bundle-paths.ts;
 * the rule, and why it reads the written output, in
 * packages/some-vite-config/AUDIENCES.md, "Paths"). A profile ships only the
 * code on its own path: what no visit to that deployable can run does not
 * belong in it, at startup or anywhere else in the output.
 *
 * Audiences (build.profiles.ts) already say this for whole `packages/ui/*`
 * workspaces. These rules say it for what audiences cannot see: www's own
 * modules, npm packages, and chunks the bundler emits that nothing loads.
 */
type Profile = keyof typeof profiles

function isProfile(name: string): name is Profile {
  return name in profiles
}

/** Every profile build.profiles.ts defines, in its order. */
export const PROFILES: ReadonlyArray<Profile> =
  Object.keys(profiles).filter(isProfile)

/**
 * The environment each deployable builds with, beside `SOME_UI_PROFILE`, so
 * the check builds what ships. Kept in step by hand with where each is set:
 * the Dockerfile (`lan`), .github/workflows/pages.yml (`pages`; its base path
 * is the repository's name), and apps/mobile's `build:web` (`mobile`). Every
 * profile sets all three, so none of them exported in the caller's shell
 * (Vite prefers it to any .env file) can change which modules are checked.
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
 * Files Vite copies from public/ that a profile never loads, by name at the
 * top of its output. They are not chunks, so the module rules below cannot
 * see them: vite.config.ts deletes them from that profile's output, and
 * check-bundle-paths.ts fails when one is still there, or when one names no
 * file in public/ (renamed, it would ship again unnoticed).
 */
const OFF_PATH_PUBLIC_FILES: Readonly<Record<Profile, ReadonlyArray<RegExp>>> =
  {
    lan: [],
    pages: [],
    [MOBILE_PROFILE]: [
      // What scripts/sync-resume.mjs copies in for /resume, which is not on
      // the Android app's surface (src/lib/app-surface).
      /^resume.*\.pdf$/,
      // The web-push service worker: src/lib/study-nudge/service-worker.ts
      // never registers it in this build, which nudges natively.
      /^sw\.js$/,
    ],
  }

/**
 * `OFF_PATH_PUBLIC_FILES` for a `SOME_UI_PROFILE` value: unset or empty is
 * `lan`, as in `buildAudiencePlugin`.
 */
export function offPathPublicFiles(
  profile: string | undefined
): ReadonlyArray<RegExp> {
  const name = profile || "lan"
  return isProfile(name) ? OFF_PATH_PUBLIC_FILES[name] : []
}

/**
 * The route files on the Android app's path: the root and the layouts above
 * `MOBILE_SURFACE`'s routes (src/lib/app-surface), and those routes. The
 * mobile-surface test derives this list from the real route tree and fails
 * when the two differ, so a route added to the surface is added here too.
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
  "apps/www/src/components/auth/device-*.tsx",
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
        "apps/www/src/components/settings/account-section.tsx",
        "apps/www/src/components/settings/data-home-section.tsx",
      ],
      profiles: ["lan", "pages"],
      why: "web-only code: the Android app has no account to move sessions to or sign out of, and no hosted voice (it speaks with the phone's engine)",
    },
    {
      modules: [
        "apps/www/src/lib/passkey/**",
        "apps/www/src/lib/auth/account-keeps.ts",
        "apps/www/src/lib/auth/errors.ts",
      ],
      profiles: ["lan", "pages"],
      why: "the passkey screen and what only it says: the Android app has no sign-in, and its /auth offers a reload instead (src/components/auth/device-session-lost)",
    },
    {
      modules: [`${SPEECH_ENTRY}/web-speech.es.js`],
      profiles: ["lan", "pages"],
      why: "the web builds' voice, the browser's own synthesizer: the Android app speaks only with the phone's engine (src/providers/tts.tsx)",
    },
    {
      modules: [
        `${SPEECH_ENTRY}/http.es.js`,
        "apps/www/src/lib/tts-config/**",
        "apps/www/src/components/settings/hosted-voice-fields.tsx",
      ],
      profiles: ["lan"],
      why: "the hosted voice, which needs the TTS service only the home server runs: Pages has none, and the Android app speaks with the phone's engine (src/providers/tts.tsx)",
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
    {
      profile: MOBILE_PROFILE,
      modules: ["apps/www/src/components/auth/device-session-lost.tsx"],
      why: "the Android app's /auth: without it the route renders the web's passkey screen, which this build cannot use",
    },
    // Also what keeps the voice and passkey rules in `exclusive` from passing
    // by matching nothing, should the speech dist layout or lib/ move.
    {
      profile: "lan",
      modules: [
        `${SPEECH_ENTRY}/http.es.js`,
        `${SPEECH_ENTRY}/web-speech.es.js`,
      ],
      why: "the home server speaks through these (src/providers/tts.tsx); a build without them is silent",
    },
    {
      profile: "lan",
      modules: ["apps/www/src/lib/passkey/index.ts"],
      why: "a passkey is the only way into an account on the home server (src/lib/auth/session.ts)",
    },
    {
      profile: "pages",
      modules: [`${SPEECH_ENTRY}/web-speech.es.js`],
      why: "Pages speaks through this (src/providers/tts.tsx); a build without it is silent",
    },
  ],
  // Every profile builds one route tree, shared by design until now
  // (AUDIENCES.md, "Build audiences"): a route off a profile's path ships
  // there as a stub in the startup chunk plus its page chunk, which the
  // profile redirects or 404s away from before it renders. Paid off by giving
  // each deployable a route tree of its own routes; each entry goes with the
  // change that drops it.
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
