/**
 * The snip library's model (SNIPS1, epic #3114; `docs/snips.md` is the
 * contract): which screens a capture visits, what each snip is called, and
 * the bundle it hands to home. Pure, so the capture specs
 * (`tests/snips/*.spec.ts`) and the bundle script (`scripts/snips-bundle.ts`)
 * agree on every name, and a unit test holds them.
 *
 * A snip's record is `@some-ui/video-render`'s (`snip.ts`), which reads one
 * as a photographed screen for an essay (SNIPS4). Nothing in the app
 * imports this: it describes the app from outside, and only on sample data (the Pages viewer build, or the APK paired with the
 * stand-in home).
 */
import { SnipRecordSchema, SurfaceSchema } from "@some-ui/video-render/snip"
import type {
  Build,
  SnipFile,
  SnipRecord,
  Surface,
} from "@some-ui/video-render/snip"
import { z } from "zod"

export type { Build, SnipFile, SnipRecord, Surface }

/** The audience a route's layout gates it to (`routes/_dashboard/_apk.tsx`, `_lan.tsx`). */
type RouteAudience = "public" | "apk" | "lan"

export type RouteEntry = {
  /** The router's id, layouts included: `/_dashboard/_apk/journal/`. */
  readonly id: string
  /** The address a person opens, its `$param`s unfilled: /settings/appearance. */
  readonly path: string
  readonly audience: RouteAudience
}

/** The clock every capture is frozen at: a weekday morning, for screens that greet. */
export const FROZEN_AT = "2026-11-02T09:30:00.000Z"

/** The schema the manifest carries; home refuses another (`docs/snips.md`). */
const MANIFEST_SCHEMA = "some-ui.snips/1"

/** At most this many concrete addresses for one `$param` route. */
export const PER_PATTERN = 3

export type Viewport = {
  /** In the snip id: short and stable. */
  readonly name: string
  readonly width: number
  readonly height: number
  readonly scale: number
  /** In the description: plain words. */
  readonly words: string
}

/** The web surface's sizes: the Pages build on a desktop and on a phone. */
export const WEB_VIEWPORTS: ReadonlyArray<Viewport> = [
  {
    name: "desktop",
    width: 1440,
    height: 900,
    scale: 1,
    words: "a desktop browser",
  },
  {
    name: "phone",
    width: 412,
    height: 915,
    scale: 2,
    words: "a phone browser",
  },
]

/**
 * The emulator's screen, as `capture-apk.sh` sets it (`wm size`, `wm
 * density 420`). Each record carries the size read from its picture, and
 * the bundle refuses an APK picture of another (`manifestOf`).
 */
export const APK_VIEWPORT: Viewport = {
  name: "android",
  width: 1080,
  height: 1920,
  scale: 1,
  words: "the Android app",
}

/**
 * Every route in the generated tree (`src/routeTree.gen.ts`), read from its
 * `FileRoutesById` interface: one entry per address, layouts folded into
 * the page they wrap.
 */
