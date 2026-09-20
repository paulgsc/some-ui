import { shuffledBySeed } from "@leetype/lib/leetype/deterministic-random"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionRegisterEntry } from "@leetype/lib/leetype/proposition-register/parse-canon"
import { READING_OPTION_COUNT } from "@leetype/lib/leetype/reading-probe"
import type { DiffSetMember } from "@leetype/types/round"

/**
 * B2 (LTY-PROBE, #1219) — `docs/canon/complexity-witness-canon.typ` Rem.
 * 6.2, Thm. 6.1, Def. 1.6.
 *
 * The round-shaped counterpart to `lib/leetype/reading-probe`'s
 * `claimPoolOf`/`readingProbeOf`, additive rather than a rewrite of it:
 * this module is a new, independent caller of the same small, reusable
 * pieces (`shuffledBySeed`, `READING_OPTION_COUNT`) that never imports the
 * step corpus and nothing existing imports yet, the same posture every
 * other Step 5 story on this relay has held. `reading-probe/index.ts`
 * itself is untouched — B2 is not one of `#1236`'s three named migration
 * points (C5, C1, H1), so a live rewire is explicitly not this story's
 * job.
 *
 * # What actually generalizes, and what does not
 *
 * `readingProbeOf`'s pool was *other steps' own authored claims* — sentences
 * true only because somebody wrote them for that specific step. Here the
 * pool is `P`, the proposition register itself (Rem. 6.2): sentences that
 * are true generally, in the register, independent of any one round.
 * That is the entire generalization the issue asks for — "the option pool
 * becomes register propositions instead of other steps' claims" — and the
 * epic's own acceptance criterion for this story (`#1236`, Step 5, B2):
 * "two rounds sharing a CW-P proposition offer the same option pool, drawn
 * from the register." Both hold regardless of how distractors within that
 * pool are ordered — see "No preference ranking" below for why none is
 * implemented.
 *
 * # The answer is μ(d) of the *selected* diff, not always the admissible one
 *
 * Thm. 6.1 and Def. 8.1 (the round cycle) are both explicit that the
 * learner's selection is a pair `(d, p)` where `d` ranges over the whole
 * presented `D`, admissible or not — Def. 8.1's own case 2 ("the round
 * presents D and the learner selects a pair") never singles out the
 * admissible member as the only one a learner can point at. `roundProbeOf`
 * therefore takes the *specific* `DiffSetMember` the card is being posed
 * for — whichever one the caller has the learner looking at — and reads
 * `propositionId` straight off it. An earlier draft of this function
 * assumed the admissible member was always the one being asked about;
 * that is wrong whenever a learner examines a distractor diff, whose own
 * `propositionId` is a different, equally real proposition (review
 * finding on this PR, chatgpt-codex-connector) — fixed by taking the
 * member directly instead of deriving one from a whole `DiffSet`.
 *
 * # No preference ranking
 *
 * Rem. 6.2 names two preferences for choosing distractors ahead of seed
 * order: a shared input dimension, then a shared structural family. Two
 * straight review rounds on this PR (chatgpt-codex-connector) showed both
 * unsound as a static, register-level table:
 *
 * - *Dimension*: a proposition's canon statement is a general claim over
 *   its own locally-scoped variables (Prop. 7.1's `G_1, ..., G_m`, Prop.
 *   7.2's `r`) — most name no dimension letter at all, and two
 *   propositions' incidental reuse of a letter (`CW-P1` and `CW-P2`, the
 *   review's own example, don't even do that) is not "sharing a
 *   dimension." What Rem. 6.2 means is a dimension a proposition is
 *   *instantiated at in a given round* — round-level data this function
 *   never sees and the corpus does not yet index by proposition. Filed
 *   `#1331` (sub-issue of `#1219`).
 * - *Structural family*: a first attempt classified each proposition as
 *   `"seq"`, `"loop"`, or a catch-all `"substitution"` bucket. Round 2's
 *   review caught that this forced three-way split does not track Def.
 *   2.1's actual grammar: `CW-P10` ("amortization is a claim about a
 *   sequence") was filed under `"seq"`, but Def. 2.1's `Seq` is
 *   *sibling control-flow composition within one cost graph* — an
 *   unrelated sense of "sequence" from a temporal series of separate
 *   operation invocations. More broadly, most register entries (bound
 *   changes, algorithmic trade-offs, expected-vs-worst-case behaviour,
 *   independence from every bound) are not themselves instances of `W(c)`,
 *   `Seq`, or `Loop` at all — they are theorems *about* cost graphs
 *   built from that grammar, or claims outside it entirely (Prop. 7.15
 *   says outright that `Loop` does not even model recursion). Forcing
 *   every entry into one of three buckets to get a ranking signal, rather
 *   than deriving that signal from real structural kinship, is exactly
 *   the "matching hand-chosen notation" the review named. Filed `#1332`
 *   (sub-issue of `#1219`); `lib/leetype/proposition-register/
 *   classification.ts` (and its coverage-gap check) was removed rather
 *   than narrowed a second time, the same call R5 (`#1208`) made on
 *   `checkDiscriminability` after two straight unsound narrowings of its
 *   own — see that story's own PR for the precedent.
 *
 * Distractors are therefore chosen uniformly at random (seeded) from the
 * pool. This still satisfies the epic's own literal acceptance criterion
 * above — pool membership and selection are a function of the register
 * and the seed, never of any per-round data — and leaves both real
 * preferences for whichever future story builds the structure they
 * actually need.
 *
 * # `justification` and `gloss` (B3, #1220)
 *
 * `ReadingProbe.justification` is a *second* authored sentence
 * (`rationale.whyRepairDiscriminates`) distinct from the answer's own
 * `text`, offered as extra corroboration once a step's answer is
 * identified. Thm. 6.1's own proof describes a round's analogous
 * corroboration as "the authored statement of `μ(d)` itself" — canon §7's
 * full body text, not `PropositionOption.text` (which stays the register's
 * short `title`, the discrimination target a learner picks between; see
 * that type's own doc comment for why the two stay separate). `#1330`
 * extended `parse-canon.ts` to capture that body as `PropositionRegisterEntry.
 * statement`, so `roundProbeOf` now reads it straight off the answer entry
 * as `RoundProbe.justification` — never optional, since every active
 * register entry has one by construction (canon §7's `#proposition(...)[...]`
 * syntax requires a body).
 *
 * `gloss` is the different, round-specific half Thm. 6.1's own acceptance
 * criteria also ask for: *why this diff* instantiates the register's
 * general claim, as opposed to `justification`'s general-by-construction
 * statement. Read straight off `selectedDiff.propositionGloss`
 * (`types/round.ts`) — genuinely optional, since #1220's own acceptance
 * criteria call for leaving a missing gloss visible rather than papering
 * over it with generated prose, the same posture LTY-MOBILE already takes
 * for the construction family's missing `whyRepairDiscriminates`.
 */

