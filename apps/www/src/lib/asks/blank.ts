/**
 * What the Asks page blanks from a pasted result before keeping it (C1096):
 * anything shaped like a key, a token or a password, since a log pasted
 * whole can carry one. Pure. It errs toward blanking: a long run of mixed
 * letters and digits goes, as does any value set to a name that says it is
 * secret. A commit's id (40 hex) and a digest (64 hex) stay, since logs
 * name them and neither opens anything.
 */

/** What stands where something was blanked. */
export const BLANKED = "[blanked]"

/** Tokens whose shape their issuer documents. */
const KNOWN = [
  // GitHub's tokens, Grafana's service account tokens, API keys "sk-…",
  // Slack's, and an AWS access key id.
  /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_\w{16,}|glsa_\w{16,}|sk-[\w-]{16,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16})/g,
  // A JSON web token: three dot-separated base64url parts, the first `{"`.
  /\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]{6,}/g,
  // A private key, whole.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
]

/** `NAME=value` or `name: value` whose name says it is secret: the value goes. */
const NAMED =
  /\b([\w.-]*(?:token|secret|password|passwd|api[_-]?key|private[_-]?key|credential)[\w.-]*)(\s*[=:]\s*)("[^"\n]*"|'[^'\n]*'|[^\s"']+)/gi

/** A long run of characters a key is written in. */
const RUN = /[A-Za-z0-9+/_=-]{24,}/g

const keyShaped = (run: string): boolean => {
  if (/^[0-9a-f]+$/i.test(run))
    return run.length >= 32 && run.length !== 40 && run.length !== 64
  return /[A-Z]/.test(run) && /[a-z]/.test(run) && /[0-9]/.test(run)
}

/** `text` with everything shaped like a secret replaced by `BLANKED`. */
export function blankSecrets(text: string): string {
  let out = text
  for (const known of KNOWN) out = out.replace(known, BLANKED)
  out = out.replace(NAMED, (_all, name: string, sep: string, value: string) =>
    value === BLANKED ? `${name}${sep}${value}` : `${name}${sep}${BLANKED}`
  )
  return out.replace(RUN, (run) => (keyShaped(run) ? BLANKED : run))
}
