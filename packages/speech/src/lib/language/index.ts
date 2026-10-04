/**
 * @module language
 *
 * The languages this site speaks, as our own closed type.
 *
 * A platform names a language with a tag (`ko-KR`, `ko_KR`, `kor`, `en-US`)
 * whose shape is the platform's, not ours, and whose set is open: any
 * string a browser, a phone or a hosted service chooses to send. Nothing in
 * this package or its applets branches on such a string. An applet says a
 * line in a `SpokenLanguage`; an adapter turns that into its platform's tag
 * on the way out (`LANGUAGE_TAG`) and turns a platform's tag back into one
 * of ours on the way in (`spokenLanguageOf`), which is the only place a tag
 * is ever parsed. A language we do not speak comes back as `null`, so a
 * voice for Konkani (`kok`) can never be taken for Korean (`ko`) by a
 * prefix match somewhere else.
 */

/** Every language a line here can be said in. */
export const SPOKEN_LANGUAGES = ["korean", "english"] as const

export type SpokenLanguage = (typeof SPOKEN_LANGUAGES)[number]

/**
 * The tag a synthesizer is handed for each language. For adapters: an
 * applet never sees one.
 */
export const LANGUAGE_TAG: Readonly<Record<SpokenLanguage, string>> = {
  korean: "ko-KR",
  english: "en-US",
}

/**
 * A platform's tag as one of our languages, or `null` for any language we
 * do not speak. Compares the whole primary subtag, in the forms platforms
 * are known to send (ISO 639-1 and 639-2), case- and separator-blind.
 */
export function spokenLanguageOf(tag: string): SpokenLanguage | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? ""
  return PRIMARY_SUBTAG.get(primary) ?? null
}

/** Every primary subtag a platform is known to send for one of ours. */
const PRIMARY_SUBTAG: ReadonlyMap<string, SpokenLanguage> = new Map([
  ["ko", "korean"],
  ["kor", "korean"],
  ["en", "english"],
  ["eng", "english"],
])

/**
 * Whether a platform's tag is the exact one this package hands it for
 * `language` (region included), for preferring that voice among several
 * for the same language.
 */
export function isPreferredTag(tag: string, language: SpokenLanguage): boolean {
  return (
    tag.trim().toLowerCase().replace(/_/g, "-") ===
    LANGUAGE_TAG[language].toLowerCase()
  )
}