/**
 * One register proposition, offered as a card option. `id` is a `CW-P` id,
 * stable across the whole register.
 *
 * `text` is the register entry's own `title` — a short name ("Sequential
 * composition adds"), deliberately kept short rather than switched to
 * canon §7's full authored `statement` (`#1330`) once that became
 * available: `text` is the discrimination target a learner picks *between*
 * four options at a glance, and a full paragraph-length statement on every
 * row would turn the card into a reading task before a single tap. The
 * full statement is what `RoundProbe.justification` carries instead —
 * shown once, for the answer alone, after a commitment is recorded (see
 * this module's own doc comment, "`justification` and `gloss`").
 */
export type PropositionOption = {
  id: PropositionId
  text: string
}

function isPropositionId(value: string): value is PropositionId {
  return Object.hasOwn(PROPOSITION_REGISTER, value)
}

function propositionOptionOf(
  entry: PropositionRegisterEntry
): PropositionOption {
  if (!isPropositionId(entry.id)) {
    throw new Error(
      `propositionOptionOf: "${entry.id}" is not a registered CW-P id — the register is malformed.`
    )
  }
  return { id: entry.id, text: entry.title }
}

/**
 * The whole option pool: every *active* register entry (Rem. 7.1/7.3 — a
 * retired entry is still citable but is no longer taught, so offering one
 * as a live choice would pose a question the register itself no longer
 * stands behind). Unlike `claimPoolOf`, which draws from whichever steps a
 * caller hands it, "the option pool is the register" is B2's own
 * acceptance criterion stated literally — there is no narrower corpus
 * slice to pass in, so this takes the register itself (parameterized only
 * for tests that want a smaller synthetic one).
 */
export function propositionPoolOf(
  register: Readonly<
    Record<PropositionId, PropositionRegisterEntry>
  > = PROPOSITION_REGISTER
): ReadonlyArray<PropositionOption> {
  return Object.values(register)
    .filter((entry) => entry.status === "active")
    .map(propositionOptionOf)
}

/**
 * A round, posed as a proposition-discrimination card.
 *
 * No `family`/`prompt` fields: those exist on `ReadingProbe` because a
 * step's claim comes from one of three differently-worded authored fields
 * (`rationale.cause`/`obligation`/`goal`) and the card's prompt has to
 * match which one. A round's answer is always "which proposition does this
 * diff witness" — one question, not three — so there is nothing for a
 * `family` field to distinguish and nothing for a `prompt` field to vary
 * (`ROUND_PROBE_PROMPT`, below, is the one fixed question every round
 * asks).
 *
 * `justification` and `gloss`: see this module's own doc comment,
 * "`justification` and `gloss` (B3, #1220)."
 */
export type RoundProbe = {
  answerId: PropositionId
  options: ReadonlyArray<PropositionOption>
  justification: string
  gloss?: string
}

