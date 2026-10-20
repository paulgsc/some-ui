import type { Digest } from "./digest"
import { DigestSchema } from "./digest"
import sample from "./sample.digest.json"

/**
 * A complete digest on made-up postings: the template a run copies, and what
 * the web builds show a viewer of the Jobs wing. Its tests hold it to every
 * rule the checker knows. Its own entry (`@some-ui/job-desk/sample`), so only
 * what reads it carries it.
 */
export function sampleDigest(): Digest {
  return DigestSchema.parse(sample)
}
