/**
 * Whether home takes a name for this phone while pairing (SIGNIN2, #3088;
 * owner, 2026-11-17: "yes, let me name each phone too"). Home keeps it as
 * the pairing's label and shows it only to its owner (paulgsc/server#925,
 * C498). The phone never fills one in: the only name is one the owner
 * typed, a promise home cannot check and rests on this module's callers
 * (an empty field by default). What a typed name comes to is
 * `lib/phone-name`'s, which the lan web's phone list shares.
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
