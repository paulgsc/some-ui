import { z } from "zod"

/**
 * `A` (Def. 1.1): a complete, compilable program together with an entry
 * point and a declared input alphabet. Complete in the strong sense — it
 * compiles and runs without the learner supplying anything. `A` is *not*
 * the assessed artifact (Cor. 6.1) and is *not* required to be visible
 * (Prop. 1.1): its reveal may never be conditioned on prior state, a
 * timer, or a threshold.
 *
 * `source` is inline, the same posture `TypingBlockSchema.source` already
 * takes and for the same reason: a path would reintroduce the fetch seam
 * LTY-SEED closed. `language` is not part of Def. 1.1's own prose — it
 * exists so a renderer can pick a Prism grammar, the role
 * `TypingBlockSchema.language` already plays for a step. `entryPoint` and
 * `inputAlphabet` are free text: the canon names them but does not give
 * either further structure beyond Def. 1.1's plain-English phrasing, and
 * inventing one here would be a schema decision this story does not own.
 */
export const AlgorithmSchema = z.object({
  source: z.string().min(1),
  language: z.enum(["typescript", "rust", "cpp", "c"]),
  entryPoint: z.string().min(1),
  inputAlphabet: z.string().min(1),
})

export type Algorithm = z.infer<typeof AlgorithmSchema>
