/**
 * What the Asks page blanks from a pasted result before keeping it (C1096):
 * anything shaped like a key, a token or a password, since a log pasted
 * whole can carry one. Pure, and linear in what is pasted (each pattern
 * starts only where a name or a run starts). It errs toward blanking: a
 * long run of mixed-case letters and digits goes, as does hex of 32
 * characters or more (`openssl rand -hex` makes keys of 40 and 64, the
 * lengths of a commit and a digest too; a log's short commit ids stay), and
 * any value set to a name that says it is secret. A run with `/` or `-` and
 * no base64 padding or `+` is read as a path, an address or a cache key, and
 * judged piece by piece. It is a net, not a guarantee.
 */

/** What stands where something was blanked. */
export const BLANKED = "[blanked]"

/** Secrets whose shape their issuer or the protocol documents. */
const KNOWN = [
  // GitHub's tokens, Grafana's service account tokens, API keys "sk-…",
  // Slack's, and an AWS access key id.
  /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_\w{16,}|glsa_\w{16,}|sk-[\w-]{16,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16})/g,
  // A JSON web token: three dot-separated base64url parts, the first `{"`.
  /(?<![\w-])eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]{6,}/g,
  // A credential after its scheme, in any case: one with a digit in it, so
  // "Token validation passed" stays.
  /\b(?:basic|bearer|token)[ \t]+(?=[\w+/=.~-]*\d)[\w+/=.~-]{8,}/gi,
  // A private key, whole, or to the end when it is cut off.
  /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----(?:(?!-----END)[\s\S])*(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----)?/g,
]

/** A header that carries a credential: its value goes, to a quote or the line's end. */
const HEADER = /\b((?:proxy-)?authorization[ \t]*[:=][ \t]*)[^\n'"&]+/gi

/**
 * A password in an address: `scheme://user:password@host`, user or not, to
 * the last `@` before the host (a password may hold one). An image's
 * `name:tag@sha256:…` is no password.
 */
const IN_ADDRESS =
  /(:\/\/[^\s:/@]*:)[^\s/@]*(?:@[^\s/@]*)*?@(?![^\s/@]*@)(?!sha256:)/g

/** A command's flag that takes a secret: `--password hunter2`. */
const FLAG =
  /(--(?:password|passwd|token|secret|api-key)(?:=|[ \t]+))("[^"\n]*"|'[^'\n]*'|[^\s"']+)/gi

/**
 * `name=value`, `name: value` or `"name": "value"`, in a line, a query or a
 * list; the value goes when the name is secret. A value ends at a space, a
 * quote, or the next `?`, `&`, `,` or `;`, so the pairs after it are read
 * too.
 */
const SETTING =
  /(?<![\w.-])([\w.-]+)(\\?"?[ \t]*[=:][ \t]*)(\\"(?:(?!\\")[^\n])*\\"|"(?:[^"\\\n]|\\.)*"?|'[^'\n]*'?|[^\s"'?&,;]*=(?:"[^"\n]*"|'[^'\n]*')|[^\s"'?&,;]+)/g

/** A name's parts that say it holds a secret. */
const SECRET_PART =
  /^(?:token|secret|password|passwd|pwd|passphrase|credentials?|apikey|authorization)$/i

/** A key whose kind says it is secret: `api_key`, `SIGNING_KEY`. */
const SECRET_KEY =
  /(?:^|[_.-])(?:api|private|signing|access|session|secret)[_.-]?key$/i

/** A name's parts, camelCase split too: `accessToken` is `access`, `Token`. */
const partsOf = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2")

const secretName = (name: string): boolean =>
  /passw(?:or)?d|passphrase/i.test(name) ||
  SECRET_KEY.test(partsOf(name)) ||
  partsOf(name)
    .split(/[_.-]/)
    .some((part) => SECRET_PART.test(part))

/** A long run of characters a key is written in; `=` only as padding. */
const RUN = /[A-Za-z0-9+/_-]{24,}={0,2}/g

function shaped(bare: string, before: string): boolean {
  if (/^[0-9a-f]+$/i.test(bare))
    return bare.length >= 32 && !before.endsWith("sha256:")
  return (
    bare.length >= 24 &&
    /[A-Z]/.test(bare) &&
    /[a-z]/.test(bare) &&
    /[0-9]/.test(bare)
  )
}

/**
 * The run with what is key-shaped in it blanked. A run with `/` or `-` is
 * a path, an address or a cache key unless it is padded or holds `+` (base64
 * does), so its pieces between them are judged one by one.
 */
function blankRun(run: string, before: string): string {
  const bare = run.replace(/=+$/, "")
  if (!/[/-]/.test(bare) || bare !== run || bare.includes("+"))
    return shaped(bare, before) ? BLANKED : run
  return run.replace(/[^/-]+/g, (piece: string, at: number) =>
    shaped(piece, at === 0 ? before : "") ? BLANKED : piece
  )
}

/** `BLANKED` in the quotes `value` was written in, if any. */
function quoted(value: string): string {
  const quote = /^(\\?["'])/.exec(value)?.[1] ?? ""
  return `${quote}${BLANKED}${quote}`
}

/**
 * A setting, its value blanked when its name is secret; otherwise a setting
 * inside its value (`env: PASSWORD=…`) is read, `depth` levels down, so the
 * work stays linear.
 */
const setting =
  (depth: number) =>
  (all: string, name: string, sep: string, value: string): string => {
    if (value.includes(BLANKED)) return all
    if (secretName(name)) return `${name}${sep}${quoted(value)}`
    return depth > 0
      ? `${name}${sep}${value.replace(SETTING, setting(depth - 1))}`
      : all
  }

/** `text` with everything shaped like a secret replaced by `BLANKED`. */
export function blankSecrets(text: string): string {
  let out = text
  for (const known of KNOWN) out = out.replace(known, BLANKED)
  out = out
    .replace(HEADER, `$1${BLANKED}`)
    .replace(IN_ADDRESS, `$1${BLANKED}@`)
    .replace(
      FLAG,
      (_all: string, flag: string, value: string) => `${flag}${quoted(value)}`
    )
    .replace(SETTING, setting(1))
  return out.replace(RUN, (run: string, at: number, whole: string) =>
    blankRun(run, whole.slice(Math.max(0, at - 7), at))
  )
}
