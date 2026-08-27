import { CONCEPT_IDS } from "@leetype/lib/leetype/exercises/concepts"
import type { Exercise } from "@leetype/types/exercise"
import { typingBlockFromDiff } from "@leetype/types/exercise"

import { withJudgment } from "./judgment-step"

/**
 * LTY-PATCH P5's own instance (#1080): a construction `-` line carrying a
 * genuinely ruled-out form, not a prior commitment — the reading
 * `entryApi`'s retrofit (`./entry-api.ts`) never demonstrates on its own,
 * since every `-` line there is inherited context, not an alternative. The
 * eager default is shown, in full, never typed: the contrast with the lazy
 * form actually chosen is the evidence for *why* lazy is owed, per the
 * construction `-` authoring guidance in `docs/leetype/README.md`'s
 * LTY-PATCH section — not a blank with a hint over it, because the two
 * lines differ by more than the one fragment that resolves the obligation.
 * Same subject matter as `entry-api.ts`'s eager-lazy diagnostic step, read
 * from the opposite direction: that step shows the failure and repairs it,
 * this one shows the alternative and rules it out.
 */
const constructionLazyDefaultStep = withJudgment({
  id: "construction-lazy-default-01",
  goal: "Choose the entry call that defers construction until the place is actually vacant.",
  concepts: [CONCEPT_IDS.eagerVsLazyEvaluation, CONCEPT_IDS.lookupAsPlace],
  obligation:
    "the default is owed lazily — the constructor may run only on the call that finds the entry vacant, never on a call that finds it already occupied",
  decisionReason:
    "or_insert_with defers build_default() behind a closure, so it runs only on the one call that finds the entry actually vacant",
  surfaceRule:
    "use or_insert_with because that's the idiomatic call for lazy defaults",
  counterfactual:
    "the default were already a cheap, fully-evaluated literal instead of a constructor call — wrapping a literal in a closure for or_insert_with would defer nothing and only add indirection",
  blocks: [
    {
      kind: "transition",
      label: "constructor calls",
      before: "every call, occupied or not",
      after: "only the call that finds the entry vacant",
    },
    typingBlockFromDiff({
      language: "rust",
      path: "src/cache/lazy_default.rs",
      oldStart: 1,
      newStart: 1,
      segments: [
        {
          kind: "deletion",
          text: "map.entry(key).or_insert(build_default());\n",
        },
        {
          kind: "addition",
          text: "map.entry(key).or_insert_with(build_default);",
        },
      ],
    }),
  ],
})

export const constructionLazyDefault: Exercise = {
  id: "construction-lazy-default",
  title: "Construction: lazy default",
  steps: [constructionLazyDefaultStep],
}
