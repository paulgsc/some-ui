/**
 * A phone's name as home takes it (C498): trimmed, at most 40 characters,
 * nothing hidden or line-breaking, the joiners emoji and some scripts need
 * kept. Typed on the phone while pairing (`lib/home-link/naming`,
 * SIGNIN2) and on the lan web's phone list (`lib/auth/phones`, SIGNIN7),
 * so both refuse what home would refuse before anything is sent.
 */

/** Home's longest name, in characters. */
const NAME_MAX = 40

/**
 * What home refuses in a name (C498): a control or line-separator
 * character, a bidi mark or override, or a zero-width space. The
 * zero-width joiner and non-joiner stay, for emoji and scripts that need
 * them.
 */
const HIDDEN =
  /[\p{Cc}\p{Zl}\p{Zp}\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/u

/** A typed name as home would take it: none (blank), the name, or refused. */
export type TypedName =
  | { readonly kind: "none" }
  | { readonly kind: "name"; readonly name: string }
  | { readonly kind: "refused" }

/**
 * The name as home would keep it, trimmed; refused where home would refuse
 * it, so the form says so before anything is sent.
 */
export function typedName(text: string): TypedName {
  const name = text.trim()
  if (name === "") return { kind: "none" }
  if (HIDDEN.test(name) || [...name].length > NAME_MAX) {
    return { kind: "refused" }
  }
  return { kind: "name", name }
}
