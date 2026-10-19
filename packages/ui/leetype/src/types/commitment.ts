/**
 * Def. 9.1 / Prop. 9.1: what a learner hands over at the one blocking control
 * in the design.
 *
 * A union, not `id: string | null`: Prop. 9.1's three observations (correct,
 * confidently wrong, abstained) must not fold into two, or a misconception
 * looks like a gap. `null` would conflate "abstained" with "never
 * committed"; `kind: "abstain"` cannot be mistaken for either.
 */
export type Commitment = { kind: "choice"; id: string } | { kind: "abstain" }
