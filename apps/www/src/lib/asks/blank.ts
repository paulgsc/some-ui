/**
 * What the Asks page blanks from a pasted result before keeping it (C1096):
 * anything shaped like a key, a token or a password, since a log pasted
 * whole can carry one. Pure, and linear in what is pasted. It errs toward
 * blanking: a long run of mixed-case letters and digits goes, as does hex of
 * 32 characters or more (`openssl rand -hex` makes keys of 40 and 64, the
 * lengths of a commit and a digest too; a log's short commit ids stay), and
 * any value set to a name that says it is secret. Only a digest written
 * `sha256:<hex>` keeps its hex.
 */

/** What stands where something was blanked. */
export const BLANKED = "[blanked]"

/** Secrets whose shape their issuer or the protocol documents. */
const KNOWN = [
  // GitHub's tokens, Grafana's service account tokens, API keys "sk-…",
  // Slack's, and an AWS access key id.
  /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_\w{16,}|glsa_\w{16,}|sk-[\w-]{16,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16})/g,
  // A JSON web token: three dot-separated base64url parts, the first `{"`.
  /\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]{6,}/g,
  // A credential sent in a header: `Basic …`, `Bearer …`.
  /\b(?:Basic|Bearer|Token)\s+[A-Za-z0-9+/=._~-]{8,}/g,
  // A private key, whole, or to the end when it is cut off.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:(?!-----END)[\s\S])*(?:-----END [A-Z ]*PRIVATE KEY-----)?/g,
]

/** A password in an address: `scheme://user:password@host`. */
const IN_ADDRESS = /(:\/\/[^\s:/@]+:)[^\s@/]+@/g

/** `name=value` or `name: value`; the value goes when the name is secret. */
const SETTING =
  /(?<![\w.-])([\w.-]+)([ \t]*[=:][ \t]*)("[^"\n]*"|'[^'\n]*'|[^\s"']+)/g

const SECRET_NAME =
  /token|secret|passw(?:or)?d|credential|auth|(?:^|[_.-])(?:api|private|signing|access|session)?[_.-]?key$/i

/** A long run of characters a key is written in; `=` only as padding. */
const RUN = /[A-Za-z0-9+/_-]{24,}={0,2}/g

function keyShaped(run: string, before: string): boolean {
  const bare = run.replace(/=+$/, "")
  if (/^[0-9a-f]+$/i.test(bare))
    return bare.length >= 32 && !before.endsWith("sha256:")
  return /[A-Z]/.test(bare) && /[a-z]/.test(bare) && /[0-9]/.test(bare)
}

/** `text` with everything shaped like a secret replaced by `BLANKED`. */
export function blankSecrets(text: string): string {
  let out = text
  for (const known of KNOWN) out = out.replace(known, BLANKED)
  out = out.replace(IN_ADDRESS, `$1${BLANKED}@`)
  out = out.replace(
    SETTING,
    (all: string, name: string, sep: string, value: string) =>
      SECRET_NAME.test(name) && value !== BLANKED
        ? `${name}${sep}${BLANKED}`
        : all
  )
  return out.replace(RUN, (run: string, at: number, whole: string) =>
    keyShaped(run, whole.slice(Math.max(0, at - 7), at)) ? BLANKED : run
  )
}
