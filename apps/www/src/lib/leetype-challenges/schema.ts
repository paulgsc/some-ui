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
 * that same directory (e.g. `/leetype/samples/ds-stack.ts`), not at
 * `/code-samples/*` (the small, committed demo set that ships on GitHub
 * Pages).
 */
export const ChallengeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  mode: z.enum(["data-structure", "algorithm"]),
  tags: z.array(z.string().min(1)),
  codePaths: z.object({
    typescript: z.string().min(1),
    rust: z.string().min(1),
    cpp: z.string().min(1),
    c: z.string().min(1),
  }),
  levelRequired: z.number(),
})

export const LeetypeChallengesFileSchema = z.array(ChallengeSchema).min(1)

export type LeetypeChallengesFile = z.infer<typeof LeetypeChallengesFileSchema>
