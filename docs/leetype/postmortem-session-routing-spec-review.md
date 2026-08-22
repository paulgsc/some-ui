# LeetType session routing postmortem and specification review

**Status:** accepted; session-routing phase implemented<br>
**Scope:** exercise selection, session termination, composer duration, and diff-hunk authoring<br>
**Date:** 2026-08-22

> **Implementation note:** The duration field, duration-bounded exercise loop,
> production-corpus eligibility boundary, and cyclic seeded scheduler described below
> landed with this review. The canonical diff-document conversion remains the deliberately
> separate authoring-model phase described in migration steps 6–8; the legacy overlay must
> not gain new capabilities while that conversion is pending.

## Executive verdict

The reported behavior is real and follows directly from four independently reasonable
decisions that do not compose into a valid session:

1. `nextExercise()` accepts completion history but ignores it and returns the first
   corpus item, `entryApi`, unless a caller supplies `preferId`.
2. `Leetype` resolves that exercise only once per mount and, after its final step,
   transitions to a results sink. “Play again” restarts the same resolved exercise.
3. The activity catalogue deliberately publishes no LeetType fields, so the composer
   cannot expose duration even though scene construction silently assigns the generic
   ten-minute fallback.
4. LTY-PATCH is not an ingestion architecture for Git diffs. It is an optional,
   hand-authored, single-hunk presentation overlay (`source` plus parallel
   `lineKinds`) whose own contract says that no real `git diff` is ingested.

Consequently, the workspace is not stuck because of a randomization defect. It has no
runtime corpus traversal at all. It repeatedly chooses array element zero by design,
then terminates at the exercise boundary by design, while the outer scheduler continues
to own an invisible ten-minute lifetime. The result violates the product statement that
LeetType is a continuing “read → type → observe → repeat” loop.

The correction is to make **duration the session terminator**, make exercise completion
an internal transition, schedule the corpus with a seeded cyclic Fisher–Yates shuffle
bag, and replace the parallel-array patch overlay with a canonical parsed diff-hunk
model. The old overlay and selection shim should be deprecated and removed after corpus
migration; they should not remain as a second authoring path.

## What the repository does today

### 1. Selection always falls back to `entryApi`

The seed index puts `entryApi` first in `SEED_EXERCISES`. The public shim validates that
array, looks up only an explicit `preferId`, and otherwise returns `CORPUS[0]`. Although
`SelectionState.completed` is documented as future selector input, it is never read.

This explains both symptoms:

- a normal mount starts the Entry API exercise;
- remounting starts it again, while “Play again” does not even reselect—it restarts the
  already resolved object.

This is stale scaffolding, not acceptable production scheduling. The comments accurately
label it “deliberately dumb” and say the eventual selector will use learner information,
but the application now exposes a multi-exercise corpus and a session composer. The
temporary assumption (“the only exercise it has”) ceased to be true when the corpus grew.

### 2. Exercise completion is incorrectly treated as session completion

`useExerciseRunner` owns indices only within one exercise. Advancing beyond its last step
sets `isFinished`; `Leetype` converts that directly to `gameState = "finished"`, freezes
stats, calls `onSessionComplete`, and renders `ResultsCard`. Its replay handler calls
`runner.restart()` against the same `resolvedExercise`.

There is no state representing:

- the session deadline;
- the current corpus cycle;
- the current exercise in that cycle;
- completed exercise IDs for selection;
- the seed or shuffle order;
- transition from one exercise to the next.

The sink therefore exists exactly where the code puts it: after one exercise. This is a
boundary error. An exercise is a scheduling item within a LeetType scene; it is not the
scene's terminal state.

### 3. Duration exists in orchestration but is hidden from composition and ignored by LeetType

The catalogue entry has `fields: []` and `defaultConfig: {}`. Its rationale explicitly
rejects duration as a “second terminator.” However, `toSceneConfig()` supplies ten minutes
whenever an activity has no configured or default duration. Thus a composed LeetType
scene already has a duration—users simply cannot set it, and the component does not use
it to govern its exercise loop.

