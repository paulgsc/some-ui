import type { PathRules } from "@some-ui/vite-config/bundle-paths"
import { definePaths } from "@some-ui/vite-config/bundle-paths"

import {
  CAPTURE_PROFILE,
  MOBILE_PROFILE,
  profiles,
  routeGates,
} from "./build.profiles.ts"
import {
  DEFAULT_RESUME_TEMPLATE,
  RESUME_TEMPLATES,
} from "./src/lib/resume-files.ts"

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

/**
 * Every profile build.profiles.ts defines that ships somewhere, in its order:
 * the ones these rules and check-bundle-paths.ts hold. The capture profile
 * (`CAPTURE_PROFILE`) is left out: Snips Capture photographs it and nothing
 * deploys it, so no visit to a deployable can load what it carries.
 */
type Deployable = Exclude<Profile, typeof CAPTURE_PROFILE>

function isDeployable(profile: Profile): profile is Deployable {
  return profile !== CAPTURE_PROFILE
}

export const PROFILES: ReadonlyArray<Deployable> = Object.keys(profiles)
  .filter(isProfile)
  .filter(isDeployable)

/**
 * The environment each deployable builds with, beside `SOME_UI_PROFILE`, so
 * the check builds what ships. Kept in step by hand with where each is set:
 * the Dockerfile (`lan`), .github/workflows/pages.yml (`pages`; its base path
 * is the repository's name), and apps/mobile's `build:web` (`mobile`). Every
 * profile sets all three, so none of them exported in the caller's shell
 * (Vite prefers it to any .env file) can change which modules are checked.
 */
