/**
 * C3 (#1215), Def. 9.1 / Prop. 9.1: what a learner hands over when they tap
 * the one blocking control in the whole design.
 *
 * A discriminated union rather than `id: string | null` on purpose —
 * Prop. 9.1 names three observations (correct, incorrect-and-confident,
 * explicit-abstention) and warns that folding them into two destroys the
 * only signal that tells a misconception from a gap. `null` is exactly that
 * fold: a consumer downstream (#1202's ledger, L2) would have no way to
 * tell "abstained" from "never committed" or from some future non-answer.
 * `kind: "abstain"` is its own case instead, so abstention is structurally
 * impossible to mistake for a wrong answer or a missing one.
 */
export type Commitment = { kind: "choice"; id: string } | { kind: "abstain" }

/**
 * One tappable option in a commitment's closed set.
 *
 * What the options *are* — their copy, how many exist, what a given `id`
 * means to the round — is #1200's call, not this one (#1215's own "out of
 * scope" line). `CommitmentControl` only ever knows a caller-supplied list
 * of these, plus the abstention it adds itself so that Def. 9.1's "always
 * includes an explicit abstention" holds no matter what a caller passes.
 */
export type CommitmentOption = {
  id: string
  label: string
}
