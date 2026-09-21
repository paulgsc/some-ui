/**
 * The crawl's measuring instrument (BC1, #1434): given a document and the
 * catalogue, describe how the card tags sit on it.
 *
 * Deliberately self-contained. {@link fingerprintSurface} closes over
 * nothing — every input arrives as a parameter — so the crawler can hand it
 * to Playwright's `page.evaluate()`, which serializes the function's source
 * and runs it inside the page, and the unit suite can run the *same*
 * function over a jsdom-parsed fixture. One measuring instrument, two
 * harnesses; a determinism test that compares their outputs is only
 * meaningful because there is no second implementation to disagree.
 *
 * Pure with respect to the outside world: reads only the `root` it is given.
 */

import type { CardField, ShapeRole, SurfaceLayout, TagShape } from "./schema"
import type { BoyoSurface } from "./surface"

/** Everything the instrument needs, as plain data. */
export type FingerprintInput = {
  readonly surface: BoyoSurface | "*"
  readonly path: string
  /** Catalogue tags, lower-case, in catalogue order. */
  readonly tags: ReadonlyArray<string>
  /** `VIDEO_LINK_SELECTOR`. */
  readonly videoLink: string
  /** `FIELD_SELECTORS`, in the same order the extractors try them. */
  readonly fields: Readonly<Record<CardField, ReadonlyArray<string>>>
}

type Bucket = {
  tag: string
  role: ShapeRole
  outer: string | null
  count: number
  withVideoLink: number
  withDataVideoId: number
  fields: Record<CardField, Set<number>>
}

/**
 * Measure one document.
 *
 * For every element matching a catalogue tag: which catalogue tag (if any)
 * is its nearest enclosing card — that decides `anchor` versus `nested` and
 * is the exact fact #1426 turns on — whether it carries a video link and an
 * authoritative id, and which extraction selectors find something inside
 * it. Occurrences with the same (tag, role, outer) are folded into one
 * shape; the output is sorted so two crawls of the same page produce
 * byte-identical shapes.
 */
export function fingerprintSurface(
  root: ParentNode,
  input: FingerprintInput
): SurfaceLayout {
  const cardSelector = input.tags.join(",")
  // Spelled out rather than read off `input.fields`: the key set is fixed by
  // the type, and a literal list needs no assertion.
  const fieldNames: ReadonlyArray<CardField> = [
    "title",
    "channelName",
    "duration",
    "uploadDate",
  ]
  const buckets = new Map<string, Bucket>()

  for (const el of root.querySelectorAll(cardSelector)) {
    const tag = el.tagName.toLowerCase()
    // The nearest enclosing catalogue tag, if any. `closest()` from the
    // parent so an element never finds itself. This is the one structural
    // walk the whole architecture performs, and it happens here, offline —
    // the Sensor reads the answer back out of the table (B3).
    const enclosing = el.parentElement?.closest(cardSelector) ?? null
    const outer = enclosing === null ? null : enclosing.tagName.toLowerCase()
    const role: ShapeRole = outer === null ? "anchor" : "nested"
    const key = `${tag}|${role}|${outer ?? ""}`

    let bucket = buckets.get(key)
    if (bucket === undefined) {
      bucket = {
        tag,
        role,
        outer,
        count: 0,
        withVideoLink: 0,
        withDataVideoId: 0,
        fields: {
          title: new Set(),
          channelName: new Set(),
          duration: new Set(),
          uploadDate: new Set(),
        },
      }
      buckets.set(key, bucket)
    }

    bucket.count += 1
    if (el.querySelector(input.videoLink) !== null) bucket.withVideoLink += 1
    if (el.getAttribute("data-video-id")) bucket.withDataVideoId += 1
    for (const f of fieldNames) {
      const selectors = input.fields[f]
      for (let i = 0; i < selectors.length; i += 1) {
        const selector = selectors[i]
        if (selector === undefined) continue
        const node = el.querySelector(selector)
        if (node !== null && node.textContent.trim() !== "") {
          bucket.fields[f].add(i)
        }
      }
    }
  }

  // Inlined rather than shared with `mergeLayouts` below: this function is
  // serialized by `Function.prototype.toString` for `page.evaluate()`, so it
  // must not reference anything at module scope.
  const compare = (a: TagShape, b: TagShape): number => {
    if (a.tag !== b.tag) return a.tag < b.tag ? -1 : 1
    if (a.role !== b.role) return a.role < b.role ? -1 : 1
    const ao = a.outer ?? ""
    const bo = b.outer ?? ""
    if (ao !== bo) return ao < bo ? -1 : 1
    return 0
  }

  const sorted = (set: ReadonlySet<number>): Array<number> =>
    [...set].sort((x, y) => x - y)
  const shapes: Array<TagShape> = [...buckets.values()]
    .map((b) => ({
      tag: b.tag,
      role: b.role,
      outer: b.outer,
      count: b.count,
      withVideoLink: b.withVideoLink,
      withDataVideoId: b.withDataVideoId,
      fields: {
        title: sorted(b.fields.title),
        channelName: sorted(b.fields.channelName),
        duration: sorted(b.fields.duration),
        uploadDate: sorted(b.fields.uploadDate),
      },
    }))
    .sort(compare)

  return { surface: input.surface, paths: [input.path], shapes }
}

function compareShapes(a: TagShape, b: TagShape): number {
  if (a.tag !== b.tag) return a.tag < b.tag ? -1 : 1
  if (a.role !== b.role) return a.role < b.role ? -1 : 1
  const ao = a.outer ?? ""
  const bo = b.outer ?? ""
  if (ao !== bo) return ao < bo ? -1 : 1
  return 0
}

/**
 * Fold several layouts of the same surface (or of every surface, for `"*"`)
 * into one: counts add, matched selectors union, paths concatenate and
 * de-duplicate. Sorted like {@link fingerprintSurface}'s output.
 */
export function mergeLayouts(
  surface: BoyoSurface | "*",
  layouts: ReadonlyArray<SurfaceLayout>
): SurfaceLayout {
  const buckets = new Map<string, TagShape>()
  for (const layout of layouts) {
    for (const shape of layout.shapes) {
      const key = `${shape.tag}|${shape.role}|${shape.outer ?? ""}`
      const existing = buckets.get(key)
      if (existing === undefined) {
        buckets.set(key, shape)
        continue
      }
      const union = (f: CardField): Array<number> =>
        [...new Set([...existing.fields[f], ...shape.fields[f]])].sort(
          (x, y) => x - y
        )
      buckets.set(key, {
        ...existing,
        count: existing.count + shape.count,
        withVideoLink: existing.withVideoLink + shape.withVideoLink,
        withDataVideoId: existing.withDataVideoId + shape.withDataVideoId,
        fields: {
          title: union("title"),
          channelName: union("channelName"),
          duration: union("duration"),
          uploadDate: union("uploadDate"),
        },
      })
    }
  }
  const paths = [...new Set(layouts.flatMap((l) => l.paths))].sort()
  return {
    surface,
    paths,
    shapes: [...buckets.values()].sort(compareShapes),
  }
}
