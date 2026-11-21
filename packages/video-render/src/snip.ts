/**
 * The snip library's records, and how an essay's screens of the app are
 * drawn (SNIPS4, epic #3114; `docs/snips.md` is the bundle's contract;
 * calls C865, C866).
 *
 * A snip, a Clips Library frame (`./clip`, whose sides call their frames
 * snips too) and a `some-ui.screens/1` screen (`./screen`, RR31) are one
 * family: a picture of a screen of the app, with any parts it names boxed.
 * A snip adds where it was taken (surface, build, route, app version) and
 * the hashes home checks its files by. So each is drawn as a screen is: a
 * scene's `{kind: "screen", of}` picture is drawn by the screen-zoom
 * composition the Rust essay's cards use (`./zoom`): the whole screen held
 * above the captions, or, for a snip given parts, zoomed to them in turn,
 * over the snip read as a screen (`snipScreen`). The renderer gains nothing.
 *
 * - The capture writes snip records (`apps/www/src/lib/snips`).
 * - Home fetches the bundle an essay names (SNIPS2) and keeps clip frames
 *   (CL1). Beside an essay that
 *   names some it hands them as it hands takes, each kind in its own
 *   folder: `<key>.snips/` with `snips.json` (`some-ui.snips-given/1`) and
 *   the pictures under their bundle names, and `<key>.clips/` with each
 *   frame at `<clip>/<side>/<file>`.
 * - `resolveScreens` turns the essay's screen scenes into the pictures the
 *   renderer draws, and refuses one home did not hand: never a blank frame.
 */

import { z } from "zod"

import type { Composition, CutList, Parsed, Picture } from "./cut-list"
import { problemsOf } from "./cut-list"
import type { Screen } from "./screen"
import { parseScreens, RegionSchema, SCREENS_SCHEMA } from "./screen"
import { SNIP_ID } from "./snip-id"
import type { ZoomOptions } from "./zoom"
import { wholePicture, zoomPicture } from "./zoom"

export { isSnipId, SNIP_ID } from "./snip-id"

/** What home hands beside an essay that names snips. */
export const SNIPS_GIVEN_SCHEMA = "some-ui.snips-given/1"

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, "a SHA-256 in hex")

/** One file of a snip, relative to the bundle's root (or the folder home hands). */
export const SnipFileSchema = z.object({
  name: z
    .string()
    .regex(
      /^(apk|web)\/[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._~-]*\.(png|webm|mp4)$/,
      "a file under <surface>/<viewport>/"
    ),
  kind: z.enum(["png", "webm", "mp4"]),
  bytes: z.number().int().positive(),
  sha256,
})
export type SnipFile = z.infer<typeof SnipFileSchema>

export const SurfaceSchema = z.enum(["apk", "web"])
export type Surface = z.infer<typeof SurfaceSchema>

/**
 * Which build drew it: the release build is the app as it ships (the APK
 * the phone gets, the Pages site); the debug APK is the same JavaScript in
 * a WebView Playwright can open, for a screen the release build's own taps
 * do not reach.
 */
const buildSchema = z.enum(["release", "debug"])
export type Build = z.infer<typeof buildSchema>

/** One snip's record: everything the routine and the desk may know of it. */
export const SnipRecordSchema = z
  .object({
    id: z.string().regex(SNIP_ID, "it isn't a snip's id"),
    surface: SurfaceSchema,
    build: buildSchema,
    /**
     * The route's address, `$param`s and all, or, for a release screen no
     * debug picture matched, where the taps reached it (`@studio/takes`).
     */
    route: z.string(),
    /** The address captured, its params filled. */
    path: z.string(),
    viewport: z.string(),
    /** The picture's own size in pixels, read from the PNG. */
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /**
     * Its pixels per CSS pixel: 2 for the web phone, 1 on the desktop. An
     * APK picture is the device's own screenshot, 1 by convention: its
     * pixels are the device's, and it names no parts.
     */
    scale: z.number().int().min(1).max(4),
    /**
     * Each part the screen names (`data-region`) and its box in CSS pixels,
     * from the picture's top-left. None on the APK, whose pictures are the
     * device's screen, where no page's layout can be read.
     */
    regions: z.array(RegionSchema),
    appVersion: z.string(),
    module: z.string(),
    /** What the screen says it is: its heading, or else its module. */
    shows: z.string(),
    description: z.string(),
    image: SnipFileSchema,
    /** A short recording, where the screen moved while it was looked at. */
    recording: SnipFileSchema.optional(),
  })
  .superRefine((snip, ctx) => {
    if (snip.image.kind !== "png")
      ctx.addIssue({
        code: "custom",
        path: ["image", "kind"],
        message: "a snip's picture is a PNG",
      })
    const hash = SNIP_ID.exec(snip.id)?.[5]
    if (hash !== undefined && !snip.image.sha256.startsWith(hash))
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: `${snip.id} is not the picture ${snip.image.name}`,
      })
  })
