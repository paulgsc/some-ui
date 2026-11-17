/**
 * A name for this phone, typed while pairing (SIGNIN2, #3088; owner,
 * 2026-11-17: "yes, let me name each phone too"). Home keeps it as the
 * pairing's label and shows it only to its owner (paulgsc/server#925,
 * C498). The phone never fills one in: the only name is one the owner
 * typed, a promise home cannot check and rests on this module's callers
 * (an empty field by default).
 */
import { SERVER_CONTRACT_EPOCH } from "@some-ui/server-routes"

/** The contract epoch whose `POST /auth/pairing/finish` takes a `label`. */
const NAMED_PAIRING_EPOCH = 12

/** Widened from its literal type, which moves with each snapshot, so the check below reads as one. */
const SNAPSHOT_EPOCH: number = SERVER_CONTRACT_EPOCH

/**
 * Whether this build's home takes a name at pairing: the route snapshot's
 * epoch, so the field appears with the snapshot that carries it and never
 * before (an older home would refuse the unknown field).
 */
export const PHONE_NAMES = SNAPSHOT_EPOCH >= NAMED_PAIRING_EPOCH

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
