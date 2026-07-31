// Shared Storybook fixtures for the LeetType components
// (`UI/Input/Components/Typing/*`). Kept local to this package rather than
// hoisted to `@some-ui/content`: that workspace is production scene/content
// data with an explicit "no source code" charter, and the bundled demo pool it
// does ship (`CHALLENGES`) is a flat set with no curriculum behind it - which
// is precisely the case these fixtures are *not* about.
//
// Not used by any production code path - `story-fixtures` only ever appears in
// `.stories.tsx` imports.

import type { Challenge, ChallengeCurriculum } from "@leetype/types/leetype"

const TARGET = "Implement a lock-free Treiber stack with AtomicPtr and CAS."

type Step = {
  id: string
  title: string
  description: string
  difficulty: Challenge["difficulty"]
  stage: ChallengeCurriculum["stage"]
  insight: string
  introduced: Array<string>
  reinforced: Array<string>
  objectives: Array<string>
  criteria: Array<string>
}

/**
 * The worked example from the Curriculum Decomposer prompt, as data: a dense
 * concurrency problem decomposed so each exercise removes exactly one source
 * of cognitive load. Ten rungs, ending on the original problem.
 */
const STEPS: Array<Step> = [
  {
    id: "treiber-01-ownership",
    title: "Ownership review",
    description:
      "Bind a heap value, hand it to a function, and observe that the original binding is no longer usable.",
    difficulty: "easy",
    stage: "remember",
    insight: "A move invalidates the source binding, at compile time.",
    introduced: ["move semantics"],
    reinforced: [],
    objectives: [
      "Explain why the second use of a moved value fails to compile",
    ],
    criteria: ["The value is used exactly once, and the program compiles"],
  },
  {
    id: "treiber-02-borrow",
    title: "Borrowing without moving",
    description:
      "Pass the same value to two functions by reference instead of by value.",
    difficulty: "easy",
    stage: "remember",
    insight: "A shared borrow lets a value be read without giving it up.",
    introduced: ["shared references"],
    reinforced: ["move semantics"],
    objectives: ["Choose between `&T` and `T` for a read-only parameter"],
    criteria: ["Both calls compile with no clone and no move"],
  },
  {
    id: "treiber-03-generic-struct",
    title: "A generic container",
    description:
      "Write a struct holding one value of an arbitrary type, with a constructor and an accessor.",
    difficulty: "easy",
    stage: "understand",
    insight: "A type parameter is decided by the caller, not the definition.",
    introduced: ["generic structs"],
    reinforced: ["shared references"],
    objectives: ["Declare and use a single type parameter"],
    criteria: ["The struct is instantiated at two different concrete types"],
  },
  {
    id: "treiber-04-option-take",
    title: "Implement Option::take",
    description:
      "Write a function that moves the value out of an `Option<T>`, leaving `None` behind.",
    difficulty: "medium",
    stage: "understand",
    insight:
      "`Option` is how Rust spells 'this slot may be empty' without null.",
    introduced: ["Option<T>", "mem::replace"],
    reinforced: ["move semantics", "generic structs"],
    objectives: ["Move a value out of a place you only hold `&mut` to"],
    criteria: [
      "The original slot is `None` afterwards",
      "No `unwrap` and no `clone`",
    ],
  },
  {
    id: "treiber-05-boxed-list",
    title: "A singly linked list with Box",
    description:
      "Build a push-only linked list where each node owns the next through `Box`.",
    difficulty: "medium",
    stage: "apply",
    insight:
      "`Box` gives a recursive type a finite size by putting the tail on the heap.",
    introduced: ["Box<T>", "recursive types"],
    reinforced: ["Option<T>", "generic structs"],
    objectives: ["Model `Option<Box<Node<T>>>` as 'maybe a rest of the list'"],
    criteria: ["Pushing three values yields three linked nodes"],
  },
  {
    id: "treiber-06-shared-ownership",
    title: "Shared ownership with Arc",
    description:
      "Hand the same immutable value to two threads and read it from both.",
    difficulty: "medium",
    stage: "apply",
    insight:
      "Two owners require a runtime count, which is what `Arc` is and `Box` isn't.",
    introduced: ["Arc<T>", "Send + Sync"],
    reinforced: ["Box<T>", "shared references"],
    objectives: ["Explain why `Box` cannot be shared across threads"],
    criteria: ["Both threads read the value and the program joins cleanly"],
  },
  {
    id: "treiber-07-atomic-ptr",
    title: "AtomicPtr basics",
    description:
      "Store a raw pointer in an `AtomicPtr`, load it back, and dereference it inside `unsafe`.",
    difficulty: "hard",
    stage: "analyze",
    insight:
      "An atomic makes the pointer's *store* indivisible; it says nothing about what it points at.",
    introduced: ["AtomicPtr", "unsafe", "Ordering"],
    reinforced: ["Arc<T>", "Box<T>"],
    objectives: [
      "Convert between `Box::into_raw` and `Box::from_raw` without leaking",
    ],
    criteria: [
      "The pointer round-trips and the allocation is freed exactly once",
    ],
  },
  {
    id: "treiber-08-cas",
    title: "Compare-and-swap",
    description:
      "Increment a shared counter using only `compare_exchange` in a retry loop.",
    difficulty: "hard",
    stage: "analyze",
    insight:
      "CAS turns 'read then write' into one step that can fail and retry.",
    introduced: ["compare_exchange", "retry loops", "ABA hazard"],
    reinforced: ["AtomicPtr", "Ordering"],
    objectives: [
      "Write a CAS loop that re-reads the current value on failure",
      "Say what a spurious failure is and why the loop tolerates it",
    ],
    criteria: ["Two threads incrementing 10_000 times each end at 20_000"],
  },
  {
    id: "treiber-09-push",
    title: "The push operation alone",
    description:
      "Implement only `push` on a stack whose head is an `AtomicPtr`, leaving `pop` unimplemented.",
    difficulty: "hard",
    stage: "integrate",
    insight:
      "Push is a CAS loop over 'point my new node at the head I just read'.",
    introduced: [],
    reinforced: ["compare_exchange", "AtomicPtr", "Box<T>", "retry loops"],
    objectives: ["Order the node's own initialization before the CAS"],
    criteria: ["Concurrent pushes lose no nodes"],
  },
  {
    id: "treiber-10-treiber-stack",
    title: "Lock-free Treiber stack",
    description:
      "Complete the stack: `push` and `pop` over an `AtomicPtr` head, with no locks and no leaks.",
    difficulty: "hard",
    stage: "master",
    insight: "Nothing in this problem is new any more - only its assembly is.",
    introduced: [],
    reinforced: [
      "compare_exchange",
      "AtomicPtr",
      "ABA hazard",
      "unsafe",
      "Arc<T>",
    ],
    objectives: ["Assemble push and pop into one lock-free data structure"],
    criteria: [
      "Interleaved concurrent push/pop neither loses nor duplicates a value",
      "Every popped node is freed exactly once",
    ],
  },
]

/** A decomposed, Rust-only curriculum - the shape the picker presents as a ladder. */
export const TREIBER_CURRICULUM: Array<Challenge> = STEPS.map(
  (step, index): Challenge => ({
    id: step.id,
    title: step.title,
    description: step.description,
    difficulty: step.difficulty,
    mode: index >= 6 ? "algorithm" : "data-structure",
    tags: ["rust", "concurrency", "lock-free"],
    levelRequired: 1,
    codePaths: { rust: `/leetype/samples/${step.id}.rs` },
    curriculum: {
      stage: step.stage,
      step: index + 1,
      totalSteps: STEPS.length,
      insight: step.insight,
      learningObjectives: step.objectives,
      conceptsIntroduced: step.introduced,
      conceptsReinforced: step.reinforced,
      dependsOn: index === 0 ? [] : [STEPS[index - 1]!.id],
      completionCriteria: step.criteria,
      targetProblem: TARGET,
    },
  })
)