export type SnipRecord = z.infer<typeof SnipRecordSchema>

const commit = z.string().regex(/^[0-9a-f]{40}$/, "a commit's 40 hex digits")

/**
 * What home handed: for each bundle it fetched, its commit and the records
 * of the snips the essay names from it (C868). An essay may show the app at
 * two commits, a before and an after, so there may be several.
 */
const GivenSchema = z
  .strictObject({
    schema: z.literal(SNIPS_GIVEN_SCHEMA),
    bundles: z.array(
      z.strictObject({ commit, snips: z.array(SnipRecordSchema) })
    ),
  })
  .superRefine((given, ctx) => {
    const seen = new Set<string>()
    given.bundles.forEach((bundle, i) => {
      if (seen.has(bundle.commit))
        ctx.addIssue({
          code: "custom",
          path: ["bundles", i, "commit"],
          message: `the bundle of ${bundle.commit} is given twice`,
        })
      seen.add(bundle.commit)
      const ids = bundle.snips.map((snip) => snip.id)
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: ["bundles", i, "snips"],
          message: "a snip is given twice",
        })
    })
  })
export type SnipsGiven = z.infer<typeof GivenSchema>

/** `value` read as the snips home handed beside an essay, or each problem with it. */
export function parseSnipsGiven(value: unknown): Parsed<SnipsGiven> {
  const parsed = GivenSchema.safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "snips") }
}

/**
 * A snip read as a screen of `some-ui.screens/1`, named `id`: its picture
 * at `dir/<image>` in the video's folder, its size in CSS pixels, and its
 * parts renamed into `id`'s, as a screen's regions all start with its id.
 * The record keeps no window apart from its picture, so the screen's
 * viewport is the picture: a stage's whole page, or the window it showed.
 */
export function snipScreen(snip: SnipRecord, id: string): Screen {
  const width = snip.width / snip.scale
  const height = snip.height / snip.scale
  return {
    id,
    file: snip.image.name,
    width,
    height,
    scale: snip.scale,
    viewport: { width, height },
    regions: snip.regions.map(({ ref, box }) => ({
      ref: `${id}:${ref}`,
      box,
    })),
  }
}

type ScreenPicture = Extract<Picture, { kind: "screen" }>
type SnipOf = Extract<ScreenPicture["of"], { from: "snips" }>
type ClipOf = Extract<ScreenPicture["of"], { from: "clips" }>

const screensOf = (cut: CutList): Array<ScreenPicture["of"]> =>
  cut.shots.flatMap(({ picture }) =>
    picture.kind === "screen" ? [picture.of] : []
  )

/** A snip as an essay names it: the commit its bundle was captured at, and its id. */
export type SnipRef = { readonly commit: string; readonly id: string }

const refKey = ({ commit, id }: SnipRef): string => `${commit} ${id}`

/**
 * Every snip a cut list's scenes name, each once, in the order first
 * named: what home fetches, `snips-bundle-<commit>` for each commit.
 */
export function snipsOf(cut: CutList): Array<SnipRef> {
  const named = new Map<string, SnipRef>()
  for (const of of screensOf(cut))
    if (of.from === "snips" && !named.has(refKey(of)))
      named.set(refKey(of), { commit: of.commit, id: of.id })
  return [...named.values()]
}

/** A Clips Library frame's place in the folder home hands: `<clip>/<side>/<file>`. */
export const clipFramePath = (of: Omit<ClipOf, "from">): string =>
  `${of.clip}/${of.side}/${of.file}`

/** Every Clips Library frame a cut list's scenes name, each once, as `clipFramePath`s. */
export function clipFramesOf(cut: CutList): Array<string> {
  return [
    ...new Set(
      screensOf(cut).flatMap((of) =>
        of.from === "clips" ? [clipFramePath(of)] : []
      )
    ),
  ]
}

/** A picture's own size in pixels, as its PNG says. */
export type PictureSize = { readonly width: number; readonly height: number }

/**
 * What home handed beside an essay, each in its own folder as its takes
 * are (`<key>.snips/`, `<key>.clips/`): the snips' records, and the clip
 * frames it holds, by `clipFramePath`, with each frame's size. Null where
 * it handed none.
 */
export type Handed = {
  readonly snips: SnipsGiven | null
  readonly clips: ReadonlyMap<string, PictureSize> | null
}

