import { z } from "zod"

/**
 * Mirrors `@some-ui/leetype`'s `Challenge`
 * (packages/ui/leetype/src/types/leetype.ts) - this is the contract an
 * LLM-generated/local challenge corpus must satisfy to be usable as
 * `Leetype`'s `challenges` pool override. Kept as an independent schema
 * (not imported from `@some-ui/leetype`, which has no zod dependency of its
 * own for this type) so `apps/www` can validate the fetched JSON before it
 * ever reaches the component; `z.infer` below stays structurally assignable
 * to `Challenge` because the field types match exactly.
 *
 * `codePaths` are resolved the same way the bundled demo's are - relative to
 * whatever's mounted/symlinked at `public/leetype` (see
 * infra/compose/www.yml and scripts/link-content-assets.js) - so a local
 * corpus's `challenges.json` should point at files it also places under
 * that same directory (e.g. `/leetype/samples/ds-stack.rs`), not at
 * `/code-samples/*` (the small, committed demo set that ships on GitHub
 * Pages).
 */
const CurriculumSchema = z.object({
  stage: z.enum([
    "remember",
    "understand",
    "apply",
    "analyze",
    "integrate",
    "master",
  ]),
  step: z.number().int().positive(),
  totalSteps: z.number().int().positive(),
  insight: z.string().min(1),
  learningObjectives: z.array(z.string().min(1)),
  conceptsIntroduced: z.array(z.string().min(1)),
  conceptsReinforced: z.array(z.string().min(1)),
  dependsOn: z.array(z.string().min(1)),
  completionCriteria: z.array(z.string().min(1)),
  targetProblem: z.string().min(1),
})

export const ChallengeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  mode: z.enum(["data-structure", "algorithm"]),
  tags: z.array(z.string().min(1)),
  /**
   * `rust` is the only required language: a decomposed curriculum is authored
   * in Rust (see the Curriculum Decomposer prompt in
   * packages/some-content/prompts/leetype-challenge-generator), and `Leetype`
   * resolves the player's preferred language down to one the challenge
   * actually carries. The other three stay accepted so the older
   * four-language corpora keep loading.
   */
  codePaths: z.object({
    rust: z.string().min(1),
    typescript: z.string().min(1).optional(),
    cpp: z.string().min(1).optional(),
    c: z.string().min(1).optional(),
  }),
  levelRequired: z.number(),
  /**
   * The challenge's node in the knowledge graph its corpus was decomposed
   * from. Optional so a pre-curriculum corpus already on disk keeps loading -
   * it just gets presented as a flat pool of standalone problems, which is
   * what it is. Present-but-partial is still rejected: the UI's whole
   * curriculum framing (`ChallengeBrief`, the picker's ladder) reads every
   * field, and half a decomposition is more misleading than none.
   */
  curriculum: CurriculumSchema.optional(),
})

export const LeetypeChallengesFileSchema = z.array(ChallengeSchema).min(1)
