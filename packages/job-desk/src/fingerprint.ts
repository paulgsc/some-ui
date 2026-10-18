/**
 * Indeed has no stable key a run can see: the connector's job ids count up
 * per session (`JOBSEARCH_100011`) and its short links change between two
 * calls for the same posting. So a posting is known by what it says about
 * itself, normalized: company, title and location.
 */

function part(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim() || "-"
  )
}

export type FingerprintInput = {
  company: string
  title: string
  location: string
}

/** `company|title|location`, each lower-cased with punctuation dropped. */
export function fingerprint(posting: FingerprintInput): string {
  return [posting.company, posting.title, posting.location].map(part).join("|")
}
