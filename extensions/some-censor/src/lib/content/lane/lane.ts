/**
 * The listening lane (QD15, #1806): whether a video is music, from what a
 * card or the watch page already shows. Music whose words don't reach the
 * owner has no coupling to the present, so it is admitted whole at any
 * age; the owner judged that the music the feed offers is already that
 * subset, so being music is enough (owner decision, 2026-10-17).
 *
 * Pure, and mechanical: a token in the title, a suffix on the channel's
 * name, a badge. Nothing here judges what a title means (doctrine §8).
 */

export type MusicEvidence = {
  readonly title: string | null
  readonly channelName: string | null
  /** The channel carries the official-artist badge. */
  readonly artist: boolean
}

/**
 * "OST" or "MV" as a whole word: `[MV]`, `OST Part.3`, `(OST)` count, and
 * `MVP` or `HOST` do not. Upper case as YouTube titles write them, and
 * "Ost" too; never lower case, which is a word in other languages (the
 * Scandinavian "ost" is cheese).
 */
const MUSIC_TOKEN = /(?:^|[^\p{L}\p{N}])(?:OST|Ost|MV)(?=$|[^\p{L}\p{N}])/u

/** YouTube's auto-generated artist channels: "Ailee - Topic". */
const TOPIC_SUFFIX = " - Topic"

export function isMusic({
  title,
  channelName,
  artist,
}: MusicEvidence): boolean {
  return (
    artist ||
    channelName?.trim().endsWith(TOPIC_SUFFIX) === true ||
    (title !== null && MUSIC_TOKEN.test(title))
  )
}
