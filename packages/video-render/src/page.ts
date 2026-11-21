/**
 * Public pages, photographed logged out, as a screen an essay can show
 * (#3387): a pull request's checks, a run's job graph, a page of GitHub's
 * docs. They are the third member of the screens family (`./snip`), beside
 * a snip of the app and a Clips Library frame: a picture of a screen with
 * any parts it names boxed, drawn by the screen-zoom composition. The
 * renderer gains nothing.
 *
 * - The capture (`apps/www/tests/pages/capture.ts`) opens each address in a
 *   browser with no sign-in, at one fixed size, and writes `pages.json`
 *   (`some-ui.pages/1`) beside the pictures: each page's address, the
 *   moment it was taken, its size and the parts it was asked to box.
 * - Home hands the folder beside the essay that names its pages, as
 *   `<key>.pages/`, as it hands snips.
 * - A scene names a page by its address, its capture time and its file.
 *   The capture time is the "as of" a viewer is told: a page on GitHub
 *   moves on, and the picture keeps the moment it showed.
 *
 * Only what anyone can open logged out is taken: no session, cookie or
 * token is in the browser, so no picture can hold the owner's data.
 */

import { z } from "zod"

import type { CutList, Parsed, Picture } from "./cut-list"
import { problemsOf } from "./cut-list"
import type { Screen } from "./screen"
import { BoxSchema } from "./screen"
import { PAGE_FILE } from "./snip-id"

export const PAGES_SCHEMA = "some-ui.pages/1"

/** The one size a page is taken at: a desktop window, at twice its pixels. */
export const PAGE_VIEWPORT = { width: 1440, height: 900, scale: 2 } as const

/** A part's name, as an essay's `at` gives it: a slug. */
const PART = /^[a-z0-9][a-z0-9-]{0,63}$/

const PageRecordSchema = z
  .strictObject({
    /** The address taken, as typed: public, https. */
    url: z.string().regex(/^https:\/\/\S+$/, "a public https address"),
    /** When it was taken: what the page showed then, and maybe not now. */
    capturedAt: z.iso.datetime(),
    /** The page's own title, as the browser read it. */
    title: z.string(),
    /** The picture's own size in pixels, read from the PNG. */
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** Its pixels per CSS pixel. */
    scale: z.number().int().min(1).max(4),
    /** Each part the capture was asked to box, in CSS pixels from the top-left. */
    regions: z.array(
      z.strictObject({ name: z.string().regex(PART), box: BoxSchema })
    ),
    image: z.strictObject({
      name: z
        .string()
        .regex(PAGE_FILE, "a page's picture, <slug>-<hash12>.png"),
      bytes: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/, "a SHA-256 in hex"),
    }),
  })
  .superRefine((page, ctx) => {
    const hash = /-([0-9a-f]{12})\.png$/.exec(page.image.name)?.[1]
    if (hash !== undefined && !page.image.sha256.startsWith(hash))
      ctx.addIssue({
        code: "custom",
        path: ["image", "name"],
        message: `${page.image.name} is not the picture its hash names`,
      })
    const names = page.regions.map((r) => r.name)
    if (new Set(names).size !== names.length)
      ctx.addIssue({
        code: "custom",
        path: ["regions"],
        message: "a part is named twice",
      })
  })
export type PageRecord = z.infer<typeof PageRecordSchema>

const PagesSchema = z
  .strictObject({
    schema: z.literal(PAGES_SCHEMA),
    pages: z.array(PageRecordSchema),
  })
  .superRefine((given, ctx) => {
    const files = given.pages.map((p) => p.image.name)
    if (new Set(files).size !== files.length)
      ctx.addIssue({
        code: "custom",
        path: ["pages"],
        message: "a picture is given twice",
      })
  })
export type Pages = z.infer<typeof PagesSchema>

/** `value` read as a pages capture's record, or each problem with it. */
export function parsePages(value: unknown): Parsed<Pages> {
  const parsed = PagesSchema.safeParse(value)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "pages") }
}

/**
 * A page's picture's name: its host and path as a slug, then the first 12
 * hex digits of the picture's SHA-256.
 */
export function pageFile(url: string, sha256: string): string {
  const { host, pathname, search } = new URL(url)
  const slug = `${host}${pathname}${search}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
    .replace(/-+$/, "")
  return `${slug}-${sha256.slice(0, 12)}.png`
}

type ScreenPicture = Extract<Picture, { kind: "screen" }>
export type PageOf = Extract<ScreenPicture["of"], { from: "pages" }>

/** Every page a cut list's scenes name, each once, by its file, in the order first named. */
export function pagesOf(cut: CutList): Array<PageOf> {
  const named = new Map<string, PageOf>()
  for (const { picture } of cut.shots)
    if (picture.kind === "screen" && picture.of.from === "pages")
      if (!named.has(picture.of.file)) named.set(picture.of.file, picture.of)
  return [...named.values()]
}

/** A page read as a screen named `id`: its parts renamed into `id`'s. */
export function pageScreen(page: PageRecord, id: string): Screen {
  const width = page.width / page.scale
  const height = page.height / page.scale
  return {
    id,
    file: page.image.name,
    width,
    height,
    scale: page.scale,
    viewport: { width, height },
    regions: page.regions.map(({ name, box }) => ({
      ref: `${id}:${name}`,
      box,
    })),
  }
}

/** Where the handed pages' pictures sit in the video's folder. */
export const PAGES_DIR = "pages"