export const profileBuildEnv: Readonly<
  Record<Deployable, Readonly<Record<string, string>>>
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
    pages: [
      // The résumé's layout renders (`resume-<version>-<layout>.pdf`): the
      // public site offers one PDF per version, in its default layout, and
      // resume.pdf (C1055, #3401); the layouts are the owner's tool at home.
      new RegExp(
        `^resume-.+-(${RESUME_TEMPLATES.map(({ id }) => id)
          .filter((id) => id !== DEFAULT_RESUME_TEMPLATE)
          .join("|")})\\.pdf$`
      ),
      // The app's service worker and install manifest, and the manifest's
      // icons: the public site carries no app (C1055, #3401), so nothing
      // registers the worker. One a browser registered on an earlier deploy
      // has no fetch handler (public/sw.js), so it serves no page.
      /^sw\.js$/,
      /^manifest\.json$/,
      /^logo(192|512)\.png$/,
    ],
    [CAPTURE_PROFILE]: [],
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
  "apps/www/src/routes/_dashboard/practice/settings.tsx*",
  "apps/www/src/routes/_dashboard/sessions/**",
  "apps/www/src/routes/_dashboard/settings/**",
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
  "apps/www/src/lib/agent-export/**",
  "apps/www/src/lib/drive-filing/**",
  "apps/www/src/lib/engagement-places/**",
  "apps/www/src/lib/episode-feedback/**",
  "apps/www/src/lib/game-bites/**",
  "apps/www/src/lib/game-moments/**",
  "apps/www/src/lib/handed-in/**",
  "apps/www/src/lib/home-link/**",
  "apps/www/src/lib/idea-hearing/**",
  "apps/www/src/lib/call-videos/**",
  "apps/www/src/lib/episodes-feed/**",
  "apps/www/src/lib/renders/**",
  "apps/www/src/lib/idea-keeping/**",
  "apps/www/src/lib/idea-home/**",
  "apps/www/src/lib/idea-takes/**",
  "apps/www/src/lib/interview-week/**",
  "apps/www/src/lib/jobs/**",
  "apps/www/src/lib/journal-share/**",
  "apps/www/src/lib/limits/**",
  "apps/www/src/lib/lens-takes/**",
  "apps/www/src/lib/moves/**",
  "apps/www/src/lib/my-data/**",
  "apps/www/src/lib/leetype-files/**",
  "apps/www/src/lib/leetype-takes/**",
  "apps/www/src/lib/library-takes/**",
  "apps/www/src/lib/reflection-voice/**",
  "apps/www/src/lib/rust-rounds/**",
  "apps/www/src/lib/scene-ask/**",
  "apps/www/src/lib/scene-voice/**",
  "apps/www/src/lib/share-files/**",
  "apps/www/src/lib/soundbite-keeping/**",
  "apps/www/src/lib/studio-clips/frames.ts",
  "apps/www/src/lib/studio-clips/home.ts",
  "apps/www/src/lib/studio-clips/frames-read.ts",
  "apps/www/src/lib/studio-keeping/**",
  "apps/www/src/lib/studio-spoken/**",
  // A runtime's one-value store, used by the phone's runtimes alone today.
  "apps/www/src/lib/cell/**",
  "apps/www/src/lib/take-about/**",
  "apps/www/src/lib/take-conveyor/**",
  "apps/www/src/lib/take-library/**",
  "apps/www/src/lib/take-reconcile/**",
  "apps/www/src/lib/take-uses/**",
  "apps/www/src/lib/hear-again/**",
  "apps/www/src/lib/takes-desk/**",
  "apps/www/src/lib/template-preview/**",
  "apps/www/src/lib/cards-essay-video/**",
  "apps/www/src/lib/voice-home/**",
  "apps/www/src/lib/device-backend/**",
  "apps/www/src/lib/device-speech/**",
  "apps/www/src/lib/device-listen/**",
  "apps/www/src/lib/native-log/**",
  "apps/www/src/lib/pull-refresh/**",
  "apps/www/src/lib/study-nudge/native.ts",
  "apps/www/src/lib/study-nudge/schedule.ts",
  "apps/www/src/components/call-videos.tsx",
  "apps/www/src/components/episode-files.tsx",
  "apps/www/src/components/studio/episodes-by-week.tsx",
  "apps/www/src/components/studio/genre-thumbs.tsx",
  "apps/www/src/components/video-fetch.tsx",
  "apps/www/src/components/studio/clip-frames.tsx",
  "apps/www/src/components/studio/renders.tsx",
  "apps/www/src/components/studio/run-again.tsx",
  "apps/www/src/components/studio/take-conveyor.tsx",
  "apps/www/src/components/studio/episode-feedback.tsx",
  "apps/www/src/components/studio/template-preview.tsx",
  "apps/www/src/components/studio/cards-essay.tsx",
  "apps/www/src/components/studio/spoken.tsx",
  "apps/www/src/components/device-home-glyph.tsx",
  "apps/www/src/components/device-sign-in-mark.tsx",
  "apps/www/src/components/pair-home-link.tsx",
  "apps/www/src/components/player/device-*.ts",
  "apps/www/src/components/aph/device-*.tsx",
  "apps/www/src/components/jobs/**",
  "apps/www/src/components/pull-to-check.tsx",
  "apps/www/src/components/auth/device-*.tsx",
  "apps/www/src/components/settings/device-*.tsx",
  "apps/www/src/components/take-uses/**",
  "apps/www/src/components/reflection/device-*.tsx",
  "apps/www/src/components/sessions/device-*.tsx",
  "packages/voice-capture/**",
  "node_modules/@capacitor/**",
  "node_modules/@capacitor-community/**",
]

/**
 * A gate directory's routes are on the path of the profiles that carry its
 * audience and no other: elsewhere its layout sends every visit to
 * not-found, and the workspaces its pages render are stubs.
 */