This creates two competing lifecycle truths:

| Layer              | Current terminal event               |
| ------------------ | ------------------------------------ |
| LeetType component | last step of the first exercise      |
| scene/orchestrator | implicit ten-minute fallback expires |

The catalogue comment argues against two terminators, but removing the duration field did
not remove scheduler duration. It only made one terminator invisible. The correct way to
have one terminator is to use the scene duration as the sole session term and demote
exercise completion to a transition.

### 4. The shipped patch shape is the old one-hunk overlay

The current `PatchSchema` stores header fragments and a `lineKinds` array parallel to the
rendered lines of `TypingBlock.source`. The contract explicitly limits the shape to one
hunk, one file, one step; omits old/new counts and file headers; and says that nothing
ingests real Git diff output. A corpus lint must reconstruct the engine's rendered source
to verify that the parallel array aligns.

This was a valid incremental rendering change: it reused engine context roles without
changing typing semantics. It is not a durable Git-diff content architecture. In
particular, it permits the authored source and its classification metadata to drift,
cannot faithfully represent multiple hunks or files, and makes canonical hunk coordinates
partial metadata rather than derived facts.

No separate canonical Git diff-hunk model was found in this repository. Therefore the
workspace has not partially migrated and accidentally retained a compatibility path; the
overlay is the only LeetType hunk representation. A migration must first define the
canonical replacement, then convert the corpus, then delete the overlay modules and
guidance.

## Root cause

The proximate causes are deterministic first-item selection and an exercise-level result
sink. The systemic cause is a mismatch between milestone-local boundaries:

- M20 intentionally deferred scheduling and shipped a single-value selection seam.
- Later seed work expanded the corpus but preserved the seam's fallback behavior.
- The component treated its only selected value as the whole session.
- The composer removed duration on the assumption that competency gating terminates a
  session, while the orchestrator continued to require and synthesize duration.
- LTY-PATCH optimized for adding diff visuals without engine work, then became the corpus
  authoring contract despite explicitly not being a Git diff ingestion model.

Tests pin each local decision but no end-to-end invariant asks: “During a duration-bounded
LeetType scene, can a player finish multiple, non-repeating exercises until the deadline?”
The absence of that invariant allowed individually tested components to form a broken
whole.

## Corrected product contract

### Session term

1. A LeetType session has a positive configured `durationMinutes`.
2. The authoritative term is `startedAt + duration`; the orchestrator's monotonic scene
   clock is preferred over a second component-owned wall clock.
3. Completing an exercise never completes the session while time remains.
4. At the deadline, the current keystroke/step may be finalized according to one explicit
   policy. The recommended policy is **hard deadline with atomic attempt accounting**:
   stop accepting input, record the attempt as incomplete (not escaped), and show aggregate
   session results. Do not begin another exercise when remaining time is zero.
5. “Play again” starts a new session term and a newly seeded order; it does not replay the
   same exercise unless the corpus has size one.

### Cyclic Fisher–Yates exercise scheduling

The intended algorithm is commonly called **Fisher–Yates** (not “Fischer random”). Model
it as a shuffle bag:

1. Take all eligible exercise IDs exactly once.
2. Apply Fisher–Yates with a session-scoped deterministic PRNG seed.
3. Consume the permutation in order.
4. When exhausted and time remains, increment the cycle and shuffle the full eligible set
   again using a seed derived from `(sessionSeed, cycle)`.
5. If the corpus has more than one item, prevent the final item of cycle _n_ from equaling
   the first item of cycle _n + 1_ (swap with another position deterministically).
6. Never reshuffle the unconsumed tail. React rerenders, retries, pause/resume, and layout
   changes must not alter the scheduled order.
7. Persist enough state with the live session to resume reproducibly: algorithm version,
   session seed, cycle number, current permutation, cursor, and current exercise/step.

