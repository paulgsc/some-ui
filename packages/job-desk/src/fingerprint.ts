/**
 * Postings come from several job boards and Hacker News, and no id is shared
 * across them or stable from one run to the next. So a posting is known by
 * what it says about itself, normalized: company, title and location.
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

/**
 * `company|title`, the fingerprint without its place: the same role searched
 * from another place is one posting (ROUTINE.md, "Search").
 */
export function role(posting: Omit<FingerprintInput, "location">): string {
  return [posting.company, posting.title].map(part).join("|")
}
