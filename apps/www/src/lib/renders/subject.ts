/**
 * What a row on home's board is (#2899): an episode of a feed, a template's
 * preview, a clip's walk, a cards essay, or a kind the phone doesn't know yet. Pure, so the
 * page can name each in the person's terms and open its page; what it says
 * is `./words`.
 */
import type { TemplateId } from "@some-ui/video-render"
import { isTemplateId, TEMPLATE_IDS } from "@some-ui/video-render"

import { isEssayKey } from "@/lib/cards-essay-key"
import type { Feed } from "@/lib/feeds"
import { isFeed } from "@/lib/feeds"

type ClipSide = "before" | "after"

export type Subject =
  /** Opens the episode's page. */
  | { readonly kind: "episode"; readonly feed: Feed; readonly key: string }
  /** Opens the template's page, where the preview plays. */
  | { readonly kind: "preview"; readonly template: TemplateId | null }
  /** Opens the clip's page. */
  | { readonly kind: "walk"; readonly clip: string; readonly side: ClipSide }
  /** Opens the essay's page, where its video plays (CARDS7, #2979). */
  | { readonly kind: "essay"; readonly key: string }
  /**
   * Opens nothing: a feed this phone doesn't know yet, or a key it can't
   * read. Its `feed` is home's, so the row can still say which (#3235).
   */
  | { readonly kind: "other"; readonly feed: string }

/** A row as home's board gives it. */
export type Row = {
  readonly feed: string
  readonly key: string
  readonly template?: string | undefined
}

/**
 * The template a preview's key starts with (`<template>-<stamp>`), for a
 * home from before it named the template: the longest that fits, since one
 * id may begin another.
 */
function templateOfKey(key: string): TemplateId | null {
  const fits = TEMPLATE_IDS.filter((id) => key.startsWith(`${id}-`))
  return fits.reduce<TemplateId | null>(
    (longest, id) =>
      longest === null || id.length > longest.length ? id : longest,
    null
  )
}

const SIDES = ["before", "after"] as const satisfies ReadonlyArray<ClipSide>

/** What `row` is. */
export function subjectOf(row: Row): Subject {
  // A cards essay is a feed too now, but its row keeps opening the essay's
  // own page, which plays it from any home; Episodes needs a newer one (C379).
  if (row.feed === "cards-essay")
    return isEssayKey(row.key)
      ? { kind: "essay", key: row.key }
      : { kind: "other", feed: row.feed }
  if (isFeed(row.feed)) return { kind: "episode", feed: row.feed, key: row.key }
  if (row.feed === "preview") {
    if (row.template !== undefined)
      return {
        kind: "preview",
        template: isTemplateId(row.template) ? row.template : null,
      }
    return { kind: "preview", template: templateOfKey(row.key) }
  }
  if (row.feed === "clip-walk") {
    for (const side of SIDES) {
      const clip = row.key.endsWith(`-${side}`)
        ? row.key.slice(0, -(side.length + 1))
        : ""
      if (clip !== "") return { kind: "walk", clip, side }
    }
  }
  return { kind: "other", feed: row.feed }
}