This yields each eligible exercise once per period **P**, where P is one complete corpus
permutation, then cycles fairly until duration ends. It is a scheduling baseline, not a
claim that random order is pedagogically optimal. A future evidence-driven scheduler may
replace eligibility or ordering behind the same session-machine contract, but it must
retain termination, reproducibility, and no-starvation guarantees.

### Eligibility

“All possible exercises” means the validated production corpus, excluding fixtures and
quarantined/invalid candidates. An explicit deep link may constrain the first item for
preview or debugging, but it must not silently redefine a normal composed session. The
adversarial shell fixture must not enter user scheduling merely because it lives in the
same validated array today; production content and test fixtures need separate exports.

### Composer contract

LeetType must publish a duration field in the activity catalogue, using the same bounded
duration field contract as other duration-based activities. Its default must be explicit
rather than obtained from `FALLBACK_DURATION_MINUTES`. The composer review must display
that duration, and `toSceneConfig()` must preserve it as the scene lifetime.

The component boundary must receive authoritative timing information or a scene-lifecycle
signal. Passing only `{}` from `toSceneProps()` is insufficient. Avoid inventing a second
timer based solely on `Date.now()`; pause, resume, seeking, and test clocks must remain
consistent with orchestration.

### Completion and statistics

Separate the following events:

- `stepCompleted` / `stepRepeated` / `stepEscaped`;
- `exerciseCompleted` (select the next exercise);
- `sessionExpired` (the only normal terminal event);
- `sessionCancelled` and engine failure (abnormal terminal events).

Session statistics aggregate across exercises and cycles. Results must include at least
elapsed duration, exercises completed, steps completed, steps escaped, errors, assistance,
and the scheduling seed/version needed to replay a reported ordering defect. Per-exercise
stats may be retained for diagnostics without turning exercise completion into a UI sink.

## Canonical diff-hunk architecture

### Required model

Replace `TypingBlock.source + patch.lineKinds` with one canonical diff document whose
structure owns its text and roles together:

```text
DiffDocument
  files[]
    oldPath, newPath
    hunks[]
      oldStart, oldCount, newStart, newCount
      lines[]
        kind: context | deletion | addition
        text
        oldLineNumber?
        newLineNumber?
```

The typeable stream is derived from addition lines. Context and deletion lines project to
the existing engine context role. Rendered line numbers and hunk headers are derived from
the canonical counts and line sequence, not authored in a parallel array. Parse standard
unified diff input at the authoring/import boundary and validate coordinate/count
consistency there.

If the product deliberately wants one hunk per minimal step, enforce that as an exercise
authoring policy over the canonical model—not as a lossy storage type. This preserves the
ability to ingest, split, trace, and validate real diffs without maintaining a second
representation.

### Deprecation decision

Deprecate, migrate, then remove:

- `PatchSchema`, `PatchLineKindSchema`, and their inferred types;
- `TypingBlock.patch`;
- corpus-lint rules whose only purpose is keeping `source` and `lineKinds` aligned;
- generator guidance and seed modules that author the parallel overlay;
- renderer fallbacks that accept a short `lineKinds` tail;
- the prose claiming the overlay is the long-term “hunk shape.”

Do not support both authoring forms indefinitely and do not auto-detect them at runtime.
A build-time migration tool may read the legacy shape long enough to produce canonical
artifacts, but production schemas should have one representation after the corpus lands.
Plain non-diff typing steps may remain a distinct block kind if they are still a genuine
product requirement; they must not masquerade as incomplete diff hunks.

## State-machine specification

```text
unstarted
  └─ start → running(exercise, step, deadline, schedule)

running
  ├─ step repeat  → running(same exercise, same step, attempt + 1)
  ├─ step pass    → running(same exercise, next step)
  ├─ exercise end → running(next scheduled exercise, first step)
  ├─ deadline     → finished(aggregate stats)
  ├─ cancel       → cancelled
  └─ engine error → failed

finished
  └─ play again → unstarted(new seed and new deadline)
```

