/**
 * An episode's files beside its video, on its page (ASSETS-R, C1300): each
 * member of `@some-ui/video-render/assets`'s `EpisodeAsset` the page shows,
 * what home says of it, and what asking home to make one came to. Pure, so
 * every answer is held by a test; the page reads each with its own query and
 * asks with one send (`./index`).
 *
 * The page reads each file itself (`GET /feeds/:feed/videos/:key/<asset>`),
 * so a home from before this list still shows what it serves; the list's
 * `assets` (`./model`) says only what a file it lacks is doing: not made,
 * asked for, or tried and not made. The video is the page's own row, so it is
 * not among these.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"
import { isAloneAsset } from "@some-ui/video-render/assets"
import type { AloneAsset, EpisodeAsset } from "@some-ui/video-render/assets"
import { z } from "zod"

/** The files the page shows beside the video, in its order. */
export const SHOWN_ASSETS = ["thumbnail", "description"] as const

export type ShownAsset = (typeof SHOWN_ASSETS)[number]

/**
 * What home's list says of a file (`assets` on each episode): there; not
 * made; asked for and waiting its turn, or being made; or tried and not made
 * (a title no readable size fits, say), which asking again would not change.
 */
export const AssetStateSchema = z.enum([
  "present",
  "missing",
  "queued",
  "running",
  "failed",
])

export type AssetState = z.infer<typeof AssetStateSchema>

/** Each file's state, as far as home's list says: absent from an older home. */
export const AssetsSchema = z
  .object({
    video: AssetStateSchema,
    thumbnail: AssetStateSchema,
    description: AssetStateSchema,
  } satisfies Record<EpisodeAsset, typeof AssetStateSchema>)
  .partial()

export type Assets = z.infer<typeof AssetsSchema>

/** What each file's content is, once home sends it. */
export type AssetContent = {
  /** The PNG's bytes, as base64. */
  readonly thumbnail: { readonly base64: string }
  /** YouTube's chapter lines, ending in a newline. */
  readonly description: { readonly text: string }
}

/** What asking home for a file came to. */
export type AssetRead<A extends ShownAsset> =
  | { readonly kind: "there"; readonly content: AssetContent[A] }
  /** Home holds none: never made, or a home from before this file. */
  | { readonly kind: "none" }
  | { readonly kind: "unreadable" }

const READ: {
  readonly [A in ShownAsset]: (body: string) => AssetContent[A] | null
} = {
  thumbnail: (body) => (body === "" ? null : { base64: body }),
  description: (body) => {
    const text = body.trim()
    return text === "" ? null : { text: `${text}\n` }
  },
}

/** Home's answer to a read of `asset`, as the page shows it. */
export function readAsset<A extends ShownAsset>(
  asset: A,
  answer: HomeAnswer
): AssetRead<A> {
  if (answer.status === 404) return { kind: "none" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const content = READ[asset](answer.body)
  return content === null ? { kind: "none" } : { kind: "there", content }
}

/**
 * What the page shows for a file: its content; that it isn't made, with
 * Generate where home can make it on its own (`ASSET_MADE`, `isAloneAsset`); that home was
 * asked and will make it; that home tried and couldn't; or nothing, while
 * it is read, or where home can't say.
 */
export type AssetView<A extends ShownAsset> =
  | { readonly kind: "there"; readonly content: AssetContent[A] }
  /** `generate`: the file to ask home for, where it can make it alone. */
  | { readonly kind: "missing"; readonly generate: AloneAsset | null }
  | { readonly kind: "asked" }
  | { readonly kind: "failed" }
  | { readonly kind: "hidden" }

/**
 * The view of `asset` from its read and the list's word on it. A file read
 * there is shown, whatever the list says; one home holds none of is shown
 * by the list's state, and hidden when the list says nothing (an older home,
 * whose page showed no such file).
 */
export function assetView<A extends ShownAsset>(
  asset: A,
  read: AssetRead<A> | undefined,
  state: AssetState | undefined
): AssetView<A> {
  if (read === undefined || read.kind === "unreadable")
    return { kind: "hidden" }
  if (read.kind === "there") return read
  switch (state) {
    case undefined:
    case "present": {
      // Listed but not served: let go or changed since the list was read.
      return { kind: "hidden" }
    }
    case "missing": {
      return { kind: "missing", generate: isAloneAsset(asset) ? asset : null }
    }
    case "queued":
    case "running": {
      return { kind: "asked" }
    }
    case "failed": {
      return { kind: "failed" }
    }
    default: {
      return assertNever(state)
    }
  }
}

/** What asking home to make a file came to. */
export type Produced =
  /** Home will make it, or already has it or is making it. */
  | { readonly kind: "asked" }
  /** A home from before this ask: it serves no such path. */
  | { readonly kind: "older" }
  | { readonly kind: "unreadable" }

/** Home's answer to `POST …/produce`. */
export function readProduced(answer: HomeAnswer): Produced {
  if (answer.status === 404 || answer.status === 405) return { kind: "older" }
  return answer.status === 202 || answer.status === 200
    ? { kind: "asked" }
    : { kind: "unreadable" }
}
