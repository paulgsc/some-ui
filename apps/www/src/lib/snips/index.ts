/**
 * The snip library's model (SNIPS1, epic #3114; `docs/snips.md` is the
 * contract): which screens a capture visits, what each snip is called, and
 * the bundle it hands to home. Pure, so the capture specs
 * (`tests/snips/*.spec.ts`) and the bundle script (`scripts/snips-bundle.ts`)
 * agree on every name, and a unit test holds them.
 *
 * Nothing in the app imports this: it describes the app from outside, and
 * only on sample data (the Pages viewer build, or the APK paired with the
 * stand-in home).
 */
import { z } from "zod"

/** Where a snip was taken. */
export type Surface = "apk" | "web"

/** The audience a route's layout gates it to (`routes/_dashboard/_apk.tsx`, `_lan.tsx`). */
export type RouteAudience = "public" | "apk" | "lan"

export type RouteEntry = {
  /** The router's id, layouts included: `/_dashboard/_apk/journal/`. */
  readonly id: string
  /** The address a person opens: `/journal`, `/jobs/pick/$day/$pickId`. */
  readonly path: string
  readonly audience: RouteAudience
}

/** The clock every capture is frozen at: a weekday morning, for screens that greet. */
export const FROZEN_AT = "2026-11-02T09:30:00.000Z"

/** The schema the manifest carries; home refuses another (`docs/snips.md`). */
export const MANIFEST_SCHEMA = "some-ui.snips/1"

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

/** The emulator's screen, set with `wm size` and `wm density` before capture. */
export const APK_VIEWPORT: Viewport = {
  name: "android",
  width: 1080,
  height: 2400,
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

/** A file name for an address: `/journal/takes/kept` -> `journal~takes~kept`. */
export function slugOf(path: string): string {
  return path === "/" ? "front" : path.slice(1).replace(/\//g, "~")
}

/** One file of a snip, as the bundle carries it. */
export type SnipFile = {
  /** Relative to the bundle's root. */
  readonly name: string
  readonly kind: "png" | "webm" | "mp4"
  readonly bytes: number
  readonly sha256: string
}

/** One snip's record: everything the routine and the desk may know of it. */
export type SnipRecord = {
  readonly id: string
  readonly surface: Surface
  /** The route's address, `$param`s and all. */
  readonly route: string
  /** The address captured, its params filled. */
  readonly path: string
  readonly viewport: string
  readonly width: number
  readonly height: number
  readonly appVersion: string
  readonly module: string
  /** What the screen says it is: its heading, or else its module. */
  readonly shows: string
  readonly description: string
  readonly image: SnipFile
  /** A short recording, where the screen moved while it was looked at. */
  readonly recording?: SnipFile
}

/** A route a capture offered and could not show, with why, in plain words. */
export type Unreached = {
  readonly surface: Surface
  readonly route: string
  readonly why: string
}

const fileSchema = z.object({
  name: z.string(),
  kind: z.enum(["png", "webm", "mp4"]),
  bytes: z.number(),
  sha256: z.string(),
})
const surfaceSchema = z.enum(["apk", "web"])
const partSchema = z.object({
  surface: surfaceSchema,
  appVersion: z.string(),
  snips: z.array(
    z.object({
      id: z.string(),
      surface: surfaceSchema,
      route: z.string(),
      path: z.string(),
      viewport: z.string(),
      width: z.number(),
      height: z.number(),
      appVersion: z.string(),
      module: z.string(),
      shows: z.string(),
      description: z.string(),
      image: fileSchema,
      recording: fileSchema.optional(),
    })
  ),
  unreached: z.array(
    z.object({ surface: surfaceSchema, route: z.string(), why: z.string() })
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
  const snips = parts
    .flatMap((p) => p.snips)
    .sort((a, b) => a.id.localeCompare(b.id))
  const ids = new Set<string>()
  for (const snip of snips) {
    if (ids.has(snip.id)) throw new Error(`two snips are ${snip.id}`)
    ids.add(snip.id)
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
