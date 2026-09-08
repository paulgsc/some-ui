import { shuffledBySeed } from "@leetype/lib/leetype/deterministic-random"
import {
  isPropositionId,
  PROPOSITION_CLASSIFICATION,
} from "@leetype/lib/leetype/proposition-register/classification"
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
 * becomes register propositions instead of other steps' claims" — and it
 * is why this module owns its own ranking rather than importing
 * `readingProbeOf`'s: a claim's rank keys off `family`/`concepts`, fields a
 * `Claim` carries and a `PropositionRegisterEntry` does not.
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
 * # No `justification` field
 *
 * `ReadingProbe.justification` is a *second* authored sentence
 * (`rationale.whyRepairDiscriminates`) distinct from the answer's own
 * `text`, offered as extra corroboration once a step's answer is
 * identified. Thm. 6.1's own proof describes a round's analogous
 * corroboration as "the authored statement of `μ(d)` itself" — which
 * `PropositionOption.text` does not yet carry (see that type's own doc
 * comment for why, and `#1330`, filed off this PR's own review). Adding a
 * field here that could only ever hold the same short `title` `options`
 * already carries would not be that corroboration, only a redundant copy
 * of it, so `RoundProbe` omits the field until `#1330`'s own gap closes.
 */

/**
 * One register proposition, offered as a card option. `id` is a `CW-P` id,
 * stable across the whole register.
 *
 * `text` is the register entry's own `title` — a short name ("Sequential
 * composition adds"), not canon §7's full authored statement (the body
 * text after the name, carrying the actual equation or claim). That body
 * is not parsed anywhere in this workspace yet (`parse-canon.ts` reads
 * only the `name:` argument); until it is, `text` is the best available
 * stand-in for "the sentence this option names," sufficient for B2's own
 * discrimination-card job. Filed as `#1330` (sub-issue of `#1219`): B3
 * (#1220) needs the fuller statement for its own verdict justification and
 * will need the parser extended before it can render one.
 */
export type PropositionOption = {
  id: PropositionId
  text: string
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
 * `family` field to distinguish and nothing for a `prompt` field to vary.
 */
export type RoundProbe = {
  answerId: PropositionId
  options: ReadonlyArray<PropositionOption>
}

/**
 * Builds a card for one diff-set member — `d` in Thm. 6.1's pair `(d, p)`.
 * `selectedDiff` is whichever member the caller has the learner looking
 * at, admissible or not; this function does not choose one for itself
 * (see this module's own doc comment on why an earlier draft's assumption
 * that it was always the admissible member was wrong). `pool` defaults to
 * the whole live register (`propositionPoolOf()` — "the option pool is
 * the register" is B2's own acceptance criterion) and is only ever
 * overridden by a test that wants a small, controlled candidate set to
 * isolate the preference order below, the same reason `readingProbeOf`
 * takes `pool` as a parameter rather than reading a module-level constant.
 *
 * # Preference ordering — stated in full, per this package's own bar
 *
 * A distractor is *another register proposition*, preferring one sharing
 * `μ(d)`'s own structural family (Def. 2.1's grammar —
 * `lib/leetype/proposition-register/classification.ts`), then seed order.
 *
 * Rem. 6.2 also names a *shared input dimension* as a preference ahead of
 * family. This function does not implement that half: a proposition's
 * canon statement is a general claim over its own locally-scoped
 * variables (Prop. 7.1's `G_1, ..., G_m`, Prop. 7.2's `r` — most entries
 * name no dimension letter at all), and treating two propositions'
 * incidental reuse of the same letter as "the same dimension" is unsound
 * (review finding on this PR, chatgpt-codex-connector — an earlier
 * version of this table did exactly that, including for two propositions,
 * CW-P1 and CW-P2, whose own canon statements name no dimension at all).
 * What Rem. 6.2 actually needs is which dimension a proposition is
 * *instantiated at in a given round's own constraint set* — data that
 * lives on `RoundCorpusEntry.constraints` (a round-level field this
 * function, which only ever sees one `DiffSetMember`, has no access to)
 * and that still would not answer the question for a *candidate*
 * distractor proposition unless some other round in the corpus happens to
 * instantiate it too. No structure in this workspace tracks that
 * cross-round relationship yet. Filed as `#1331` (sub-issue of `#1219`).
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
 * # Totality
 *
 * Total for every `DiffSetMember` a schema-valid `DiffSet` can contain:
 * `selectedDiff.propositionId` always resolves against the register
 * (`PropositionIdSchema`, `types/round.ts`), and `propositionPoolOf`
 * always has at least the answer itself to fall back to, mirroring
 * `claimOf`'s own totality property for the step surface.
 */
export function roundProbeOf(
  selectedDiff: DiffSetMember,
  seed: number,
  optionCount: number = READING_OPTION_COUNT,
  pool: ReadonlyArray<PropositionOption> = propositionPoolOf()
): RoundProbe {
  const answerId = selectedDiff.propositionId
  const answerFamily = PROPOSITION_CLASSIFICATION[answerId].family

  const candidates = pool.filter((option) => option.id !== answerId)

  const sharesFamily = (option: PropositionOption): boolean =>
    PROPOSITION_CLASSIFICATION[option.id].family === answerFamily

  const rank = (option: PropositionOption): number =>
    sharesFamily(option) ? 0 : 1

  const distractors = shuffledBySeed(candidates, seed)
    .map((option, index) => ({ option, index }))
    .sort((a, b) => rank(a.option) - rank(b.option) || a.index - b.index)
    .slice(0, Math.max(optionCount - 1, 0))
    .map((entry) => entry.option)

  const answerOption = propositionOptionOf(PROPOSITION_REGISTER[answerId])
  const options = shuffledBySeed(
    [answerOption, ...distractors],
    seed ^ 0x27d4eb2f
  )

  return { answerId, options }
}