const gatedRoutes = routeGates.map(({ audience, dirs }) => ({
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

const TAKE_PATTERN_ON_THE_WEB =
  "LeetType's record screen and play runtime use the take pattern's view and words, which the web builds bundle and never run: they give LeetType no microphone, so it offers typing only. Removed when those words and the view get a subpath entry of their own, or LeetType's web builds stop bundling the take parts (#2433)"

/**
 * The deployables held whole by an allowlist of what they carry
 * (`allowlists`, below), and so left out of `checkExclusivity`'s comparison
 * across builds: beside a build this small, every other module would read as
 * "ships only in lan and the Android app". The public site is one (C1055).
 */
export const ALLOWLISTED_PROFILES: ReadonlyArray<Deployable> = ["pages"]

/**
 * Everything of www's own the public site carries (`allowlists`, below),
 * named one by one, so a module that reaches it later fails until someone
 * adds it here. Its pages are static (src/landing, render-public-site.ts);
 * what runs is the authorship record's one script and the web door it
 * reaches the record through, and the landing's one script, which only
 * enhances its show (C1422): the phone's deck, the media's reveal and the
 * clips' pausing, with the words they say and the show's clock they read,
 * and each pool's draw (`draw.ts`, `pool-dom.ts`, #3473).
 */
const PAGES_MODULES: ReadonlyArray<string> = [
  "apps/www/src/landing/authorship.tsx",
  "apps/www/src/landing/deck.ts",
  "apps/www/src/landing/draw.ts",
  "apps/www/src/landing/enhance.ts",
  "apps/www/src/landing/pool-dom.ts",
  "apps/www/src/landing/timeline.ts",
  "apps/www/src/landing/words.ts",
  "apps/www/src/lib/build-profile/index.ts",
  "apps/www/src/lib/web-surface/burn-ins/authorship.tsx",
  "apps/www/src/lib/web-surface/index.ts",
]

export const paths: PathRules<Profile> = definePaths<Profile>({
  exclusive: [
    ...gatedRoutes,
    {
      modules: ["packages/job-desk/dist/@some-ui/job-desk.es.js"],
      profiles: [MOBILE_PROFILE],
      why: "job-desk's main entry: the Jobs wing's Drive files, which only the Android app's Jobs wing reads and writes (src/lib/jobs). The web builds take only its id rule (the résumé builder) and its sample entry (/job-run)",
    },
    {
      modules: ["apps/www/src/lib/home-web/index.ts"],
      profiles: [MOBILE_PROFILE],
      why: "the home network's web pages the phone opens in its browser rather than carrying (the résumé builder, the teams home follows live): only the Android app links out to them; the web builds are those pages",
    },
    {
      modules: ["apps/www/src/lib/app-events/index.ts"],
      profiles: [MOBILE_PROFILE],
      why: "the notes of how each take on the phone ended, kept until home holds them (CK2): only the Android app records takes and sends them home",
    },
    {
      modules: [
        "apps/www/src/lib/tenant/sessions-transfer/**",
        "apps/www/src/lib/tenant/transfer-lock/**",
        "apps/www/src/lib/auth/account-erases.ts",
        "apps/www/src/lib/auth/phone-pairing-words.ts",
        "apps/www/src/lib/auth/phones/**",
        "apps/www/src/components/settings/account-section.tsx",
        "apps/www/src/components/settings/account-phones.tsx",
        "apps/www/src/components/settings/data-home-section.tsx",
      ],
      profiles: ["lan"],
      why: "web-only code: the Android app has no account to move sessions to or sign out of, nor a list of the account's phones to name or sign out (SIGNIN7), and the public site is a CV with no account (C1055)",
    },
    {
      modules: ["packages/some-styles/src/brand/genres.ts"],
      profiles: [MOBILE_PROFILE],
      why: "each genre's paint and shape (EPISODES3, C1026): Studio's episode rows draw them, and only the Android app has Studio; the thumbnails home renders draw the same data in the render stage, not in a page",
    },
    {
      modules: ["packages/some-styles/src/brand/cast.ts"],
      profiles: ["lan", "mobile"],
      why: "the cast the essays' speaking bubbles draw (PDA6, #2883), on the web surface's essay stages, and the two characters the Android app's Cast wing previews (HOST8, #3532) through the host's rig; the public site (C1055) has neither",
    },
    {
      modules: [
        "apps/www/src/lib/passkey/**",
        "apps/www/src/lib/auth/account-keeps.ts",
        "apps/www/src/lib/auth/errors.ts",
      ],
      profiles: ["lan"],
      why: "the passkey screen and what only it says: the Android app has no sign-in, and its /auth offers a reload instead (src/components/auth/device-session-lost). The public site is a CV with no sign-in page (C1055)",
    },
    {
      modules: [
        "apps/www/src/components/auth/viewer-auth.tsx",
        "apps/www/src/lib/auth/viewer-words.ts",
      ],
      profiles: [],
      why: "the viewer's /auth (SIGNIN5): only the capture build Snips photographs has viewers now, and no deployable ships it; the public site is a CV with no sign-in page (C1055, #3401)",
    },
    {
      modules: [`${SPEECH_ENTRY}/web-speech.es.js`],
      profiles: ["lan", "pages"],
      why: "the web builds' voice, the browser's own synthesizer: the Android app speaks only with the phone's engine (src/providers/tts.tsx)",
    },
    {
      modules: [
        "packages/video-render/src/badges.ts",
        "packages/video-render/src/dna.ts",
        "packages/video-render/src/episode.ts",
        "packages/video-render/src/review.ts",
        "packages/video-render/src/stamp.ts",
        "packages/video-render/src/timing.ts",
      ],
      profiles: [MOBILE_PROFILE],
      why: "a cut list's timing, which fits a scene to its take as Record keeps it, an episode file, which Studio opens as an episode, a review render's review.json, which Watch reads, a video's DNA, which Finish keeps for home to make, the status badges a cut list's scenes show, which its check refuses written by hand, and its cards' stamp, which its check refuses on a card (@some-ui/soundbites, lib/project and lib/studio): the web builds render no video and keep no project. The cut list's and a format's schemas are on every path: the phone's Studio checks a project and a primer against them, and the web's call stage draws a call's format",
    },
    {
      modules: ["packages/video-render/src/spoken-line.ts"],
      profiles: [MOBILE_PROFILE],
      why: "how a take's ref names a spoken card's part (#3339): Takes groups a spoken card's takes by card, and a take home couldn't hear links back to its part, both in the Android app's Studio (@some-ui/soundbites, lib/library and lib/reconcile); the web builds keep no takes",
    },
    {
      modules: ["packages/video-render/src/pending.ts"],
      profiles: [MOBILE_PROFILE],
      why: "what the reflections routine files from Studio's takes (`toFile`, SFEED5): no build imports it since asks left the phone (C1097), and this keeps it off the web builds should one start to. The routine reads the same module from the repo, outside any build",
    },
    {
      modules: ["packages/video-render/src/assets.ts"],
      profiles: [MOBILE_PROFILE],
      why: "the files a render leaves beside an episode, and which home makes alone (ASSETS-R, C1300): only the Android app's episode page shows them and asks home for one (src/lib/call-videos, components/episode-files.tsx). home's worker reads the same module from the repo, outside any build, through `record:asset`",
    },
    {
      modules: ["packages/video-render/src/feedback.ts"],
      profiles: [MOBILE_PROFILE],
      why: "the categories a note on an episode picks from and where each goes (SFEED6): only the Android app's Studio leaves a note (src/lib/episode-feedback). The reflections routine's filing (`pending.ts`) reads the same module from the repo, outside any build",
    },
    {
      modules: [
        "packages/video-render/src/call.ts",
        "packages/video-render/src/call-fit.ts",
        "packages/video-render/src/frame-text.ts",
        "packages/video-render/src/essay.ts",
        "packages/video-render/src/essay-fit.ts",
        "packages/video-render/src/screen.ts",
        "packages/video-render/src/interview-essay.ts",
        "packages/video-render/src/spoken-card.ts",
        "packages/video-render/src/opening.ts",
        "packages/video-render/src/engagement-report.ts",
        "packages/video-render/src/engagement-report-video.ts",
        "packages/video-render/src/stills.ts",
        "packages/video-render/src/verdict.ts",
      ],
      profiles: ["lan"],
      why: "the weekly call's template and its sample week, the model of its frame that pages a long scene (call-fit), the Rust Rounds essay's and the model of what its frame holds (essay-fit), both setting text as frame-text does, the phone's photographed cards the essay zooms into (screen), and the interview essay's, each with its sample essay, a cards essay's spoken card with its sample (spoken-card), with the opening's limits and word count, which the Rust Rounds essay and the spoken card both read (opening) and what each says over a take home couldn't make out (verdict), and the engagement report's writer, template and sample report, which only their stages draw (src/lib/web-surface/call), and whether a format's shape draws captions (`hasCaptions`), which only Playoff Delta's stage reads (src/lib/web-surface/playoff-delta): desktop pages the Android app's build leaves out",
    },
    {
      modules: [
        "apps/www/src/lib/clipboard/**",
        "apps/www/src/components/copy-button.tsx",
      ],
      profiles: ["lan", MOBILE_PROFILE],
      why: "copying text: the phone's paste kits, its failure log and Rust Rounds' Copy for a tutor, and the home network's Asks page, whose receipt is copied for a session (C1096). The public site copies nothing",
    },
    {
      // Not viewer-storage.ts: main.tsx imports it first in every build that
      // runs the app, lan and the Android app included, where it leaves the
      // browser's storage as it is (CLAUDE.md, "A viewer tries, and nothing
      // is kept").
      modules: [
        "apps/www/src/lib/demo/index.ts",
        "apps/www/src/lib/demo/leetype-sample*",
        "apps/www/src/lib/demo/rust-rounds-sample.ts",
      ],
      profiles: [],
      why: "a viewer's sample drafts (CLAUDE.md, two mandates): only the capture build Snips photographs seeds them now, and no deployable ships them; the public site is a CV with no app to draft in (C1055, #3401), and the owner's builds keep to their own records",
    },
    {
      modules: ["apps/www/src/lib/web-surface/playoff-delta/**"],
      profiles: ["lan"],
      why: "the Playoff Delta stage's live season, a desktop recording stage for the vlog: only the web door (src/lib/web-surface) binds it, and not in the Android app's build or the public site's (C1055)",
    },
    {
      modules: ["apps/www/src/lib/web-surface/burn-ins/**"],
      profiles: ["lan", "pages"],
      why: "what every video carries, its preview, its recorder page and their font, desktop pages for tuning and recording what the renderer lays over a video, and the authorship record every published video's end card links, the one the public site serves (C1055): only the web door (src/lib/web-surface) binds it, and not in the Android app's build",
    },
    {
      modules: ["apps/www/src/lib/testing-data/**"],
      profiles: ["lan"],
      why: "reading what paulgsc/testing publishes for the desktop stages, Playoff Delta's season and the weekly call's weeks: only those stages read it, through the web door (src/lib/web-surface), and not in the Android app's build or the public site's (C1055)",
    },
    {
      modules: ["apps/www/src/lib/web-surface/call/**"],
      profiles: ["lan"],
      why: "the weekly call's stage and the Rust Rounds essay's, desktop recording stages for their videos: only the web door (src/lib/web-surface) binds it, and not in the Android app's build or the public site's (C1055)",
    },
    {
      modules: ["apps/www/src/lib/web-surface/hangul/**"],
      profiles: ["lan"],
      why: "Hangul Honeycomb's panel, a desktop keyboard game the phone has no counterpart for: only the web door (src/lib/web-surface) binds it, and not in the Android app's build or the public site's (C1055)",
    },
    {
      modules: ["apps/www/src/components/reflection/copy.ts"],
      profiles: [MOBILE_PROFILE],
      why: "the phone's hand-off wording (`arrived`, `goingOut`), after a share only the Android app makes; the web's reflection screens count with `@some-ui/core-utils`",
    },
    {
      modules: [
        "apps/www/src/lib/journey/**",
        "apps/www/src/components/journey-status.tsx",
      ],
      profiles: [MOBILE_PROFILE],
      why: "where a file the phone sent is now, and the title bar that wears it (J0): only the Android app's Jobs cards send files to say it of (src/components/jobs)",
    },
    {
      modules: [
        "apps/www/src/lib/status-board/**",
        "apps/www/src/lib/sharing-marks/**",
        "apps/www/src/lib/failure-log/**",
        "apps/www/src/components/sharing-marks.tsx",
        "apps/www/src/components/settings/status-board.tsx",
        "apps/www/src/components/settings/failure-log.tsx",
      ],
      profiles: [MOBILE_PROFILE],
      why: "the status page (#2165) and the sharing marks it draws: what this phone keeps and sends, which only the Android app does (src/routes/_dashboard/_apk/settings/status.tsx, src/components/device-home-glyph.tsx)",
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
      profile: "pages",
      within: "apps/www/src/**",
      allow: PAGES_MODULES,
      why: "off the public site's path: it is a CV (C1055, #3401), static pages, the authorship record's one script and the landing's enhancement (C1422), with no app",
    },
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
        "apps/www/src/lib/native-log/index.ts",
      ],
      why: "the Android app answers file_host, speaks, nudges and logs its failures through these; a build without one is an APK that installs and then fails, or fails and says nothing",
    },
    {
      profile: "pages",
      modules: [
        "apps/www/src/landing/authorship.tsx",
        "apps/www/src/lib/web-surface/burn-ins/authorship.tsx",
      ],
      why: "the record every published video's end card links to (C1055, #3401): without these its page draws nothing",
    },
    {
      profile: "pages",
      modules: ["apps/www/src/landing/enhance.ts"],
      why: "the landing's show on a phone turns by a swipe and its media reveal over their previews through this (C1422): without it the page still reads whole, as a flat list, but the deck the owner asked for is gone",
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
      modules: [`${SPEECH_ENTRY}/web-speech.es.js`],
      why: "the home server speaks through this (src/providers/tts.tsx); a build without it is silent",
    },
    {
      profile: "lan",
      modules: ["apps/www/src/lib/web-surface/playoff-delta/stage.tsx"],
      why: "the stage records the real season through this; without it /playoff-delta renders nothing. Also what keeps its `exclusive` rule from passing by matching nothing",
    },
    {
      profile: "lan",
      modules: ["apps/www/src/lib/web-surface/burn-ins/preview.tsx"],
      why: "the burn-ins preview renders through this; without it /burn-ins renders nothing. Also what keeps its `exclusive` rule from passing by matching nothing",
    },
    {
      profile: "lan",
      modules: ["apps/www/src/lib/web-surface/call/stage.tsx"],
      why: "the weekly call's stage renders through this; without it /call renders nothing. Also what keeps its `exclusive` rule from passing by matching nothing",
    },
    {
      profile: "lan",
      modules: ["apps/www/src/lib/web-surface/call/essay-stage.tsx"],
      why: "the Rust Rounds essay's stage renders through this; without it /essay renders nothing",
    },
    {
      profile: "lan",
      modules: ["apps/www/src/lib/web-surface/call/rust-screen-stage.tsx"],
      why: "the Rust Rounds card's stage, photographed for the essay (RR31), renders through this; without it /rust-screen renders nothing",
    },
    {
      profile: "lan",
      modules: ["apps/www/src/lib/web-surface/call/report-stage.tsx"],
      why: "the engagement report's stage renders through this; without it /report renders nothing",
    },
    {
      profile: "lan",
      modules: ["apps/www/src/lib/web-surface/hangul/panel.tsx"],
      why: "the web builds play Hangul Honeycomb through this; without it the activity is offered and renders nothing. Also what keeps its `exclusive` rule from passing by matching nothing",
    },
    {
      profile: "lan",
      modules: ["apps/www/src/lib/passkey/index.ts"],
      why: "a passkey is the only way into an account on the home server (src/lib/auth/session.ts)",
    },
  ],
  // lan and the Android app build one shared route tree (AUDIENCES.md, "Build
  // audiences"): a route off one's path ships there as a stub in the startup
  // chunk plus its page chunk, which the profile redirects or 404s away from
  // before it renders. Paid off by giving each deployable a route tree of its
  // own routes; each entry goes with the change that drops it.
  debt: [
    {
      profile: "lan",
      module: "apps/www/src/routes/_dashboard/_apk**",
      why: SHARED_ROUTE_TREE,
    },
    ...(["lan"] as const).flatMap(
      (profile): Array<Debt> =>
        [
          "packages/voice-capture/dist/@some-ui/voice-capture.es.js",
          "packages/voice-capture/dist/take-pattern-*.js",
        ].map((module) => ({ profile, module, why: TAKE_PATTERN_ON_THE_WEB }))
    ),

    ...[
      "_dashboard/_lan**",
      "index.tsx*",
      "mission.tsx*",
      "assurance.tsx*",
      "extensions.tsx*",
      "playoff-delta.tsx*",
      "burn-ins.tsx*",
      "call.tsx*",
      "essay.tsx*",
      "rust-screen.tsx*",
      "report.tsx*",
      "captions.tsx*",
      "authorship.tsx*",
      "_dashboard/app.tsx*",
      "_dashboard/profile.tsx*",
      "_dashboard/resume.tsx*",
      "_dashboard/job-run.tsx*",
      "_dashboard/rust-rounds-sample.tsx*",
    ].map(
      (route): Debt => ({
        profile: MOBILE_PROFILE,
        module: `apps/www/src/routes/${route}`,
        why: SHARED_ROUTE_TREE,
      })
    ),
  ],
})
