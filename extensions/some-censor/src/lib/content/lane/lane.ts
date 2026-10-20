/**
 * The listening lane (QD15, #1806): whether a video is music, from what a
 * card or the watch page already shows. Music whose words don't reach the
 * owner has no coupling to the present, so it is admitted whole at any
 * age; the owner judged that the music the feed offers is already that
 * subset, so being music is enough (owner decision, 2026-10-17).
 *
 * Pure, and mechanical: a token in the title, a suffix on the channel's
 * name, a badge. Nothing here judges what a title means (doctrine §8).
 *
 * Strict mode reads the channel's two signs only (#1966): the title token
 * also admits a ship or a motorcycle ("MV Dali", "MV Agusta").
 */

export type MusicEvidence = {
  readonly title: string | null
  readonly channelName: string | null
  /** The channel carries the official-artist badge. */
  readonly artist: boolean
}

/**
 * "OST" or "MV" as a whole word, in upper case as YouTube titles write them:
 * `[MV]`, `OST Part.3`, `(OST)`, and `도깨비OST` or `OST的` against another
 * script count, and `MVP` or `HOST` do not. Only a Latin letter or a digit
 * joins the token to a longer word. Never in
 * another case: "Ost" is German for east and "ost" Scandinavian for cheese.
 * A non-music title can still carry the token (a ship, "MV Dali"; a
 * motorcycle, "MV Agusta"); the owner's rule accepts that.
 */
const MUSIC_TOKEN = /(?:^|[^A-Za-z0-9])(?:OST|MV)(?=$|[^A-Za-z0-9])/

/** YouTube's auto-generated artist channels: "Ailee - Topic". */
const TOPIC_SUFFIX = " - Topic"

/** Which signs make a video music: all three, or the channel's two. */
export type MusicSigns = "all" | "channel"

export function isMusic(
  { title, channelName, artist }: MusicEvidence,
  signs: MusicSigns
): boolean {
  return (
    artist ||
    channelName?.trim().endsWith(TOPIC_SUFFIX) === true ||
    (signs === "all" && title !== null && MUSIC_TOKEN.test(title))
  )
}
