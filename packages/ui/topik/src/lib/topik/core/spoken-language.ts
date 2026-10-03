/**
 * What every TOPIK line is spoken in, as BCP-47.
 *
 * A line says its language and nothing more. Which voice reads it is the
 * page's speech session's call: the voice the person chose when it speaks
 * Korean, otherwise the session's Korean default (`@some-ui/speech`,
 * `lib/voices`). This applet used to pick "the first Korean voice" itself on
 * every line, which kept English voices away from Hangul (an English Edge
 * voice answers Hangul with an HTTP 500) but also overrode the person's
 * choice, so a voice picked in Settings never spoke a lesson.
 */
export const SPOKEN_LANGUAGE = "ko-KR"