/**
 * The cut list with each screen scene drawn from what home handed, the
 * snips' pictures under `snips/` and the clip frames under `clips/` in the
 * video's folder, by the screen-zoom composition in `look` (`./zoom`): a scene with no parts named holds the whole screen above the
 * frame's foot, where the captions draw (`wholePicture`); a snip given parts
 * zooms to them in turn. Refused, with each reason, when a scene names a
 * screen home did not hand, a snip from another commit than home's bundle,
 * or a part its snip doesn't name.
 */
export function resolveScreens(
  cut: CutList,
  handed: Handed,
  look: Omit<ZoomOptions, "dir"> = {}
): Parsed<CutList> {
  const given = new Map(
    (handed.snips?.bundles ?? []).flatMap((bundle) =>
      bundle.snips.map(
        (snip) =>
          [refKey({ commit: bundle.commit, id: snip.id }), snip] as const
      )
    )
  )
  const commitsOf = new Map<string, Array<string>>()
  for (const bundle of handed.snips?.bundles ?? [])
    for (const snip of bundle.snips)
      commitsOf.set(snip.id, [...(commitsOf.get(snip.id) ?? []), bundle.commit])
  // Each snip a scene names is a screen, `snip-<n>` in the order named; each
  // clip frame, `clip-<n>`.
  const snipIds = new Map(
    snipsOf(cut).map((ref, n) => [refKey(ref), `snip-${String(n + 1)}`])
  )
  const clipIds = new Map(
    clipFramesOf(cut).map((frame, n) => [frame, `clip-${String(n + 1)}`])
  )
  const record = parseScreens({
    schema: SCREENS_SCHEMA,
    screens: [
      ...[...snipIds].flatMap(([key, id]) => {
        const snip = given.get(key)
        return snip ? [snipScreen(snip, id)] : []
      }),
      ...[...clipIds].flatMap(([frame, id]) => {
        const size = handed.clips?.get(frame)
        return size ? [frameScreen(frame, size, id)] : []
      }),
    ],
  })
  if (!record.ok) return record
  const screens = record.value
  const screenOf = (id: string | undefined): Screen | undefined =>
    screens.screens.find((each) => each.id === id)
  const problems: Array<string> = []
  const fromSnips = (shotId: string, of: SnipOf): Picture | null => {
    const screen = screenOf(snipIds.get(refKey(of)))
    if (screen === undefined) {
      const elsewhere = commitsOf.get(of.id)
      problems.push(
        elsewhere === undefined
          ? `${shotId}: it shows the snip ${of.id}, which home did not hand: it has gone from the library, or the essay names one it never held`
          : `${shotId}: it shows the snip ${of.id} of ${of.commit}, and home handed it from ${elsewhere.join(", ")}`
      )
      return null
    }
    if (of.at.length === 0)
      return wholePicture(screen, { dir: SNIPS_DIR, ...look })
    const named = new Set(screen.regions.map((r) => r.ref))
    const missing = of.at.filter((part) => !named.has(`${screen.id}:${part}`))
    if (missing.length > 0) {
      problems.push(
        `${shotId}: the snip ${of.id} names no ${missing.join(", ")}`
      )
      return null
    }
    const zoom: Composition | null = zoomPicture(
      screens,
      of.at.map((part) => `${screen.id}:${part}`),
      { dir: SNIPS_DIR, ...look }
    )
    if (zoom === null)
      problems.push(`${shotId}: the snip ${of.id} has no part to zoom to`)
    return zoom
  }
  const fromClips = (shotId: string, of: ClipOf): Picture | null => {
    const frame = clipFramePath(of)
    const screen = screenOf(clipIds.get(frame))
    if (screen === undefined) {
      problems.push(
        `${shotId}: it shows the clip frame ${frame}, which home did not hand`
      )
      return null
    }
    return wholePicture(screen, { dir: CLIPS_DIR, ...look })
  }
  const shots = cut.shots.map((shot) => {
    const { picture } = shot
    if (picture.kind !== "screen") return shot
    const drawn =
      picture.of.from === "snips"
        ? fromSnips(shot.id, picture.of)
        : fromClips(shot.id, picture.of)
    return drawn === null ? shot : { ...shot, picture: drawn }
  })
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: { ...cut, shots } }
}

/**
 * A Clips Library frame read as a screen, named `id`: a picture of the app
 * with no parts named, drawn one pixel to a CSS pixel, as its index keeps
 * no scale.
 */
function frameScreen(frame: string, size: PictureSize, id: string): Screen {
  return {
    id,
    file: frame,
    width: size.width,
    height: size.height,
    scale: 1,
    viewport: { ...size },
    regions: [],
  }
}

/** Where the handed snips' pictures sit in the video's folder. */
export const SNIPS_DIR = "snips"

/** Where the handed clip frames sit in the video's folder. */
export const CLIPS_DIR = "clips"