export function parseRouteTree(text: string): ReadonlyArray<RouteEntry> {
  const block = /export interface FileRoutesById \{([\s\S]*?)\n\}/.exec(text)
  if (!block?.[1]) throw new Error("no FileRoutesById in the route tree")
  const ids = [...block[1].matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1])
  const byPath = new Map<string, RouteEntry>()
  for (const id of ids) {
    if (id === "__root__") continue
    const entry = { id, path: pathOf(id), audience: audienceOf(id) }
    // The page, not its layout: an index id ends in `/`, the layout's not.
    const seen = byPath.get(entry.path)
    if (!seen || id.endsWith("/")) byPath.set(entry.path, entry)
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

/** A route id's address: pathless `_layout` segments and an index's `/` dropped. */
export function pathOf(id: string): string {
  const segments = id.split("/").filter((s) => s !== "" && !s.startsWith("_"))
  return `/${segments.join("/")}`
}

function audienceOf(id: string): RouteAudience {
  if (id.includes("/_apk")) return "apk"
  if (id.includes("/_lan")) return "lan"
  return "public"
}

/**
 * The routes a surface's build offers. The Pages build carries `public`
 * and `web` (no layout gates `web`); the APK `public` and `apk`. `lan` is
 * home's own build, behind the passkey, and holds the owner's data: never
 * captured.
 */
export function routesFor(
  surface: Surface,
  routes: ReadonlyArray<RouteEntry>
): ReadonlyArray<RouteEntry> {
  return routes.filter(
    (r) =>
      r.audience === "public" || (surface === "apk" && r.audience === "apk")
  )
}

/**
 * The recording stages (`validateSearch: stageSearch`): pages drawn whole
 * for a recorder, as `tests/record` photographs them, not screens a person
 * scrolls. A snip of one is the whole page, so its named parts
 * (`data-region`) are all in it: a card's foot falls below a phone's fold.
 * The test holds this list to the route files.
 */
export const STAGE_ROUTES: ReadonlySet<string> = new Set([
  "/call",
  "/essay",
  "/report",
  "/rust-screen",
])

/** Whether a snip of `path` is the whole page: a recording stage's. */
export const isStage = (path: string): boolean => STAGE_ROUTES.has(path)

/** Whether an address has a `$param` to fill from the screens. */
export function isPattern(path: string): boolean {
  return path.split("/").some((s) => s.startsWith("$"))
}

/**
 * The concrete addresses for a `$param` route among the links found on the
 * screens captured so far, sorted and capped at `PER_PATTERN`, so the same
 * sample data picks the same pages.
 */
export function fillPattern(
  pattern: string,
  links: Iterable<string>
): ReadonlyArray<string> {
  const source = pattern
    .split("/")
    .map((s) => (s.startsWith("$") ? "[^/]+" : escapeRegExp(s)))
    .join("/")
  const matcher = new RegExp(`^${source}$`)
  const found = new Set<string>()
  for (const link of links) {
    const path = link.replace(/\/$/, "") || "/"
    if (matcher.test(path)) found.add(path)
  }
  return [...found].sort().slice(0, PER_PATTERN)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** What the owner calls each part of the app, by an address's first segment. */
const MODULES: Readonly<Record<string, string>> = {
  "": "Front page",
  app: "Dashboard",
  aph: "APH",
  assurance: "Assurance",
  auth: "Sign-in",
  authorship: "Authorship",
  "burn-ins": "Burn-ins",
  call: "Weekly call",
  captions: "Captions",
  essay: "Essays",
  extensions: "Extensions",
  foyer: "Foyer",
  "game-week": "Game week",
  "job-run": "Jobs",
  jobs: "Jobs",
  journal: "Studio",
  mission: "Mission",
  "playoff-delta": "Playoff Delta",
  practice: "Practice",
  profile: "Profile",
  report: "Report",
  resume: "Résumé",
  "rust-rounds": "Rust Rounds",
  "rust-rounds-sample": "Rust Rounds",
  sessions: "Sessions",
  settings: "Settings",
  soundbites: "Soundbites",
}

/** The module a snip belongs to, for grouping on the editorial desk. */
export function moduleOf(path: string): string {
  if (path.startsWith("@")) {
    // A wing reached by its icon (`wingPath`): the wing is the module.
    const wing = path.slice(1).split("/")[0] ?? ""
    return wing === "app"
      ? "Foyer"
      : wing.charAt(0).toUpperCase() + wing.slice(1)
  }
  const first = path.split("/")[1] ?? ""
  return MODULES[first] ?? first
}

/**
 * A snip's id: surface, address, viewport, app version, and the first 12
 * hex digits of the image's SHA-256. A screen that changes is a new id; the
 * same screen captured again is the same id, which is what lets home file a
 * re-delivered bundle at no cost.
 */
export function snipId(parts: {
  readonly surface: Surface
  readonly path: string
  readonly viewport: string
  readonly appVersion: string
  readonly sha256: string
}): string {
  const hash = parts.sha256.slice(0, 12)
  return `${parts.surface}:${parts.path}:${parts.viewport}:${parts.appVersion}:${hash}`
}

/**
 * Where the release APK's own navigation reached a screen, for one no
 * debug picture names by route: a launcher icon's wing, then the bar's tab
 * tapped there. `@practice`, `@studio/takes`.
 */
export function wingPath(wing: string, tab?: string): string {
  const slug = (text: string): string => {
    const ascii = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    // A label with no ASCII letter or digit (Korean, say) is named by its
    // code points, so the id still names it.
    return ascii !== ""
      ? ascii
      : `u${[...text].map((c) => (c.codePointAt(0) ?? 0).toString(16)).join("-")}`
  }
  return tab === undefined ? `@${slug(wing)}` : `@${slug(wing)}/${slug(tab)}`
}

/** A labelled control near the bottom of the APK's screen, from its UI dump. */
export type BarNode = {
  readonly label: string
  /** Its centre, in the screen's pixels. */
  readonly x: number
  readonly y: number
  /** Its lower edge. */
  readonly bottom: number
  /** Whether the app marks it as the one chosen (`selected`). */
  readonly selected: boolean
}

/**
 * How far above the foot of what the app draws its bar may float, as a
 * share of the screen's height: the shell's pill keeps a margin of
 * max(0.75rem, the safe area's inset) below it (`mobile-shell`), about 31 px
 * on the 1080×1920 emulator, more where the system's navigation bar is drawn
 * over the app.
 */
export const BAR_FOOT_SHARE = 0.08

/**
 * The tabs of the bar along the bottom of a release APK screen, left to
 * right, each label once (#3137, option (b), the owner, 2026-11-21). It is
 * the lowest row of two or more labelled controls, if that row either has a
 * tab selected, or sits at the foot of what the app draws: nothing the app
 * can tap lies below it (`lowestClickable`), and it floats at most
 * `BAR_FOOT_SHARE` of the screen above the app's lowest edge (`appBottom`).
 * Studio's two tabs, about 500 px apart on a 1080 px screen, are a bar.
 * Two buttons mid-sheet, or with a control below them, are not. The
 * limit: on a screen with no bar, two labelled buttons that are the lowest
 * thing on it read as one. The walk's `ACTS` keeps out those that act.
 */
export function tabBar(
  nodes: ReadonlyArray<BarNode>,
  {
    appBottom,
    lowestClickable,
    screenHeight,
    rowPx,
  }: {
    readonly appBottom: number
    readonly lowestClickable: number
    readonly screenHeight: number
    readonly rowPx: number
  }
): ReadonlyArray<BarNode> {
  const rows: Array<Array<BarNode>> = []
  for (const node of [...nodes].sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs((r[0]?.y ?? 0) - node.y) <= rowPx)
    if (row) row.push(node)
    else rows.push([node])
  }
  const row = rows.find((r) => new Set(r.map((n) => n.label)).size >= 2)
  if (row === undefined) return []
  const foot = Math.max(...row.map((n) => n.bottom))
  const atFoot =
    foot >= lowestClickable - rowPx &&
    foot >= appBottom - screenHeight * BAR_FOOT_SHARE
  if (!atFoot && !row.some((n) => n.selected)) return []
  const unique = new Map(row.map((n) => [n.label, n]))
  return [...unique.values()].sort((a, b) => a.x - b.x)
}

/** A file name for an address: /settings/appearance -> settings~appearance. */
export function slugOf(path: string): string {
  if (path === "/") return "front"
  // A filled `$param` comes from a link's href, percent-encoded and all:
  // anything a file name may not hold becomes a `-`.
  // It leads with a letter or digit, as every file the bundle names does
  // (`SnipFileSchema`).
  const slug = path
    .replace(/^[/@]/, "")
    .replace(/\//g, "~")
    .replace(/[^A-Za-z0-9._~-]/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
  return slug === "" ? "page" : slug
}

/** A route a capture offered and could not show, with why, in plain words. */
export type Unreached = {
  readonly surface: Surface
  readonly route: string
  readonly why: string
}

const partSchema = z.object({
  surface: SurfaceSchema,
  appVersion: z.string(),
  snips: z.array(SnipRecordSchema),
  unreached: z.array(
    z.object({ surface: SurfaceSchema, route: z.string(), why: z.string() })
  ),
})

/** A part as a capture job wrote it; throws on anything else. */
export function parsePart(text: string): Part {
  return partSchema.parse(JSON.parse(text))
}

/** The app version a capture records: www's own (`apps/www/package.json`). */
export function appVersionOf(packageJson: string): string {
  return z.object({ version: z.string() }).parse(JSON.parse(packageJson))
    .version
}

/** A capture job's half of the bundle, written beside its files. */
export type Part = {
  readonly surface: Surface
  readonly appVersion: string
  readonly snips: ReadonlyArray<SnipRecord>
  readonly unreached: ReadonlyArray<Unreached>
}

export type Manifest = {
  readonly schema: typeof MANIFEST_SCHEMA
  readonly appVersion: string
  readonly commit: string
  readonly run: string
  readonly frozenAt: string
  /** Always "sample": the viewer build or the stand-in home; never the owner's. */
  readonly data: "sample"
  readonly snips: ReadonlyArray<SnipRecord>
  readonly unreached: ReadonlyArray<Unreached>
}

/** A one-line description in plain words. */
export function describe(
  module: string,
  shows: string,
  viewport: Viewport
): string {
  const what = shows && shows !== module ? `${module}: ${shows}` : module
  return `${what}, on ${viewport.words}, with sample data.`
}

/**
 * The bundle's manifest, from each job's part. Fails when the parts
 * disagree on the app version, or two snips share an id (the same screen
 * twice is one snip, and the capture dedupes before this).
 */
export function manifestOf(
  parts: ReadonlyArray<Part>,
  run: { readonly commit: string; readonly url: string }
): Manifest {
  const versions = new Set(parts.map((p) => p.appVersion))
  if (versions.size !== 1) {
    throw new Error(`the parts name ${versions.size} app versions`)
  }
  const snips = [...preferRelease(parts.flatMap((p) => p.snips))].sort((a, b) =>
    a.id.localeCompare(b.id)
  )
  const ids = new Set<string>()
  for (const snip of snips) {
    if (ids.has(snip.id)) throw new Error(`two snips are ${snip.id}`)
    ids.add(snip.id)
    // The emulator is set to APK_VIEWPORT's size (`capture-apk.sh`); a
    // picture of another is a capture that lost it, and soft when zoomed.
    if (
      snip.surface === "apk" &&
      (snip.width !== APK_VIEWPORT.width || snip.height !== APK_VIEWPORT.height)
    )
      throw new Error(
        `${snip.id} is ${String(snip.width)}x${String(snip.height)}, not the emulator's ${String(APK_VIEWPORT.width)}x${String(APK_VIEWPORT.height)}`
      )
  }
  return {
    schema: MANIFEST_SCHEMA,
    appVersion: [...versions][0] ?? "",
    commit: run.commit,
    run: run.url,
    frozenAt: FROZEN_AT,
    data: "sample",
    snips,
    unreached: uniqueUnreached(parts.flatMap((p) => p.unreached)),
  }
}

/**
 * One snip per picture, the release build's wherever it drew the same
 * screen: a debug snip whose image matches a release one names that
 * picture's route, and the release snip takes the name and keeps its own
 * files. Pixels match only where the two builds drew alike, so a release
 * screen no debug picture matches keeps its `wingPath`.
 */
function preferRelease(
  all: ReadonlyArray<SnipRecord>
): ReadonlyArray<SnipRecord> {
  const releaseBySha = new Map<string, SnipRecord>()
  for (const s of all) {
    if (s.build === "release" && s.surface === "apk") {
      releaseBySha.set(s.image.sha256, s)
    }
  }
  const named = new Map<SnipRecord, SnipRecord>()
  const out: Array<SnipRecord> = []
  for (const s of all) {
    if (s.build !== "debug") continue
    const release = releaseBySha.get(s.image.sha256)
    if (release && !named.has(release)) {
      // The debug record's names; the release snip's own files only, so
      // no file the release build did not draw rides on a release record.
      const { recording: _recording, ...fromDebug } = s
      named.set(release, {
        ...fromDebug,
        build: "release",
        image: release.image,
        ...(release.recording ? { recording: release.recording } : {}),
      })
    } else if (!release) out.push(s)
  }
  for (const s of all) {
    if (s.build === "debug") continue
    out.push(named.get(s) ?? s)
  }
  return out
}

/** One line per route and reason: each viewport finds the same gap. */
function uniqueUnreached(
  all: ReadonlyArray<Unreached>
): ReadonlyArray<Unreached> {
  const byKey = new Map<string, Unreached>()
  for (const u of all) byKey.set(`${u.surface} ${u.route} ${u.why}`, u)
  return [...byKey.values()].sort((a, b) =>
    `${a.surface} ${a.route}`.localeCompare(`${b.surface} ${b.route}`)
  )
}

/**
 * `SHA256SUMS`, as `sha256sum -c` reads it: one line per file, sorted by
 * name, two spaces between hash and name.
 */
export function checksumsOf(
  files: ReadonlyArray<{ readonly name: string; readonly sha256: string }>
): string {
  return [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => `${f.sha256}  ${f.name}\n`)
    .join("")
}
