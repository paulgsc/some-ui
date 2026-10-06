import type { SpokenLanguage } from "@some-ui/speech"

/**
 * What every TOPIK line is spoken in.
 *
 * A line says its language and nothing more. Which voice reads it is the
 * page's speech session's call: the voice the person chose when it speaks
 * Korean, otherwise the session's Korean default (`@some-ui/speech`,
 * `lib/voices`). Picking a voice here would override the one chosen in
 * Settings.
 */
export const SPOKEN_LANGUAGE: SpokenLanguage = "korean"
