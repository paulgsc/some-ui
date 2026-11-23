/**
 * What Needs your attention is asked to show from Run it again (RETRY): the
 * takes a render waits on, and which render, so the page can say whose they
 * are and lead back. The address is read by the route itself
 * (`takes/attention.tsx`), which ships in every build's route tree; this is
 * what the phone's page makes of it.
 */

export type OnlySearch = {
  readonly takes: ReadonlyArray<string>
  readonly feed: string
  readonly key: string
}

/** The address's ask, or none. */
export type AttentionSearch = Partial<OnlySearch>

/** Whether the address asks for only some takes. */
export const onlyOf = (search: AttentionSearch): OnlySearch | null =>
  search.takes !== undefined &&
  search.feed !== undefined &&
  search.key !== undefined
    ? { takes: search.takes, feed: search.feed, key: search.key }
    : null
