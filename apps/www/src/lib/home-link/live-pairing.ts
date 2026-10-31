/**
 * The pairing's token, for the game day's live socket alone (LA16). Not in
 * `./index`, a React module, so this wait is not React's.
 */
import { nativeCredential } from "./credential"
import { parsePairing } from "./runtime"

/**
 * The pairing this phone holds, as the game day's live socket opens with it
 * (LA16): the API base and the token, or null unpaired. A page cannot set
 * `Authorization` on a socket, so `./live` hands the token to
 * `./live-socket` itself; nothing else calls this.
 */
export async function livePairing(): Promise<{
  base: string
  token: string
} | null> {
  const { record } = await nativeCredential.read()
  const pairing = record === null ? null : parsePairing(record)
  return pairing === null ? null : { base: pairing.base, token: pairing.token }
}