Deadline wins over exercise advancement when both are observed in the same update. This
priority prevents an exercise from being selected after the session has expired. State
transitions must be reducer/state-machine operations, not coordinated effects that can
observe a stale engine snapshot.

## Acceptance criteria

### Selection and cycling

- With a corpus of _N_ eligible exercises, the first _N_ completions contain each ID
  exactly once.
- With time remaining after _N_ completions, completion _N + 1_ begins cycle two.
- For _N > 1_, no cycle-boundary immediate repeat occurs.
- Equal seeds and event sequences produce equal orders; different seeds are not required
  to produce different orders for every pair, only to feed the specified PRNG.
- Pause/resume and component rerender do not change the remaining order.
- A one-item corpus loops safely until duration, without an infinite synchronous
  transition.

### Termination

- Finishing any non-final scheduled exercise does not render results or call session
  completion.
- The configured duration is visible and editable in the composer and is serialized into
  the scene.
- At deadline, input stops and session completion fires exactly once.
- No next exercise is selected after expiration.
- Replay creates a fresh schedule and term.

### Diff model

- Standard unified diff fixtures round-trip through parse and canonical serialization.
- Header counts and line-number projections are derived and validated.
- Addition text alone supplies typeable slots; context/deletion text never affects WPM,
  correctness, reveal, or assistance.
- Multi-file/multi-hunk input can be represented even if current authoring policy splits
  it into one-hunk steps.
- The production corpus contains no legacy `lineKinds` overlays when migration completes.

### Integration invariant

An integration test with a short virtual duration must complete at least two exercises,
observe two different IDs, cross a corpus cycle in a small synthetic corpus, and finish
only when the virtual scene clock expires. This is the missing test that would have caught
the current architecture.

## Migration sequence

1. **Name the lifecycle contract.** Add the session state-machine decision and authoritative
   clock boundary before changing UI behavior.
2. **Expose duration.** Add an explicit LeetType duration field/default and prove composer
   serialization. This removes the hidden fallback immediately.
3. **Introduce the scheduler.** Use an isolated, pure, seeded shuffle-bag API with property
   tests. Keep preview/deep-link selection separate.
4. **Lift exercise ownership to the session.** The session machine selects exercises;
   `useExerciseRunner` remains responsible only for steps within its current exercise.
5. **Move results to the duration boundary.** Aggregate per-exercise facts and emit normal
   completion once at expiry.
6. **Land the canonical diff model and parser.** Prove engine projections before corpus
   conversion.
7. **Migrate all seed exercises and generator documentation.** Review generated canonical
   output rather than maintaining runtime compatibility.
8. **Delete legacy selectors and overlays.** Remove `nextExercise()`'s ignored completion
   parameter, the default-first behavior, `TypingBlock.patch`, parallel-array lints, and
   obsolete LTY-PATCH guidance.
9. **Run the duration/cycle integration invariant.** Treat it as a release gate.

Steps 2–5 fix the user-visible sink and can ship before the diff migration. Steps 6–8 are
an authoring-model migration and should not be coupled to timing behavior in one risky
change. The target architecture is unified, but the rollout should remain bisectable.

## Decisions superseded by this review

- **“No duration because the gate terminates the run.”** Superseded: a gate resolves a
  step; it does not express the user's session term, and the scheduler already imposes a
  duration anyway.
- **“The shim picks the only exercise it has.”** Superseded: the corpus has multiple
  production exercises; first-item fallback is no longer a truthful temporary behavior.
- **“The last exercise step is the whole sequence.”** Superseded: the sequence is a
  duration-bounded series of exercises.
- **“`source + lineKinds` is the hunk shape.”** Superseded as a storage/authoring contract:
  it remains useful lineage for the engine projection but must give way to canonical diff
  structure.

The valid decisions that survive are the engine/render separation, one typing witness per
minimal step, baseline-relative gating, bundled reviewed corpus, and oracle-free runtime
scheduling. None requires deterministic first-item selection, an exercise sink, hidden
duration, or a parallel-array diff representation.