/**
 * The one fixed question every round's discrimination card asks — unlike
 * `ReadingProbe`'s `FAMILY_PROMPT`, there is only ever one, per `RoundProbe`'s
 * own doc comment on why it carries no `family`/`prompt` fields of its own.
 */
export const ROUND_PROBE_PROMPT = "Which proposition does this diff witness?"

/**
 * Builds a card for one diff-set member — `d` in Thm. 6.1's pair `(d, p)`.
 * `selectedDiff` is whichever member the caller has the learner looking
 * at, admissible or not; this function does not choose one for itself
 * (see this module's own doc comment on why an earlier draft's assumption
 * that it was always the admissible member was wrong). `pool` defaults to
 * the whole live register (`propositionPoolOf()` — "the option pool is
 * the register" is B2's own acceptance criterion) and is only ever
 * overridden by a test that wants a small, controlled candidate set.
 *
 * Distractors are a uniform seeded sample of the pool minus the answer —
 * see this module's own doc comment, "No preference ranking," for why
 * Rem. 6.2's two named preferences (shared dimension, shared structural
 * family) are not implemented here.
 *
 * # Prop. 6.1 is not checked here
 *
 * "No two presented options are both true of the selected diff" needs a
 * truth relation between a proposition and a diff that no data structure
 * in this workspace carries yet (`#1284`, filed off R5/#1208's own review:
 * two straight rounds showed every mechanical approximation over `D`
 * alone unsound). This function builds the option-pool structure `#1284`
 * says is the real prerequisite for a sound check; wiring that check
 * against it is `#1284`'s own remaining work, not this story's.
 *
 * # Retired propositions cannot be the answer
 *
 * `PropositionIdSchema` (`types/round.ts`) accepts a retired id, by design:
 * Rem. 7.1/7.2's amendment protocol keeps a retired entry resolvable so
 * existing citations authored before the retirement keep working, rather
 * than turning a past amendment into a raft of newly-dangling references.
 * That is a fact about *citation resolution*, not about what a fresh card
 * may teach — a retired proposition is "no longer taught" (Rem. 7.3
 * exemptions it from `checkRegisterCoverage`'s own instantiation
 * requirement for exactly this reason), so posing one as a live
 * discrimination card's *answer* would contradict the same reasoning
 * `propositionPoolOf` already applies to the distractor side (review
 * finding on this PR, chatgpt-codex-connector: an earlier draft filtered
 * retired entries out of the distractor pool but not out of the answer
 * path, which bypassed that filter entirely via a raw register lookup).
 * `register` is a parameter, not always the live `PROPOSITION_REGISTER`,
 * purely so a test can exercise this against a synthetic retired entry —
 * the real register has no retired entries as of this story.
 *
 * # Totality
 *
 * Total for every `DiffSetMember` whose `propositionId` names an *active*
 * register entry — `selectedDiff.propositionId` always resolves against
 * the register at all (`PropositionIdSchema`, `types/round.ts`), and
 * `propositionPoolOf` always has at least the answer itself to fall back
 * to, mirroring `claimOf`'s own totality property for the step surface.
 * A retired answer is the one input this function deliberately refuses
 * rather than degrades through, per the section above.
 *
 * `justification` is read straight off the answer entry's own `statement`
 * (`#1330`) — never optional, since every active entry has one by
 * construction. `gloss` passes `selectedDiff.propositionGloss` through
 * unchanged when authored, and is omitted (not defaulted to an empty or
 * generated string) when it is not — see this module's own doc comment,
 * "`justification` and `gloss` (B3, #1220)."
 */
export function roundProbeOf(
  selectedDiff: DiffSetMember,
  seed: number,
  optionCount: number = READING_OPTION_COUNT,
  pool: ReadonlyArray<PropositionOption> = propositionPoolOf(),
  register: Readonly<
    Record<PropositionId, PropositionRegisterEntry>
  > = PROPOSITION_REGISTER
): RoundProbe {
  const answerId = selectedDiff.propositionId
  const answerEntry = register[answerId]
  if (answerEntry.status !== "active") {
    throw new Error(
      `roundProbeOf: "${answerId}" (${answerEntry.title}) is retired — Rem. 7.1/7.3: still a real citation, but the register no longer teaches it, so it cannot be a live card's answer.`
    )
  }

  const candidates = pool.filter((option) => option.id !== answerId)

  const distractors = shuffledBySeed(candidates, seed).slice(
    0,
    Math.max(optionCount - 1, 0)
  )

  const answerOption = propositionOptionOf(answerEntry)
  const options = shuffledBySeed(
    [answerOption, ...distractors],
    seed ^ 0x27d4eb2f
  )

  return {
    answerId,
    options,
    justification: answerEntry.statement,
    ...(selectedDiff.propositionGloss !== undefined
      ? { gloss: selectedDiff.propositionGloss }
      : {}),
  }
}
