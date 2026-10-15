/**
 * What a person types to pair, read strictly: an `https:` address (a bare
 * host becomes one, `http://` is refused, since the pairing's credential
 * travels over https only; LA8), and a code read the way the server reads
 * it (Crockford base32: case, spaces and dashes ignored, `I`/`L` as `1`,
 * `O` as `0`).
 */

/** Where the phone is paired to: the API base, and the host to show. */
export type HomeAddress = { base: string; host: string }

export type AddressProblem = "empty" | "not-https" | "invalid"

/**
 * `file-host.home.example`, `https://host/api/file-host`, or a full
 * `.../api/v1`, as the API base. Never `http:`.
 */
export function pairingAddress(input: string): HomeAddress | AddressProblem {
  const typed = input.trim()
  if (typed === "") return "empty"
  if (/^http:\/\//i.test(typed)) return "not-https"
  let url: URL
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`
    )
  } catch {
    return "invalid"
  }
  if (url.protocol !== "https:" || url.hostname === "") return "not-https"
  const path = url.pathname.replace(/\/+$/, "")
  const base = `${url.origin}${path.endsWith("/api/v1") ? path : `${path}/api/v1`}`
  return { base, host: url.host }
}

/** The host of a stored base, for every line that says where data goes. */
export function hostOf(base: string): string {
  return new URL(base).host
}

const CROCKFORD = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/

/** The code as the server reads it, or `null` while it cannot be one. */
export function typedCode(text: string): string | null {
  const code = text
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
  return CROCKFORD.test(code) ? code : null
}
