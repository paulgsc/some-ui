// ═══════════════════════════════════════════════════════════════════════════
//  CANON I — The Unobservable Learner
//  A Formal Theory of Adaptive Instruction under Latent State,
//  Bounded Persistence, and Absent Oracles
// ═══════════════════════════════════════════════════════════════════════════

#set document(
  title: "The Unobservable Learner",
  author: "some-ui Adaptive Learning Working Group",
)
#set page(paper: "a4", margin: 2.5cm, numbering: "1")
#set text(size: 10.5pt, lang: "en")
#set par(justify: true, leading: 0.68em)
#set heading(numbering: "1.1")
#set list(indent: 0.3em)
#set enum(indent: 0.3em)

// ── Local styling primitives ─────────────────────────────────────────────
//
// Numbering of Definitions / Axioms / Propositions / etc. is done BY HAND
// (the string passed as `num`), not via Typst counters, for the same reason
// the two sibling canons in this directory do it: the numbers are stable
// citation anchors across future amendments (§13), and this document expects
// to be amended far more often than either of them.

#let canon(kind, num, body, name: none) = [
  #v(0.55em)
  #block(inset: (left: 0pt))[
    *#kind #num.* #if name != none [_#name._ ] #body
  ]
  #v(0.35em)
]

#let definition(num, body, name: none) = canon("Definition", num, body, name: name)
#let axiom(num, body, name: none) = canon("Axiom", num, body, name: name)
#let proposition(num, body, name: none) = canon("Proposition", num, body, name: name)
#let theorem(num, body, name: none) = canon("Theorem", num, body, name: name)
#let lemma(num, body, name: none) = canon("Lemma", num, body, name: name)
#let corollary(num, body, name: none) = canon("Corollary", num, body, name: name)
#let remark(num, body, name: none) = canon("Remark", num, body, name: name)

#let proof(body) = [
  #v(0.15em)
  #block(inset: (left: 1em))[_Proof._ #body ∎]
  #v(0.35em)
]

#let rule(name, body) = [
  #v(0.4em)
  #block(
    inset: 8pt,
    stroke: 0.4pt,
    width: 100%,
  )[
    #text(size: 9.5pt)[*#name*]
    #v(0.2em)
    #text(size: 9.5pt)[#body]
  ]
  #v(0.4em)
]

// ═══════════════════════════════════════════════════════════════════════════
// FRONT MATTER
// ═══════════════════════════════════════════════════════════════════════════

#align(center)[
  #v(1.5cm)
  #text(size: 22pt, weight: "bold")[The Unobservable Learner]
  #v(0.4em)
  #text(size: 13pt, style: "italic")[
    A Formal Theory of Adaptive Instruction under Latent State,\
    Bounded Persistence, and Absent Oracles
  ]
  #v(1.2em)
  #text(size: 11pt)[Canon I of the Adaptive Learning Architecture]
  #v(0.15em)
  #text(size: 10pt)[
    Governing `@some-ui/honeycomb` · `@some-ui/leetype` · `@some-ui/topik` ·\
    `@some-ui/interview` · `pedagogy/` · and every tutor skill
  ]
  #v(1em)
  #text(size: 9.5pt)[Version 1.1 --- 2026-08-16]
  #v(2cm)
]

#block(inset: (left: 1.5em, right: 1.5em))[
  *Abstract.* Four learning surfaces in this repository --- a Hangul typing
  game, a code-typing trainer, a TOPIK study session, and a mock-interview
  recorder --- were each authored as a distinct application, and each
  independently arrived at the same structural failure: the quantity the
  product exists to move (what the learner knows) is nowhere represented, and
  in its place sits a scalar the product happens to have counted. This
  document does not begin by proposing a learner model and specifying its
  fields. It begins one level up, in a *Prolegomenon* that treats the choice
  of mathematical object as the primary result: it names the recurring pain,
  strips it to a computational class, eliminates six candidate abstractions
  (ordered syllabus, unlock DAG, scalar difficulty controller, spaced-repetition
  scheduler, end-to-end reinforcement learner, oracle-in-the-loop tutor)
  against that pain, and only then *derives*, rather than posits, that the
  system's internal state must be a *belief about a hidden process* and that
  any such system must factor into exactly five transformations. The canon
  then establishes the discipline's defining peculiarity, which distinguishes
  it from the estimation-and-control setting of this directory's sibling canon
  *The Unsettled Surface*: here the actuator and the sensor are *the same
  object*. An exercise both teaches and measures, and Theorem 4.2 proves that
  no exercise maximizes both at once --- so every adaptive system is
  continuously spending one against the other, and a system that does not do
  so explicitly is doing so unaccountably. From that duality, and from three
  hard exogenous constraints (no server, no background process, no guaranteed
  oracle), the remaining architecture is forced: belief must be a versioned
  *population prior plus sparse deviation plus bounded evidence ring*
  (Theorem 5.1); forgetting must be applied *lazily at read time* because a
  static client has no process in which to apply it eagerly (Theorem 5.3);
  no scheduling decision may depend on a remote model (Theorem 8.1); and every
  persisted artifact must be reconstructible-with-degradation from priors
  alone, because the storage is evictable and unsynced (Theorem 7.2). The
  model is then grounded, defect by defect, against the present source of
  `crates/hangul-game-core`, `packages/ui/{honeycomb,leetype,topik,interview}`,
  `pedagogy/`, and the tutor skills --- showing that the hint-visibility gate,
  the uniform random draw, the silent quota-failure swallow, and the
  diagnostic re-run at every session open are not four unrelated quirks but
  four theorems of this canon, three of which were already right for reasons
  nobody had written down.
]

#v(0.6em)
#block(inset: (left: 1.5em, right: 1.5em))[
  *Status of this document.* This is not a design proposal, and it is not a
  specification of a module to be built. It is filed as the reference from
  which every adaptive-learning decision in this repository is *derived*, and
  it is filed *before* the source it governs exists, deliberately. The
  motivating complaint --- that we are building the plane while flying it ---
  is a complaint about ordering, not about quality: each of the four surfaces
  is individually well-built, and each is individually unable to become
  adaptive, because adaptivity is a property of a state space none of them
  has. The remedy is not to refactor four applications. It is to fix the state
  space first, here, and let the four applications become renderers of it.
  Consequently: *no source change to a governed workspace should be authored
  against a user story until that story has been triaged against this canon.*
  A patch that cannot be traced to a numbered result below is a happy-path
  patch, and §10 exhibits four of them already shipped.
]

#v(0.6em)
#block(inset: (left: 1.5em, right: 1.5em))[
  *What kind of object this is.* The artifact maintained here is a *theory*,
  and its maintenance discipline is *theory revision*: the code is disposable
  and re-derived, while the canon is the durable object a falsifying
  observation revises. The design objective throughout is not "the true model
  of learning" --- human learning is unboundedly complex and no such model is
  available to a two-person project with no telemetry --- but the *minimal
  sufficient state space*: among all state spaces capable of expressing the
  pedagogical objective $J$ of §6 and proving the properties of §5--§9, the one
  of least informational content, i.e. the smallest model from which the
  implementation is uniquely derivable. This matters more here than in the
  sibling canons, because pedagogy is a field with an unlimited appetite for
  additional state: every additional latent trait is defensible in isolation,
  and every one of them manufactures new evidence requirements the observation
  channel of §3 cannot satisfy. The Prolegomenon below conducts that search in
  the open, before any notation is spent, and §12 states in advance what would
  refute the result.
]

#v(0.6em)
#block(inset: (left: 1.5em, right: 1.5em))[
  *Relation to the sibling canons.* Three canons now live in `docs/canon/`,
  and they are layered rather than independent. *The Unsettled Surface*
  (`dom-state-estimation-canon.typ`) establishes the general
  observe/estimate/plan/act factorization for maintaining an invariant over a
  process one neither controls nor fully observes; §P.4 below inherits its
  Theorem P.2 and extends it by one transformation, for a reason specific to
  this domain. *The Single-Glyph Ceiling*
  (`hangul-progression-canon.typ`) fixes the *content-model algebra* ---
  stimulus, answer sequence, content domain --- from which the exercises of §4
  draw their material; where this canon says "content", that canon says what
  the content is made of. This document owns exactly one thing neither of them
  owns: the learner.
]

#pagebreak()
#outline(title: "Contents", indent: auto)
#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[Prolegomenon --- Why This Object]
// ═══════════════════════════════════════════════════════════════════════════

A model earns its notation only after it has eliminated the alternatives. The
numbered canon (§1 onward) proves propositions about one specific mathematical
object; this Prolegomenon addresses the prior question the proofs cannot reach
from inside themselves --- *why is this the right object?* --- because an
architecture derived here should feel *inevitable* rather than *chosen*. A
reader who disagrees should be able to attack the document *here*, at the
choice of object, rather than quarrel with a definition after the object is
already fixed.

#heading(level: 2, numbering: none)[P.0 · Phenomenology (the pain, stated without a cure)]

Before any abstraction, the recurring field failures, named without proposing
a fix and each paired with the tacit assumption it falsifies. Every item below
is observed in this repository's present source or in its authors' reported
experience of using it; none is hypothetical.

- *The pile-up.* Each new pedagogical intention --- guided tutorial, timed
  assessment, listening drill, review of past mistakes --- arrives as a new
  component tree rather than as new data. The count of screens grows linearly
  in the count of user stories, and the branching inside them grows worse.
  --- _Assumes: a difference in how the learner should be treated is a
  difference in what should be rendered._
- *Vocabulary that is passable but not producible.* A learner clears every
  single-glyph challenge and remains unable to type a word, because the thing
  measured (recognition of a glyph) was silently taken as a proxy for a
  distinct, unmeasured thing (motor recall of an ordered sequence). --- _Assumes:
  one competence per item; competences do not decompose._
- *The uninformative miss.* A learner misses the same item five times and the
  system records five identical failures, though the five plausible causes ---
  ignorance, motor awkwardness, confusion with a neighbour, inattention,
  fatigue --- imply five different interventions. --- _Assumes: a response is
  evidence about the item it was collected on._
- *Amnesia between sessions.* Competence estimated in one session is
  reconstructed from scratch in the next, by re-running a diagnostic, or is
  not reconstructed at all. --- _Assumes: what was learned about the learner is
  cheaper to re-derive than to keep._
- *Monotone progress.* Score, XP, level, and the set of completed items only
  ever increase. A learner who has not opened the application in three months
  returns to a system that believes they are exactly as expert as when they
  left. --- _Assumes: knowledge does not decay, or decay is not the system's
  problem._
- *Silent disappearance.* The single most consequential learner behaviour ---
  not returning --- produces no observation at all, and therefore cannot
  influence anything. --- _Assumes: the observation channel carries what
  matters._
- *Adaptation that cannot be undone.* Where adaptation exists, it is a latch:
  a threshold is crossed, a flag flips, and nothing can flip it back within
  the session. --- _Assumes: adaptation is an event, not a control loop._
- *Incomparable competence.* Two surfaces measure the same underlying skill
  (typing fluency; Korean vocabulary) in units that cannot be compared, and
  neither can inform the other. --- _Assumes: a measurement means the same
  thing wherever it was taken._

Each symptom is shown below to be not an exceptional case to be
special-cased, but evidence that the problem was embedded in a state space too
small to be correct --- an *ontological* error the way a type error is a
*syntactic* one.

#heading(level: 2, numbering: none)[P.1 · Computational characterization]

Strip the subject matter away --- Korean, Rust, algorithms, interviews. What
remains is: *choose a sequence of interactions with a process whose state you
cannot read, in order to drive that state toward a target, where each
interaction both perturbs the state and returns a noisy, confounded
measurement of it, and where the process may unilaterally terminate the
interaction at any time.*

This is not curriculum sequencing (there is no fixed order to schedule; the
order is the output, not the input). It is not search (the objective is
defined over a state you cannot evaluate). It is not recommendation (the
target is not the learner's revealed preference; a well-chosen exercise is
frequently the one they would not choose). It is not testing (a test estimates
without intending to change what it estimates; here every measurement is also
an intervention).

It is the conjunction of three classical problems: *state estimation* over a
partially observable, non-stationary process; *experiment design*, because the
measurements are ours to choose and differ enormously in informativeness; and
*control under a terminal absorbing state*, because the learner can leave.
Naming the class is all P.1 claims. That estimation is *forced* rather than
merely available is argued in P.3 and must not be assumed here.

#heading(level: 2, numbering: none)[P.2 · Candidate models, and why six are rejected]

The falsifiable core of this document. Each row is an object capable, on its
face, of modelling "an app that adapts to a learner"; the verdict column is
the attack the pain of P.0 makes on it. Only the object surviving every attack
is carried into §1.

#table(
  columns: (3.6cm, 2.1cm, 1fr),
  stroke: 0.4pt,
  inset: 6pt,
  [*Candidate object*], [*Verdict*], [*Decisive objection*],

  [*Ordered syllabus* --- content as a linear sequence with a cursor],
  [Rejected],
  [The cursor is a position in the *content*, not a claim about the *learner*.
   It cannot represent decay (a cursor never moves backwards for reasons other
   than a repeat), cannot represent partial competence, and cannot represent
   two learners at the same position for different reasons. Present in
   `packages/ui/topik` (a `{batch, message, question}` cursor) and in
   `pedagogy/` (a checklist), and in both places the pain of P.0's "monotone
   progress" follows immediately.],

  [*Unlock DAG / skill tree* --- prerequisite graph with boolean gates],
  [Partly adopted],
  [The *graph* is retained and becomes Definition 1.2: prerequisite structure
   is real, is finite, and is the mechanism by which evidence propagates
   (Prop. 5.2). The *boolean gate* is rejected: a gate is an absorbing binary
   with no uncertainty and no decay, so it cannot express "probably knows,
   last confirmed in March", which is the modal state of every real learner.
   Present as `HashSet<String>` in the game modes and as an XP threshold in
   `packages/ui/leetype`.],

  [*Scalar difficulty controller* --- one dial, moved by a streak],
  [Rejected],
  [A single global scalar is a one-dimensional quotient of a per-concept
   belief; Theorem 6.1 proves that no policy distinguishing two concepts can
   factor through it. Worse, because the dial is shared, evidence collected on
   one item is gathered under conditions set by performance on others,
   destroying the independence the estimator of §5 needs (Axiom 3.2). This is
   the present model in `crates/hangul-game-core` and it is the single
   most load-bearing thing this canon replaces.],

  [*Spaced-repetition scheduler* --- SM-2 / Leitner / FSRS over items],
  [Partly adopted],
  [The *forgetting curve* and the *interval as a function of stability* are
   retained wholesale (Def. 5.4, Thm. 5.3): they are the best-evidenced
   component available and cost nothing to adopt. What is rejected is
   scheduling as the *whole* policy. A pure repetition scheduler assumes items
   are independent, assumes the only decision is *when*, and has no
   representation of *how* an item should be presented --- so it cannot
   express the guided/assessed distinction that P.0's first symptom is
   entirely about, and cannot trade measurement against instruction (Thm. 4.2)
   because it does not know it is measuring.],

  [*End-to-end reinforcement learner* --- policy learned from raw telemetry],
  [Rejected],
  [Not on principle --- §6 is explicitly written so that a learned policy can
   later replace the handwritten one without touching anything else --- but on
   *sample budget*. An RL policy over raw events must discover the concept
   structure, the forgetting dynamics, and the reward attribution from data;
   the available data is one learner, no server, and no logging pipeline.
   Adopting it now would mean shipping a model that cannot be trained,
   inspected, tested, or replayed. It is admitted in §6 as a *substitution*
   for the policy, never as the *object*.],

  [*Oracle-in-the-loop tutor* --- a language model decides what comes next],
  [Rejected],
  [Makes every scheduling decision depend on a remote, non-deterministic,
   rate-limited, unversioned service that the deployment target (a static
   client, §7) cannot assume. Theorem 8.1 shows this is not merely a cost
   concern: the continuation term of the objective (Axiom 6.1) makes latency
   and unavailability *pedagogical* failures, not infrastructural ones. The
   oracle is re-admitted, in strictly bounded roles, as a *content author* and
   a *sensor* (§8) --- never as the owner of state or policy.],

  [*Partially observable, non-stationary latent-state process over a finite
   concept graph, estimated then controlled, where the control action is
   simultaneously the measurement instrument*],
  [*Accepted*],
  [Survives every objection above. It presumes neither observability of
   competence, nor stationarity, nor independence of items, nor a cooperative
   oracle, nor a sample budget it does not have --- while retaining the
   prerequisite graph from the unlock DAG, the forgetting curve from the
   repetition scheduler, and a clean seam at which a learned policy may later
   be substituted. It is the *smallest* object retaining what works and
   discarding every assumption P.0 falsifies.],
)

#remark("P.0")[
  The accepted object is not the *most expressive* one. A full cognitive
  model --- working-memory load, interference, affect, motivation ---
  is strictly more expressive and is what the education literature would
  recommend. It is rejected on the minimal-sufficiency criterion stated in the
  front matter: each additional latent trait requires evidence the channel of
  §3 cannot supply, and an unidentifiable parameter is not a modelling
  refinement but a free variable the implementation must nonetheless carry,
  serialize, migrate, and defend. Expressiveness past the point of
  identifiability is pure liability.
]

#heading(level: 2, numbering: none)[P.3 · The necessity of estimation (derived, not defined)]

The belief object of §5 is not a design decision. It is forced, in five steps,
by the accepted object alone:

#proposition("P.1", name: "Estimation is forced")[
  Any adaptive learning system must maintain internal state that is a
  *hypothesis* about the learner, never a *record* of the learner.
]

#proof[
  (1) The quantity the system exists to move --- what the learner knows --- is
  not a field of any message the system receives; the system receives
  keystrokes, timings, selections, and silence. (2) Every such observation is
  consistent with many distinct competences (Axiom 3.1), so no observation
  determines the quantity. (3) The quantity changes between observations, both
  upward (study elsewhere) and downward (forgetting), by processes the system
  does not witness (Axiom 2.2), so even a once-correct record decays into a
  claim. (4) Therefore no structure the system maintains can *be* the
  learner's competence --- it can only be a claim about it, refutable by the
  next response. (5) A refutable, evidence-derived, decaying claim about a
  hidden process *is* an estimate, and the discipline maintaining it *is*
  state estimation. The belief is thus obtained, not selected.
]

Read in the reverse of the usual direction: one does not *choose* to model the
learner probabilistically and then justify the choice against simpler
alternatives; one observes that non-observability plus non-stationarity
*leaves no other object available*. A counter, a cursor, and a completed-set
are not simpler learner models --- they are learner models that have
implicitly asserted the observation was the state.

#heading(level: 2, numbering: none)[P.4 · The five transformations (a theorem, not a diagram)]

The sibling canon *The Unsettled Surface* proves (its Theorem P.2) that any
system maintaining an invariant over an environment it neither controls nor
fully observes must factor into four logically distinct transformations:
channel, estimator, planner, actuator. That result is inherited here without
re-derivation. This domain requires exactly one more, for a reason worth
stating precisely, because it is the whole difficulty of the field:

#theorem("P.2", name: "Mandatory factorization, with instrument")[
  Any adaptive learning system must contain five logically distinct
  transformations --- an *instrument* mapping (content, policy vector) to a
  concrete exercise; a *channel* turning learner behaviour and its absence into
  evidence; an *estimator* folding evidence into a maintained belief; a
  *policy* mapping belief to the next instrument configuration; and a
  *renderer* presenting the exercise --- and no two may be collapsed without
  forfeiting a result proved in §3--§9.
]

#proof[
  The five are pairwise irreducible.
  *Instrument $!=$ policy:* the policy chooses *what should happen* given a
  belief; the instrument determines *what that costs in evidence*, and by
  Theorem 4.2 the two objectives it serves are in tension, so a policy that
  cannot separately name the exercise it is configuring cannot make the
  trade-off it is required to make.
  *Instrument $!=$ renderer:* the same exercise is legitimately presented on a
  hex grid, in a code editor, as a flash card, or as audio, and Proposition 9.1
  shows these differ in nuisance latency by more than the effect the estimator
  is trying to detect; collapsing them makes every timing observation
  incomparable across surfaces (P.0's last symptom).
  *Channel $!=$ estimator:* evidence arrives confounded (Axiom 3.1), censored
  (Prop. 3.2), and delayed; recovering a coherent belief requires a fold that
  applies decay by timestamp (Thm. 5.3), which the channel --- which cannot see
  the belief --- is unable to perform.
  *Estimator $!=$ policy:* the belief is provisional and objective-agnostic
  (Def. 2.4), whereas the next exercise is a function of an externally declared
  pedagogical objective $J$ (Def. 6.2); folding $J$ into the estimator makes
  the persisted state invalid the moment the pedagogy changes, which
  Theorem 6.2 shows is fatal given that the pedagogy is precisely the part
  expected to change most.
  *Renderer $!=$ channel:* the renderer must be replaceable without
  invalidating persisted belief; if the renderer is the channel, then every
  visual change is a silent change to the measurement apparatus.
]

#remark("P.1", name: "Why the fifth transformation exists")[
  In the DOM setting of *The Unsettled Surface*, the actuator and the
  observation channel are distinct organs acting on distinct sides of the
  system: one writes, the other reads, and the canon's Axiom 3.5 exists
  precisely to stop the writes from being misread as evidence. Here that
  separation is *unavailable in principle*. The only way to act on a learner
  is to give them something to do, and the only way to observe a learner is to
  watch them do something. The exercise is one object playing both roles at
  once. The instrument is therefore not "the actuator, renamed" --- it is the
  place where the field's central conflict is localized, and §4 is the section
  that pays for it.
]

#heading(level: 2, numbering: none)[P.5 · Scope, and what is deliberately excluded]

Stated up front so that §12's falsifiers are not confused with known gaps:

- *Multi-learner, social, and comparative mechanics* are out of scope. They
  require a server (§7 forbids one) and their pedagogical value is contested.
- *Affect and motivation as modelled latent variables* are out of scope; only
  their behavioural shadow, continuation (Axiom 6.1), is modelled, because
  only that is observable.
- *Content authoring* is out of scope as a process, though §8 fixes the
  boundary at which authored content enters and what it must carry.
- *Assessment validity in the psychometric sense* --- whether the exercises
  measure what they claim --- is out of scope as a research question, but §12
  names it as the canon's largest standing risk.
- *Curriculum authorship* --- which concepts exist and how they depend on each
  other --- is out of scope; §1 fixes the shape of that artifact and requires
  it, but this canon does not author it.

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= The Domain: Concepts, Structure, and Identity
// ═══════════════════════════════════════════════════════════════════════════

Everything below is stated relative to a fixed subject matter. This section
fixes what a subject matter *is*, and establishes the one property of it that
the whole architecture rests on: that it is finite and enumerable in advance.

#definition("1.1", name: "Concept, concept space")[
  A *concept* is a unit of competence about which the system is willing to hold
  a separate belief and about which an exercise can supply evidence. The
  *concept space* $cal(K)$ is the finite set of concepts for a given subject
  matter. Each $k in cal(K)$ carries a stable identifier $"id"(k)$ (Def. 1.3).
]

The two criteria in that definition are jointly necessary and are the test for
whether a proposed concept is real. "Korean" is not a concept (no exercise
supplies evidence about it as such). "The particle 은/는 in contrast with
이/가" is a concept. "Recognises the glyph ㅃ" and "can type ㅃ under time
pressure" are *two* concepts, not one, and P.0's second symptom is exactly the
consequence of having conflated them.

#definition("1.2", name: "Curriculum graph")[
  The *curriculum graph* is the pair $(cal(K), prec)$ where $k_1 prec k_2$
  asserts that competence at $k_1$ is a prerequisite for competence at $k_2$.
  $prec$ is a strict partial order; its transitive reduction is the artifact
  actually authored.
]

#axiom("1.1", name: "Finite closure")[
  For every subject matter this system addresses, $cal(K)$ is finite, known in
  advance of any learner interaction, and does not grow in response to learner
  behaviour.
]

#remark("1.1", name: "The load this axiom bears, and its price")[
  Axiom 1.1 is the single most consequential assumption in this document and
  the one most likely to be wrong at the edges, so it is stated as an axiom
  rather than smuggled in. It is what makes a serverless architecture viable
  at all: it converts "remember everything the learner did" into "hold one
  number per concept", and $|cal(K)|$ is in the hundreds to low thousands for
  every domain here (jamo and their combinations; TOPIK grammar points and
  graded vocabulary; the CLRS/DSA concept inventory; Rust's ownership
  progression). The price is paid honestly in §12: the axiom is *false* for
  open-ended competences such as "explains an unfamiliar design trade-off
  clearly", and any user story requiring those is outside this canon until it
  is amended.
]

#definition("1.3", name: "Concept identity")[
  $"id"(k)$ is a stable string identifier, assigned once, never reused, and
  never derived from the concept's position, display name, or content. Content
  revisions may change a concept's exercises, wording, difficulty, and
  prerequisites; they may not change its identifier.
]

#theorem("1.1", name: "Identity is a precondition for persistence")[
  If concept identifiers are derived from content (index, title, file path,
  ordinal), then any content revision orphans an unbounded fraction of
  persisted belief, and the system is indistinguishable from one with no
  persistence at all.
]

#proof[
  Let $delta$ be persisted deviations keyed by derived identifiers (Def. 5.3).
  A content revision that inserts one item at position $i$ shifts every
  ordinal $> i$; a revision that retitles an item changes its title-derived
  key. In both cases the lookup for concept $k$ after revision returns either
  nothing (belief silently reset to prior) or the belief of a *different*
  concept (belief silently corrupted). The first case is equivalent to
  discarding state; the second is strictly worse than discarding it, since the
  policy of §6 will act confidently on a mismatched belief. Since revisions are
  expected --- content is versioned and shipped with the app (Axiom 1.2) ---
  the loss is not a rare event but the steady state.
]

#axiom("1.2", name: "Content ships, state persists")[
  Content --- concepts, exercises, prerequisite edges, difficulty parameters,
  reference profiles --- is a versioned build artifact shipped with the
  application and is never written at runtime. Belief is written at runtime and
  is never shipped. The two have independent lifecycles, and every belief
  record names the content version under which it was formed.
]

#proposition("1.1", name: "The present surfaces instantiate Def. 1.1 implicitly and badly")[
  Each governed workspace already has a de facto concept space, none of which
  satisfies Def. 1.3.
]

#proof[
  By exhibition. `crates/hangul-game-core` uses the jamo glyph itself as
  `identity: String` --- stable, but conflating the recognition and production
  competences of Remark 1.1 into one key, and scoped to a single content
  domain. `packages/ui/leetype` keys `SolveRecord` by `challengeId`, stable,
  but holds no concept below the granularity of a whole challenge, so
  "understands union-find" is not addressable. `packages/ui/topik` has no
  identifier at all below the file key: competence is a `score` integer over a
  `{batch, message, question}` cursor, all three components of which are
  positional and therefore violate Def. 1.3 by construction. `pedagogy/`
  identifies concepts by heading text in a markdown checklist. In no case does
  a concept identifier survive a content revision by design rather than by
  luck.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Learner: Latent State
// ═══════════════════════════════════════════════════════════════════════════

#definition("2.1", name: "Latent learner state")[
  The learner's state at time $t$ is
  $ S_t = ( (mu_t (k))_(k in cal(K)), z_t ) $
  where $mu_t (k) in [0,1]$ is the true probability that the learner would
  respond correctly to a canonical exercise on concept $k$ presented at time
  $t$ under reference conditions, and $z_t$ collects learner-global quantities
  (fatigue, engagement, input fluency) that modulate responses without being
  about any particular concept.
]

The phrase *under reference conditions* is doing necessary work: without it,
$mu_t (k)$ is not a property of the learner at all, since the same learner
answers the same item differently when hinted, hurried, or tired. Reference
conditions are fixed by the policy vector of Definition 4.2 at a designated
neutral valuation; every non-reference observation must be corrected toward it
before it can update a belief about $mu$ (Prop. 9.1).

#axiom("2.1", name: "Non-observability")[
  $S_t$ is never available to the system. No message the system receives
  contains $mu_t (k)$ or $z_t$; only behaviour, and the absence of behaviour,
  is received.
]

#axiom("2.2", name: "Non-stationarity")[
  $S_t$ changes between observations, in both directions, by processes the
  system does not witness: forgetting decreases $mu$ monotonically in elapsed
  time absent rehearsal; study, exposure, and use elsewhere increase it
  without notice.
]

#axiom("2.3", name: "Endogeneity")[
  Every observation the system collects also changes what it is observing.
  Presenting an exercise on $k$ alters $mu(k)$ (by retrieval practice, by
  exposure to the answer, or by inducing fatigue in $z$), and the alteration
  is not small relative to the effect the observation is used to detect.
]

#remark("2.1", name: "Axiom 2.3 is where this canon parts company with its siblings")[
  *The Unsettled Surface* contains an axiom (its 3.5) whose purpose is to stop
  the system's own writes from being misread as evidence --- there, measurement
  disturbance is a *defect to be excluded*. Here it cannot be excluded, because
  it is the product. The system exists to change $mu$; the only way it can is
  by doing the very thing that also measures $mu$. Every theorem in §4 is
  downstream of this axiom.
]

#proposition("2.1", name: "A score is not a state")[
  No scalar accumulated over responses --- score, streak, XP, accuracy,
  words-per-minute, count correct --- is a sufficient statistic for $S_t$, and
  no policy over such a scalar can distinguish two learners requiring
  different interventions.
]

#proof[
  Let learners $A$ and $B$ have completed the same number of exercises with the
  same number correct, $A$ failing only on concept $k_1$ and $B$ failing
  only on $k_2$, with $k_1 != k_2$. Every accumulator named is a function of the
  counts alone and is therefore identical for $A$ and $B$, while the correct
  next exercise differs (it is about $k_1$ for $A$ and $k_2$ for $B$). A policy
  is a function of the state it is given; a function cannot return two values
  on equal inputs. Hence no such policy exists.
]

#corollary("2.1")[
  `GameStats { score, current_streak, best_streak, total_correct, total_missed }`
  (`crates/hangul-game-core`), `PlayerProgress { xp, level }`
  (`packages/ui/leetype`), and `ActiveSessionState.score`
  (`packages/ui/topik`) are, individually and jointly, incapable of supporting
  adaptation. This is not a criticism of their implementations, which are
  correct as *displays*. It is the observation that the display was mistaken
  for the model.
]

#proposition("2.2", name: "Completion is not a state either")[
  A set $C subset.eq cal(K)$ of "completed" concepts, with membership granted
  on a qualifying response and never revoked, cannot express (i) partial
  competence, (ii) uncertainty, or (iii) decay; and its induced policy ---
  "draw from $cal(K) without C$" --- provably stops adapting exactly when
  adaptation begins to matter.
]

#proof[
  (i) and (ii) are immediate: $C$'s indicator has codomain $\{0,1\}$ and
  carries no second moment. (iii): membership is granted by a monotone
  operation and there is no revocation rule, so $C$ is non-decreasing in $t$
  while $mu(k)$ is not (Axiom 2.2); hence for any $k$ admitted at time $t_0$
  and unpractised thereafter, $|C| $ and $mu(k)$ diverge without bound in
  probability as $t$ grows. For the policy claim: the draw is uniform over
  $cal(K) without C$, so all not-yet-completed concepts are equiprobable
  regardless of how nearly complete each is; the learner one response away from
  competence on $k_1$ and hopeless on $k_2$ receives them at equal rates,
  which is the definition of not adapting.
]

#corollary("2.2")[
  `CompletionMode.completed: HashSet<String>` and
  `VocabularyMode.completed: HashSet<String>` are instances of $C$. So is the
  checklist in `pedagogy/README.md`, and so is `ALGORITHM_UNLOCK_LEVEL` in
  `packages/ui/leetype`, which is $C$ quantized to a single threshold.
]

#proposition("2.3", name: "History is not a state")[
  A buffer of the most recent $N$ interactions is not a sufficient statistic
  for $S_t$ for any finite $N$, and cannot be made one by increasing $N$ within
  any storage budget of §7.
]

#proof[
  Fix $N$ and let a learner practise concepts $cal(K)_1$ exclusively for the
  last $N$ interactions, having demonstrated competence at $k in cal(K)
  without cal(K)_1$ before that window. The buffer contains no evidence about
  $k$; a system whose state is the buffer must therefore treat $k$ as
  unobserved, i.e. as prior, discarding a demonstrated result. Increasing $N$
  postpones but does not remove the boundary, since $N$ is bounded by the
  storage budget while elapsed time is not. Note also that the failure is not
  symmetric with forgetting: forgetting is *modelled* decay toward the prior at
  a rate that depends on demonstrated stability, whereas window eviction is
  *unmodelled* collapse to the prior at a rate that depends on unrelated
  activity.
]

#remark("2.2")[
  Prop. 2.3 refutes a specific and attractive proposal: that a small sliding
  window of recent question-answer pairs is sufficient, because a competent
  reader of that window --- human or model --- can infer everything relevant.
  The inference step is not the problem; the window is. What survives of the
  proposal is exactly its good half, and it survives as Definition 5.5: a
  bounded evidence ring is retained, not as the state, but as the *unfolded
  evidence* that justifies and permits revision of the state.
]

#definition("2.4", name: "Belief")[
  The system's belief at time $t$ is
  $ hat(B)_t : cal(K) -> [0,1] times RR_(>0) times TT times RR_(>0) $
  assigning to each concept $k$ a tuple $(hat(mu), hat(sigma), tau, lambda)$:
  a point estimate of $mu_t (k)$, a dispersion (how much the estimate should
  move on the next observation), the timestamp at which the estimate was last
  supported by evidence, and a stability parameter governing decay (Def. 5.4).
  $hat(B)$ additionally carries global estimates for $z$.
]

#theorem("2.1", name: "Uncertainty is load-bearing")[
  A belief that omits $hat(sigma)$ --- a point estimate per concept --- cannot
  support the policy of §6, and the omission cannot be repaired downstream.
]

#proof[
  The objective of Def. 6.2 contains an information term whose value on
  concept $k$ is a function of the *dispersion* of the belief at $k$: an
  exercise on a concept the system is already certain about yields nothing
  (Def. 3.2), regardless of whether that certainty is of high or low mastery.
  A point estimate assigns the same value to "0.5, from two hundred
  observations" and "0.5, from none", though the first should never be probed
  and the second should be probed immediately. Since the policy must
  distinguish them and the state does not, no function of the state
  distinguishes them, and no downstream component can recover the distinction.
  The same argument establishes that $tau$ is not optional: without it, decay
  cannot be applied (Thm. 5.3), and "0.9, confirmed today" is
  indistinguishable from "0.9, confirmed in March".
]

#remark("2.3", name: "On the temptation to store one number")[
  Theorem 2.1 is the answer to the recurring proposal that the learner model
  can be "just a mastery percentage per concept". It can be four numbers per
  concept or it cannot be adaptive; four numbers per concept for
  $|cal(K)| = 2000$ is under 100 KB serialized, which §7 shows is affordable
  by two orders of magnitude. The economy is not where the constraint binds.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Observation Channel
// ═══════════════════════════════════════════════════════════════════════════

#definition("3.1", name: "Observation")[
  An *observation* is a tuple
  $ o = (k, e, r, Delta t, p, t) $
  recording that at wall-clock time $t$ the learner was presented an exercise
  $e$ bearing on concept $k$ under policy valuation $p$ (Def. 4.2), and
  produced outcome $r$ after latency $Delta t$. Outcomes include *correct*,
  *incorrect with response*, *expired*, *abandoned*, and *absent* (Prop. 3.2).
]

#axiom("3.1", name: "Confounded observation")[
  The map from learner state to outcome is many-to-one and is modulated by
  $z$, by $p$, and by renderer nuisance (Def. 9.2). In particular, a single
  incorrect outcome is consistent with: absent competence; present competence
  under motor failure; present competence confused with a neighbouring
  concept; present competence under attentional lapse; present competence
  under time pressure exceeding motor capability; and present competence with
  the response never attempted.
]

#theorem("3.1", name: "Single-channel non-identifiability")[
  From binary outcomes alone, on a single concept, no amount of data
  distinguishes the confounds of Axiom 3.1.
]

#proof[
  Let $H_1$ be "does not know $k$" and $H_2$ be "knows $k$ but the presentation
  exceeds motor capability", and let each produce an incorrect outcome with
  probability $q$. The likelihood of any sequence of binary outcomes on $k$ is
  a function of $q$ alone and is identical under $H_1$ and $H_2$; the
  posterior therefore equals the prior ratio for every sample size. The same
  construction applies pairwise to every confound listed.
]

#corollary("3.1", name: "The three admissible resolutions")[
  Identifiability must be bought, and there are exactly three currencies:
  *(a) vary the policy vector* --- present the same concept under different
  valuations of $p$ (with and without time pressure, with and without hint)
  and attribute the difference, which separates competence confounds from
  presentation confounds; *(b) vary the concept* --- observe neighbouring
  concepts and attribute correlated failure to the neighbourhood rather than
  the item, which separates confusion from ignorance; *(c) add a channel* ---
  collect evidence of a different type (latency distribution, a second
  modality, or a free-text self-report, §8) whose likelihood differs across
  the confounds. All three are the *deliberate design of the measurement*,
  which is why the instrument is a first-class transformation (Thm. P.2) and
  not an implementation detail of the policy.
]

#remark("3.1", name: "The repository's confusion structure is unmodelled and free")[
  Resolution (b) is nearly free in the Hangul domain and is not taken. The
  tense/plain/aspirate consonant families (ㅂ/ㅃ/ㅍ, ㄷ/ㄸ/ㅌ, ㄱ/ㄲ/ㅋ,
  ㅈ/ㅉ/ㅊ) are a known confusion structure available *a priori* from the
  writing system, requiring no learner data to author. Under Def. 1.2 they are
  edges; under Prop. 5.2 a failure on ㅃ then raises the probability that ㅂ
  and ㅍ are also unstable. The present engine, which keys everything on the
  glyph string alone, cannot represent the relation and therefore cannot
  perform the attribution.
]

#definition("3.2", name: "Evidential yield")[
  The *evidential yield* of an exercise $e$ under belief $hat(B)$ is the
  expected reduction in uncertainty about $S$ from observing its outcome:
  $ Y(e, hat(B)) = H(hat(B)) - EE_(r) [ H(hat(B) | r) ] >= 0. $
  An exercise with $Y = 0$ is *uninformative*: its outcome is predictable from
  the belief, and running it teaches the system nothing.
]

#proposition("3.1", name: "The system can produce zero-yield observations, and does")[
  If the exercise displays the answer, then for any belief, the outcome is
  predictable from the display rather than from $mu$, and $Y = 0$ with respect
  to $mu$.
]

#proof[
  Let $p$ have the hint enabled, so the correct response is visible at the
  moment of response. Then $"Pr"[r = "correct"]$ is a function of the learner's
  transcription ability, not of $mu(k)$; formally $r perp mu(k) | p$, so
  $H(hat(B)|r) = H(hat(B))$ and $Y = 0$ by Def. 3.2.
]

#corollary("3.2", name: "The hint gate, derived")[
  A system that credits mastery on a hinted response is updating belief on
  evidence with zero yield --- i.e. writing a posterior that its own likelihood
  does not support. The correct behaviour is to withhold the mastery update
  while the hint is visible, and this is a theorem, not a heuristic.
]

#remark("3.2", name: "Grounding: this rule is already in the source, undermotivated")[
  `CompletionMode::on_match`, `VocabularyMode::on_match`, and
  `EndlessMode::on_match` in `crates/hangul-game-core` all gate their mastery
  signal on `!show_romanization`. The governing canon *The Single-Glyph
  Ceiling* records (its Remark 6.2) that this gate was first mistaken for
  accidental coupling, removed in analysis, and then restored on direct
  product feedback that a hinted match "isn't evidence of recall". Corollary
  3.2 supplies the derivation that feedback was standing in for. The gate is
  correct; it was correct for a reason nobody had written down; and until now
  nothing prevented the next author from removing it again on the same
  reasoning that removed it the first time. That is precisely the failure mode
  a canon exists to end.
]

#proposition("3.2", name: "Absence is an observation")[
  Non-appearance is evidence and must enter the channel as a first-class
  outcome, not as a gap between observations.
]

#proof[
  Consider two learners with identical belief at time $t_0$; one returns daily
  for a week, the other not at all. At $t_0 + 7$ days their true states differ
  substantially --- in $mu$ by decay (Axiom 2.2) and in $z$ by disengagement ---
  and the difference is entirely determined by information the system
  possesses (the timestamps of its own sessions). A system that represents
  absence as "no rows" has that information but cannot act on it, because
  nothing in the channel fires. Since the policy is driven by the estimator and
  the estimator by the channel, absence must be lifted into the channel to
  have any effect. Operationally this means the channel emits a *censored*
  observation at read time --- the interval $[t_"last", "now"]$ during which
  the learner was not observed --- which is exactly the input the lazy decay
  of Theorem 5.3 consumes.
]

#axiom("3.2", name: "Shared presentation couples observations")[
  If a presentation parameter is global to a session and is itself driven by
  learner performance, then observations on distinct concepts collected within
  that session are not conditionally independent given $S$: the conditions
  under which concept $k$ was measured depend on responses to concepts
  $k' != k$.
]

#proposition("3.3", name: "The shared difficulty dial corrupts the evidence it collects")[
  Under Axiom 3.2, a naive estimator that treats within-session observations as
  independent will systematically overestimate mastery on concepts encountered
  during a high streak and underestimate it on concepts encountered after a
  miss.
]

#proof[
  Let $ell_t$ be the presentation window, decreasing with streak and increasing
  with misses. The probability of a correct outcome is increasing in $ell$ for
  fixed $mu$. A concept drawn during a long streak is presented at small $ell$,
  so a correct response there is *stronger* evidence than the same response at
  large $ell$; a naive estimator scoring both identically under-credits the
  former. Symmetrically, a concept drawn immediately after a miss is presented
  at large $ell$, where a correct response is weaker evidence, and is
  over-credited. The bias does not average out across concepts, because the
  assignment of concepts to streak positions is not independent of the
  concepts: the ones the learner is good at generate the streaks. In the
  present engine this is `current_lifetime_ms`, moved by `compute_speedup` and
  `compute_slowdown` in `internal/difficulty.rs`, shared across the entire
  board.
]

#corollary("3.3")[
  Presentation parameters must be recorded on the observation ($p$ in
  Def. 3.1) and corrected for by the estimator, *or* be held fixed per
  concept. They may not be global, learner-driven, and unrecorded, which is
  the present arrangement.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Exercise: Instrument and Intervention
// ═══════════════════════════════════════════════════════════════════════════

This is the section the motivating complaint is actually about. The complaint
was that each new pedagogical intention produced another component tree; the
diagnosis is that pedagogical intention had been encoded as *control flow*
rather than as *data*, and the remedy is to exhibit the data.

#definition("4.1", name: "Exercise")[
  An *exercise* is a tuple
  $ e = (k, "obj", c, p, "term") $
  where $k in cal(K)$ is the concept under examination, $"obj"$ is the
  objective (what competence is being exercised: recognition, production,
  recall, transfer, discrimination), $c$ is the content instance drawn for it
  (a `Challenge` in the sense of *The Single-Glyph Ceiling* --- a stimulus
  paired with an ordered answer sequence), $p$ is the policy vector (Def. 4.2),
  and $"term"$ is the termination predicate.
]

#definition("4.2", name: "Policy vector")[
  The *policy vector* $p$ is a valuation of a fixed, finite set of independent
  presentation and evaluation decisions. The canonical dimensions:
  #v(0.3em)
  #table(
    columns: (3.4cm, 1fr),
    stroke: 0.4pt,
    inset: 5pt,
    [*Dimension*], [*Range and meaning*],
    [$p_"hint"$], [none / on-demand / progressive / full --- how much of the answer is exposed, and when],
    [$p_"pressure"$], [none / soft deadline / hard deadline, with the deadline value],
    [$p_"scored"$], [whether the outcome contributes to visible score],
    [$p_"credited"$], [whether the outcome updates belief (distinct from $p_"scored"$; see Rem. 4.1)],
    [$p_"retry"$], [forbidden / free / bounded --- whether an error may be corrected in place],
    [$p_"modality"$], [the stimulus channel: glyph / image / audio / prose],
    [$p_"response"$], [the response channel: keystroke sequence / selection / free text / spoken],
    [$p_"direction"$], [recognition (stimulus $->$ meaning) or production (meaning $->$ stimulus)],
    [$p_"repeat"$], [whether the item may re-present within the session, and after what],
    [$p_"reveal"$], [what is shown after the outcome: nothing / correct answer / explanation],
  )
]

#theorem("4.1", name: "Mode elimination")[
  The pedagogical "modes" that motivate separate implementations --- tutorial,
  assessment, review, drill, listening, dictation, timed test --- are not
  primitive. Each is a named point (or small region) in the product space of
  Definition 4.2, and the set of implementations required is a function of the
  *dimensions*, not of the number of named modes.
]

#proof[
  By exhibition, giving the valuation of each named mode:
  #v(0.3em)
  #table(
    columns: (2.6cm, 1fr),
    stroke: 0.4pt,
    inset: 5pt,
    [*Named mode*], [*Valuation*],
    [Tutorial],
    [$p_"hint" = "progressive"$, $p_"pressure" = "none"$, $p_"scored" = "false"$, $p_"credited" = "false"$, $p_"retry" = "free"$, $p_"reveal" = "explanation"$],
    [Assessment],
    [$p_"hint" = "none"$, $p_"pressure" = "hard"$, $p_"scored" = "true"$, $p_"credited" = "true"$, $p_"retry" = "forbidden"$, $p_"reveal" = "nothing"$],
    [Review],
    [$p_"hint" = "on-demand"$, $p_"pressure" = "soft"$, $p_"credited" = "true"$, $p_"repeat" = "on-error"$, $p_"reveal" = "answer"$],
    [Listening],
    [$p_"modality" = "audio"$, $p_"direction" = "production"$; every other dimension free],
    [Dictation],
    [$p_"modality" = "audio"$, $p_"response" = "keystrokes"$, $p_"hint" = "none"$],
    [Timed drill],
    [$p_"pressure" = "hard"$, $p_"repeat" = "always"$, $p_"hint" = "none"$, $p_"credited" = "true"$],
  )
  #v(0.3em)
  No two rows differ in anything except the valuation; in particular no row
  requires a term absent from Def. 4.2, and no row requires a different
  *renderer*, since by Def. 9.1 the renderer consumes the exercise state and
  the valuation is part of that state. Since every named mode is a valuation
  and valuations are data, the implementations required are one per dimension
  (to interpret it), not one per mode.
]

#corollary("4.1", name: "The pile-up, dissolved")[
  Under Theorem 4.1 the count of implementations is $O(|p|)$ and the count of
  named modes is unbounded and free. The motivating symptom --- "a new learning
  activity means a new component" --- is therefore not a discipline failure but
  a direct consequence of having no $p$: without it, a difference in valuation
  has nowhere to live except in a branch, and branches live in components.
]

#remark("4.1", name: "Why the scored and credited dimensions are separate")[
  They are routinely conflated and must not be. $p_"scored"$ is a *product*
  decision about what the learner is shown; $p_"credited"$ is an
  *epistemic* decision about whether the estimator may update. Proposition 3.1
  forces $p_"credited" = "false"$ whenever $p_"hint" = "full"$, regardless of
  what the score display does; conversely a diagnostic probe may be uncredited
  in the visible score and fully credited in belief. Collapsing them makes
  Corollary 3.2 inexpressible.
]

#definition("4.3", name: "Intervention gain")[
  The *intervention gain* of an exercise is the expected improvement it causes
  in the learner's true state:
  $ G(e, S) = EE [ mu_(t+1)(k) - mu_t (k) | e ] $
  where the expectation is over outcomes and the learner's response process.
]

#theorem("4.2", name: "Instrument--intervention tension")[
  $Y$ and $G$ cannot in general be maximized by the same exercise. Along the
  hint dimension in particular, they are strictly opposed: increasing
  $p_"hint"$ weakly increases $G$ and weakly decreases $Y$, and there exist
  beliefs at which both inequalities are strict.
]

#proof[
  Fix $k$ with $hat(mu)(k)$ low and $hat(sigma)(k)$ high. At $p_"hint" =
  "full"$: the learner is shown the answer, so $G > 0$ (exposure and guided
  production are learning events) while $Y = 0$ by Proposition 3.1. At
  $p_"hint" = "none"$: the outcome is a draw whose likelihood depends on
  $mu(k)$, so $Y > 0$; and $G$ is smaller in expectation for low $hat(mu)$,
  since the modal outcome is failure, from which the unhinted learner acquires
  no correct production (retrieval practice benefits accrue mainly to
  successful retrieval, and a failed unhinted attempt at an unknown item is
  near-zero gain and non-zero frustration cost). Both inequalities are
  therefore strict at this belief, and no valuation attains both maxima.
]

#corollary("4.2", name: "Every adaptive system spends one against the other")[
  Since no exercise is jointly optimal, the choice of $p$ is an *allocation*
  between learning now and knowing more in order to teach better later. A
  system without an explicit allocation is not avoiding the trade-off; it is
  making it implicitly, uniformly, and without record. This is the
  exploration--exploitation dilemma, and in this domain it has an unusual
  property: the exploratory action is the one that feels, to the learner, like
  being tested, and the exploitative action is the one that feels like being
  taught.
]

#remark("4.2", name: "The tutorial request, answered")[
  The motivating request --- "I need a tutorial mode where the vocabulary
  renders and I just key the jamo, with the current index highlighted" --- is
  now expressible without a new component and without a new mode: it is
  $p_"hint" = "progressive"$, $p_"pressure" = "none"$, $p_"credited" = "false"$,
  $p_"retry" = "free"$, over the existing word-challenge content of *The
  Single-Glyph Ceiling*. The highlight-current-index behaviour is not a
  pedagogical decision at all but a rendering of $p_"hint" = "progressive"$
  against the existing cursor $c$ of that canon's Definition 4.2, and belongs
  wholly to the renderer (§9). What the request *does* legitimately demand of
  this canon is Def. 4.2's $p_"credited"$ dimension: without it there is no way
  to say "this session is instruction, and its outcomes must not move the
  belief".
]

#proposition("4.1", name: "Mode strings are a lossy quotient")[
  A mode selected by string at construction time --- `create_game_mode("completion" | "vocabulary" | "vocabulary-endless" | _)` ---
  is the quotient of the policy space by a partition into four cells, fixed
  before the first observation and unchangeable thereafter. Consequently
  (i) valuations differing only in a dimension not encoded by the string are
  inexpressible, and (ii) the policy of §6 cannot change presentation in
  response to evidence, since the mode is bound at construction.
]

#proof[
  Immediate from the signature: the mode is a `&str` consumed by a factory
  returning `Box<dyn GameMode>`, and the returned object's presentation
  behaviour is fixed for the lifetime of the engine. (i) follows because the
  four strings cannot encode a product space of $>= 2^6$ points; (ii) because
  no method on the trait accepts a revised valuation. The `endless: bool`
  field of `VocabularyMode` is the visible symptom: it is one policy dimension
  ($p_"repeat"$) that escaped the string and had to be smuggled in as a
  constructor flag, and it will not be the last.
]

#definition("4.4", name: "Session")[
  A *session* is a finite sequence of exercises delivered in one sitting,
  bounded by a wall-clock budget and by the learner's continuation
  (Axiom 6.1). Sessions are not pedagogical units: no belief update depends on
  session boundaries, and no concept's treatment is defined in terms of "this
  session". The session exists because attention and wall clocks exist.
]

#remark("4.3", name: "A session is not a batch")[
  Definition 4.4 is deliberately weaker than the present `packages/ui/topik`
  arrangement, in which content is grouped into fixed *batches*, a batch is
  passed or failed as a unit, and failure replays the identical batch from its
  first item. Under this canon, batch-level pass/fail is not a
  learner-model operation at all: it discards the per-item outcome
  distribution that Prop. 2.1 shows is the only thing carrying information,
  and its remedy (replay everything, in the same order) is the policy of
  maximal ignorance applied at the granularity of a file. The batch is
  admissible as a *content-authoring* convenience and as a UI pacing device.
  It is not admissible as a unit of belief.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Estimator
// ═══════════════════════════════════════════════════════════════════════════

#definition("5.1", name: "Belief update")[
  The estimator is a fold
  $ U : hat(B) times o -> hat(B) $
  incorporating one observation into the belief. It is a pure function, and
  the belief at any time is $U$ folded over the observation history in
  timestamp order from the initial belief $hat(B)_0$ (Def. 5.2).
]

#axiom("5.1", name: "Timestamp-ordered commutativity")[
  $U$ is commutative and idempotent over observations *bearing the same
  timestamp*, and is otherwise order-sensitive only through elapsed time. Two
  observations of the same concept minutes apart may be folded in either order
  with the same result; the same two observations months apart may not,
  because decay intervenes between them.
]

#remark("5.1")[
  Axiom 5.1 is the weakest form of the convergent-merge property that *The
  Unsettled Surface* obtains in full (its Theorem 5.1). It is weaker here for a
  concrete reason: that canon's estimator folds evidence about a state it does
  not believe changes between observations, whereas Axiom 2.2 says this one
  does. The practical consequence is a hard implementation obligation ---
  every observation carries a timestamp and the fold is performed in
  timestamp order --- and one prohibition: an "apply this batch of results"
  API that loses the per-observation timestamps is inadmissible.
]

#definition("5.2", name: "Reference profile")[
  A *reference profile* $rho_v$ is a versioned, shipped assignment of an
  initial belief to every concept, representing the population of learners the
  application expects. It is content (Axiom 1.2): authored, reviewed, shipped,
  and versioned, never written at runtime.
]

#definition("5.3", name: "Sparse deviation")[
  The persisted per-learner state is a partial map
  $ delta : "dom"(delta) -> "BeliefEntry", quad "dom"(delta) subset.eq cal(K) $
  defined only at concepts where the learner has been observed to differ from
  the profile by more than a threshold. The effective belief is
  $ hat(B) = Lambda_(Delta t) ( rho_v plus.circle delta ) $
  where $plus.circle$ is pointwise override and $Lambda$ is decay (Def. 5.4).
]

#theorem("5.1", name: "Prior decomposition")[
  The triple (versioned reference profile, sparse deviation, bounded evidence
  ring) is sufficient to reconstruct a belief adequate for the policy of §6,
  and is the smallest such representation under the persistence budget of §7.
]

#proof[
  *Sufficiency.* $rho_v$ supplies a defined belief at every concept, so the
  policy is total. $delta$ supplies every place the learner is known to differ,
  so the policy's ordering of concepts by expected value is correct wherever
  evidence exists. $Lambda$ supplies the time-dependence Axiom 2.2 requires. The
  ring supplies the recent evidence needed to revise (Def. 5.5). *Minimality.*
  Removing $rho_v$ forces a cold learner to a uniform belief, which by Prop. 6.2
  makes the policy uniform-random until enough evidence accumulates, at a rate
  bounded by session length --- i.e. the first sessions, the ones with the
  highest abandonment hazard, are the least adapted. Removing $delta$ removes
  all per-learner content. Removing $Lambda$ violates Axiom 2.2. Removing the
  ring leaves no evidence from which a revised profile or a corrected
  attribution can be recomputed, making every past update irreversible.
]

#remark("5.2", name: "Where the reference profiles come from, and the honest caveat")[
  Profiles are authorable today, without any learner data, from published
  structure that already exists: acquisition-order and frequency data for
  Korean grammar and vocabulary, the TOPIK level bands, the writing system's
  own confusion families, and --- for the systems and algorithms domains --- the
  well-documented consensus difficulty ordering (ownership before borrowing
  before lifetimes; recursion before dynamic programming; array before hash
  before union-find). The caveat is that a profile is a *prior over a
  population this project has not sampled*, so its calibration is unverified.
  §12 lists this as a falsifier: if observed learners diverge from $rho$ more
  than $delta$ can sparsely express, the decomposition's economy claim fails
  even though its structure survives.
]

#proposition("5.1", name: "Cold start is bounded by prior quality, not evidence")[
  For a learner with no observations, the policy's regret is entirely
  determined by $rho_v$. No estimator improvement can help; only a better
  profile can.
]

#proof[
  With $delta = emptyset$ and an empty ring, $hat(B) = Lambda_0 (rho_v) = rho_v$
  by Def. 5.3. The policy is a function of $hat(B)$ (Def. 6.1). Hence the first
  exercise, and every exercise until the first observation is folded, is a
  function of $rho_v$ alone.
]

#theorem("5.2", name: "Profile revision safety")[
  If $delta$ stores absolute beliefs, then shipping a revised profile
  $rho_(v+1)$ either has no effect on returning learners or silently
  contradicts their evidence. $delta$ must therefore store *deviations* and
  record the profile version $v$ under which they were formed, and a
  re-anchoring operator $ delta_(v) |-> delta_(v+1) $ must exist and be
  applied at load.
]

#proof[
  Suppose $delta$ holds absolute values at observed concepts. At a concept
  $k in "dom"(delta)$, the override wins and the revision is invisible --- so
  learners never receive corrections to a profile that was wrong exactly where
  they had evidence. At $k in.not "dom"(delta)$ the revision applies fully. The
  resulting belief mixes two profile versions with no record of which, so
  neither the deviation nor the base is recoverable, and no later correction is
  possible. Storing deviations keyed to $v$ makes re-anchoring a defined
  operation: $delta_(v+1)(k) = delta_v (k)$ composed with the change
  $rho_(v+1)(k) - rho_v (k)$ where the profile moved, with widened
  $hat(sigma)$ to reflect that the anchor itself moved.
]

#definition("5.4", name: "Decay operator")[
  $Lambda_(Delta t)$ maps a belief entry $(hat(mu), hat(sigma), tau, lambda)$
  to one in which $hat(mu)$ has relaxed toward the profile value and
  $hat(sigma)$ has widened, as a function of elapsed $Delta t = "now" - tau$
  and the stability $lambda$. $lambda$ increases with each successful spaced
  retrieval and decreases on failure; it is the state variable that
  distinguishes a fact learned once from a fact learned durably.
]

#theorem("5.3", name: "Decay must be lazy")[
  Under the persistence axiom of §7 --- a static client with no server and no
  background execution --- decay may not be implemented as a scheduled write.
  It must be a pure function evaluated at read time from the persisted
  timestamps, and consequently every belief entry must carry $tau$.
]

#proof[
  A scheduled write requires a process that runs while the application is
  closed. Axiom 7.1 grants no such process: the deployment target is a static
  client, executing only while a document is open. Therefore the *only* moments
  at which state can be rewritten are moments at which the learner is present
  --- precisely the moments when decay has already occurred and matters most.
  A decay implemented as a write on open would therefore have to reconstruct
  the elapsed interval anyway, from a stored timestamp, making the write
  redundant; and a decay implemented as a write on *close* is unreliable
  (documents are closed by termination as often as by navigation) and, worse,
  would have to *predict* the return time, which is unknown. Hence decay is a
  read-time function of $("now" - tau)$, and $tau$ must be stored. That the
  system is offline is not an obstacle to modelling forgetting: forgetting is
  the one dynamic that needs no observations at all, only a clock.
]

#corollary("5.1")[
  Absence therefore requires no special mechanism beyond Prop. 3.2 and Theorem
  5.3 acting together: the learner who does not return is modelled exactly, at
  zero cost, by the belief they will find when they do. A three-month gap
  produces a belief that is uncertain rather than stale, and the policy of §6
  will spend the first minutes of the returning session re-establishing
  measurement rather than pushing new material --- which is the behaviour the
  motivating complaint asked for, obtained without an inactivity heuristic.
]

#definition("5.5", name: "Evidence ring")[
  A bounded, fixed-capacity, timestamp-ordered buffer of the most recent
  observations, retained *in addition to* the belief, whose purposes are
  exactly three: (i) to permit an attribution to be revised when later evidence
  reinterprets an earlier outcome; (ii) to supply the input to any semantic
  sensor of §8, which needs raw responses and not summaries; and (iii) to make
  the estimator auditable and its updates replayable in tests. It is *not* the
  state (Prop. 2.3), and no policy may read it directly.
]

#proposition("5.2", name: "Evidence propagates along the curriculum graph")[
  An observation on $k$ updates the belief at every $k'$ related to $k$ under
  $prec$ or under a confusion edge, with magnitude decreasing in graph
  distance. Failure to propagate wastes the majority of the information a
  well-designed probe supplies.
]

#proof[
  If $k' prec k$ and the learner demonstrates competence at $k$, then by the
  meaning of $prec$ (Def. 1.2) they satisfy the prerequisite, so
  $"Pr"[mu(k') "high"]$ rises; conversely a failure at $k'$ lowers the
  probability of competence at every $k$ above it. A probe designed to load
  several prerequisites at once therefore reduces uncertainty at all of them,
  which is what makes a small number of well-chosen diagnostics competitive
  with a large number of narrow ones. Under a belief with no graph, each
  observation informs exactly one entry, and the diagnostic advantage vanishes.
]

#remark("5.3", name: "This is what makes the small-state claim work")[
  Propositions 5.1 and 5.2 together are the reason the persistence budget of §7
  is not merely survivable but comfortable. The system does not need many
  observations because (a) it starts from a population prior rather than
  ignorance and (b) each observation updates a neighbourhood rather than a
  point. The proposal the motivating attachment reached for --- that a handful
  of well-chosen forcing questions can substitute for a longitudinal record ---
  is *correct in this exact sense* and for these exact two reasons, and its
  error was only in what it kept afterwards: the answers, rather than the
  belief they justified.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Policy
// ═══════════════════════════════════════════════════════════════════════════

#definition("6.1", name: "Policy")[
  A *policy* is a map $ pi : hat(B) -> e $ from the current belief to the next
  exercise, i.e. to a choice of concept, objective, content instance, and
  policy vector. It reads the belief and nothing else --- not the raw evidence
  ring (Def. 5.5), not the renderer, not the session history.
]

#definition("6.2", name: "Pedagogical objective")[
  The objective the policy maximizes over a horizon $T$ is
  $ J(pi) = EE [ sum_(t=0)^(T) gamma^t ( alpha dot G(e_t, S_t) + beta dot Y(e_t, hat(B)_t) ) dot "Pr"["continue" | e_(<=t)] ] $
  --- a discounted sum of intervention gain and evidential yield, *weighted by
  the probability that the learner is still there*. $alpha, beta >= 0$ are the
  explicit allocation demanded by Corollary 4.2.
]

#axiom("6.1", name: "The session is voluntary")[
  The learner may terminate at any time, permanently, without notice, and the
  hazard of termination depends on the exercises delivered. There is no
  mechanism by which the system can prevent this and no channel through which
  it learns the reason.
]

#remark("6.1", name: "Why continuation is inside the objective, not beside it")[
  It is tempting to treat engagement as a product concern layered on top of a
  pedagogical core. Definition 6.2 forbids that, and the reason is arithmetic:
  the objective is a *product* of per-step value and survival probability, so
  an exercise policy that is optimal per-step and halves the survival
  probability is worse than a mediocre one that does not. This is the formal
  content of "adaptive along the axis of abandonment". It also disposes of a
  common failure: a perfectly calibrated maximum-information policy probes
  exactly what the learner cannot do, which is exactly the experience a learner
  abandons. Maximum information is not the objective; it is one term of it,
  and its coefficient $beta$ is finite.
]

#theorem("6.1", name: "Scalar-dial insufficiency")[
  Let a policy's only actuator be a single scalar $ell$ shared across all
  concepts. Then for any belief $hat(B)$, the policy's behaviour is constant on
  the level sets of $ell$, and no such policy can implement any $pi$ that
  distinguishes two concepts with different beliefs.
]

#proof[
  The policy factors as $hat(B) -> ell -> e$. The first map has codomain $RR$,
  so it is a quotient of the belief space by all distinctions except one
  dimension. Any two beliefs mapping to the same $ell$ --- for instance,
  learner $A$ weak at $k_1$ and strong at $k_2$, and learner $B$ with the
  reverse, chosen so that their aggregate performance coincides --- produce the
  same exercise. Since the correct exercises differ (Prop. 2.1's argument), the
  policy is wrong on at least one of them. The failure is not one of tuning:
  no assignment of values to $ell$ repairs it, because the loss of information
  occurs before $ell$ is used.
]

#corollary("6.1")[
  `calculate_spawn_interval`, `compute_speedup`, and `compute_slowdown`
  (`crates/hangul-game-core/src/internal/difficulty.rs`) constitute a complete
  and correct implementation of a scalar controller, and are therefore
  incapable of adaptation in the sense of this canon, however they are tuned.
  They remain correct and useful as what they are: a *pacing* mechanism over
  the shared presentation parameter. Under Corollary 3.3 that parameter must
  additionally be recorded on each observation so the estimator can correct
  for it. The defect is not the dial; the defect is that the dial is the only
  actuator.
]

#proposition("6.1", name: "A latch is not a policy")[
  An adaptation implemented as a one-way flag, set when an aggregate crosses a
  fixed threshold and never cleared, is not a policy in the sense of
  Definition 6.1: it is a function of a scalar aggregate rather than of a
  belief, it is not a function of the current belief but of the belief's
  historical maximum, and it is not persisted, so it is re-derived from zero at
  every remount.
]

#proof[
  By exhibition against `packages/ui/leetype`: `adaptiveHidden` is a React
  `useState(false)` flipped in the render body when `wpm >= 40` and never
  flipped back; `wpm` is a session aggregate over a single content instance,
  and the state is component-local, so unmounting the component discards it.
  Each of the three clauses follows directly. Note also that the threshold is
  a global constant applied to every learner and every challenge, which by
  Prop. 5.1 is a reference profile of exactly one bit, shipped without version.
]

#proposition("6.2", name: "Uniform sampling is the policy of maximal ignorance")[
  Drawing the next concept uniformly at random from the eligible pool is the
  optimal policy for a system whose belief is uniform, and is strictly
  suboptimal for every non-uniform belief.
]

#proof[
  Under a uniform belief every concept has equal $Y$ and equal $G$, so every
  draw has equal objective value and uniform sampling attains the maximum.
  Under a non-uniform belief the objective is non-constant across concepts, so
  a draw proportional to objective value strictly dominates a uniform draw
  wherever the values differ.
]

#remark("6.2", name: "The generous reading of `choose(&mut thread_rng())`")[
  Proposition 6.2 should be read as exoneration and diagnosis in one. The
  uniform draw in `EndlessMode`, `CompletionMode`, and `VocabularyMode` is not
  a lazy placeholder for a real policy --- it is *precisely correct* given the
  belief those modes hold, which is uniform by construction because they hold
  no belief. The defect is not in the sampler. It is that nothing ever makes
  the belief non-uniform, so the sampler never becomes wrong in a way anyone
  would notice. This is the general shape of the problem this canon addresses:
  every component is locally right, and the thing that would make them
  collectively adaptive is absent rather than broken.
]

#theorem("6.2", name: "Policy--estimator separation")[
  If the estimator's update depends on the pedagogical objective, then any
  change to the objective invalidates all persisted belief.
]

#proof[
  Suppose $U$ is parametrized by $(alpha, beta)$ or by the policy's notion of
  what matters. Then $hat(B)$ is a fold of $U_(alpha,beta)$ over history, and
  changing to $(alpha', beta')$ yields a state that is neither the old fold nor
  the new one, and which cannot be corrected without replaying history --- which
  is unavailable, since the ring is bounded (Def. 5.5). Since the pedagogy is
  the component this project expects to revise most often, and the persisted
  belief is the component it can least afford to lose, the coupling is fatal in
  exactly the wrong direction.
]

#corollary("6.2", name: "The substitution seam")[
  Theorem 6.2 is what makes a future learned policy cheap. Because $pi$ reads
  $hat(B)$ and writes $e$, and because $U$ knows nothing of $pi$, a
  handwritten $pi$ may be replaced by a bandit, a planner, or a learned model
  without migrating a single stored byte. The rejection of end-to-end
  reinforcement learning in P.2 is therefore a rejection of it *as the object*,
  and explicitly not a foreclosure.
]

#definition("6.3", name: "Cohort bucket")[
  A *bucket* is a named region of the belief space with an associated
  reference profile --- "TOPIK I complete", "new to Rust", "types fluently,
  reads Hangul slowly". Buckets are a *quantization for content-authoring
  economy*: they let a small team author and validate a handful of starting
  points instead of a continuum. They are not a modelling primitive, they are
  never the learner's state, and a learner's bucket assignment is a derived,
  revisable label over $hat(B)$, not a field of it.
]

#remark("6.3", name: "The bucketing question, answered precisely")[
  The proposal that a learner be treated as a representative member of a
  population until they demonstrate divergence is adopted in full, and it is
  adopted as Theorem 5.1, not as a bucketing mechanism. Definition 6.3 records
  the residual reason to also keep an explicit bucket vocabulary: authoring
  cost. What must not happen is the bucket becoming the state --- "this learner
  is a level 3" --- because that reintroduces Prop. 2.1's scalar under a new
  name, and because it makes the sparse deviation, which is the entire
  per-learner content of the system, unrepresentable.
]

#definition("6.4", name: "Policy obligations")[
  Any conforming $pi$ must satisfy: *(P1) totality* --- defined for every
  belief, including the empty one; *(P2) determinism given a seed* --- so
  sessions are replayable in tests; *(P3) oracle-freedom* --- computable with
  no network (Thm. 8.1); *(P4) bounded latency* --- computable within one frame
  budget, since it runs between exercises; *(P5) explicability* --- able to
  report, for its chosen exercise, which belief entries drove the choice, so
  that a human reviewer can falsify it.
]

#definition("6.5", name: "Sink and bridge")[
  A *confusion edge* is an ordered pair $(k_1, k_2) in cal(K) times cal(K)$
  recording that construction of $k_2$ predictably stalls where $k_1$ is
  unavailable --- the second relation O1 already requires alongside $prec$
  (Def. 1.2), formalized here for the first time. A *sink* is a triple
  $(k_1, k_2, b)$ where $(k_1, k_2)$ is a confusion edge and $b in "Bridge"$
  is a bounded route that resolves the incidental burden $k_1$ names and
  returns the learner to the *same* obligation at $k_2$ --- never to a
  different one (Prop. 6.3). For a subject matter with finite declared sink
  set $Sigma$ (Axiom 1.1 applies to $Sigma$ exactly as it applies to
  $cal(K)$) and unclassified state $bot$ --- "no declared sink matched" ---
  a *routing function* is a map $"route" : Sigma union {bot} -> "Bridge"$.
  This introduces no relation beyond the two O1 already names: a sink is
  what a confusion edge is called once it is equipped with a bridge, not a
  third kind of thing.
]

#remark("6.4", name: "A sink is local and falsifiable, never a learner identity")[
  In the register of Remark 2.1: the same learner reaches different sinks on
  different problems, and on different attempts at the same problem, because
  a sink is a property of *this attempt at this obligation* (the exercise
  $e$ of an observation $o$, Def. 3.1), not of the learner's state $S_t$
  (Def. 2.1). "This attempt reached the sink $(k_1, k_2)$" is local and
  falsifiable by the next attempt; "this learner lacks $k_1$" is a claim
  about $mu_t (k_1)$ that Axiom 3.1 already rules a single attempt cannot
  supply. A sink store keyed on the learner rather than on the edge
  reintroduces Proposition 2.1's rejected scalar under a routing name.
]

#proposition("6.3", name: "Bridge losslessness")[
  For a sink $(k_1, k_2, b)$, if $b$ terminates at an obligation other than
  $k_2$, or at $k_2$ under an objective different from the one being probed
  (Def. 4.1's $"obj"$), then $b$ has not resolved the confusion $(k_1, k_2)$
  names --- it has substituted a different exercise for it.
]

#proof[
  By Definition 6.5, $b$ exists to discharge the *incidental* burden the
  confusion edge names while leaving the obligation $k_2$ intact. A route
  terminating elsewhere either abandons $k_2$ --- silently withdrawing the
  exercise the learner was being probed on --- or answers a different
  objective at $k_2$, e.g. a lesson on the syntax of $k_1$ where the
  obligation asked for the invariant of $k_2$. Either way, the evidential
  yield $Y$ (Def. 3.2) collected downstream is about an exercise
  $"route"$ never advertised, which is the same corruption Corollary 3.3
  forbids for an unrecorded shared presentation parameter --- here
  committed by the bridge itself rather than by the channel.
]

#corollary("6.3", name: "Sinks do not become modes")[
  Derivable from Theorem 4.1: a bridge is a valuation over dimensions the
  policy vector (Def. 4.2) already has --- $p_"hint"$ moved earlier,
  $p_"retry"$ loosened, decomposition depth increased --- so the
  implementations required to support $|Sigma|$ sinks are $O(|p|)$, not
  $O(|Sigma|)$, by the same argument Corollary 4.1 makes for named modes. A
  bridge that requires a component the runner does not already have has
  reproduced Corollary 4.1's pile-up with the word "sink" in place of the
  word "mode".
]

#theorem("6.3", name: "Routing totality")[
  If $Sigma$ is finite (Axiom 1.1) and $"route"(bot)$ is defined as a
  bridge requiring no member of $Sigma$ to have matched, then
  $"route" : Sigma union {bot} -> "Bridge"$ is total --- and totality does
  not require $Sigma$ to cover every latent cause of blockage, only that
  $"route"$ have a value on every *observable* state, which $Sigma union
  {bot}$ exhausts by construction, since $bot$ is defined as its
  complement.
]

#proof[
  $Sigma union {bot}$ is, by the definition of $bot$, the entire domain a
  classification step can return: either a declared sink matched, or none
  did. $"route"$ is defined on every element of $Sigma$ by hypothesis (each
  sink carries its own bridge, Def. 6.5) and on $bot$ by the fallback
  route's construction, which does not depend on which sink, if any, a
  larger taxonomy would have matched. Enlarging or shrinking $Sigma$
  therefore changes which bridge a given attempt receives but never removes
  a value from $"route"$'s domain --- which is Definition 6.4's (P1) at the
  routing sub-decision, instantiated rather than argued afresh. A compiled
  graph can discharge this structurally, over its finite node and edge set,
  in place of enumerating $Sigma$'s coverage of human causes of blockage.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Persistence Budget
// ═══════════════════════════════════════════════════════════════════════════

This section states the exogenous constraint that most sharply distinguishes
this project from the systems the literature describes, and derives its
consequences. The constraint is not a temporary embarrassment to be lifted
when funding arrives; it is treated as permanent, because every result below
is *better* under it --- smaller state, no migration fleet, no privacy
surface, no availability dependency --- and because a design that survives it
also survives its relaxation.

#axiom("7.1", name: "The deployment envelope")[
  The application is a static client. There is (i) no server the project
  controls, (ii) no background execution while the application is closed,
  (iii) no cross-device synchronization, (iv) client-local storage only, which
  is *evictable without notice* by the user agent or the user, and (v) a
  storage quota of a few megabytes shared with everything else the origin
  stores.
]

#definition("7.1", name: "Storage budget")[
  The persisted footprint is $ |delta| dot s_"entry" + |W| dot s_"obs" + s_"meta" $
  --- deviations, evidence ring, and metadata (schema version, profile
  version, identity). Nothing else is persisted. In particular the belief
  itself is not persisted: it is *derived* at load from $rho_v plus.circle delta$ under
  $Lambda$ (Def. 5.3).
]

#theorem("7.1", name: "Bounded state")[
  A conforming system's persisted footprint is $O(|cal(K)|)$ in the worst case
  and $O(|"dom"(delta)|)$ in practice, and in particular is independent of the
  number of interactions.
]

#proof[
  $delta$ is a partial map on the finite set $cal(K)$ (Axiom 1.1), so
  $|"dom"(delta)| <= |cal(K)|$ regardless of how many observations produced it,
  because the fold $U$ writes in place. $W$ is fixed-capacity by Def. 5.5.
  $s_"meta"$ is constant. No term counts interactions.
]

#proposition("7.1", name: "Append-only interaction logs are inadmissible")[
  Persisting a growing record of interactions violates Theorem 7.1, and under
  Axiom 7.1(v) it fails in the worst available way: silently, late, and to the
  most engaged learners first.
]

#proof[
  `packages/ui/leetype` persists
  `PlayerProgress { xp, level, solves: Array<SolveRecord> }` under a single
  key, appending one `SolveRecord` per completed challenge with no bound
  (`solves: [...progress.solves, fullSolve]`), and writes it whole on each
  update. Footprint grows linearly in interactions, so the quota is reached
  after some number of solves --- reached first, by construction, by the
  learners who used the application most. At that point `setItem` throws and
  the handler swallows it, so writes stop succeeding while reads continue
  returning the last good value: the application behaves normally and silently
  stops learning. Note this is not an argument against the *swallow* (see
  Prop. 7.2) but against the unbounded growth that makes the swallow load-bearing.
]

#theorem("7.2", name: "Eviction tolerance")[
  Under Axiom 7.1(iv) every persisted artifact must be reconstructible-with-degradation
  from shipped content alone. Formally: the system's behaviour with
  $delta = emptyset, W = emptyset$ must be *correct but less adapted*, never
  incorrect and never blocked.
]

#proof[
  Eviction is not an error condition the system may detect and refuse; it is a
  legitimate action of the user agent, indistinguishable at read time from a
  first visit. A system with a mandatory persisted artifact would therefore be
  unable to distinguish "returning learner whose storage was cleared" from
  "new learner", and any behaviour conditioned on that distinction is
  unimplementable. Hence no behaviour may be so conditioned, which is the
  claim. Theorem 5.1 already supplies the mechanism: $rho_v$ is shipped, so
  the empty-$delta$ system is exactly the cold-start system of Prop. 5.1,
  which is fully functional.
]

#proposition("7.2", name: "Silent write failure is admissible, and only because of Thm. 7.2")[
  Swallowing a storage write error without surfacing it to the learner is
  correct behaviour under this canon, and would be incorrect under any design
  that did not satisfy Theorem 7.2.
]

#proof[
  Under Thm. 7.2 a failed write degrades adaptation and nothing else; the
  learner's session proceeds identically, and surfacing the failure would
  present an actionable-looking error for which the learner has no useful
  action. Under a design where belief is required for correctness, the same
  swallow would silently corrupt the session. Both
  `packages/ui/leetype/src/lib/leetype/player-store` and
  `packages/ui/interview/src/lib/interview/session-storage` swallow, and both
  comment that they do so deliberately. They are right, and Theorem 7.2 is the
  reason --- a reason neither of them states, and which is not true of
  `leetype` for as long as Prop. 7.1's unbounded growth stands.
]

#theorem("7.3", name: "Schema migration is mandatory and forward-only")[
  Persisted state must carry a schema version, and every shipped release must
  contain a total migration from every schema version it may encounter to the
  current one, where "total" includes the option of *principled discard* ---
  dropping fields whose meaning changed, with $hat(sigma)$ widened to record
  that the belief is now less supported.
]

#proof[
  Content and code ship together and update atomically; state does not update
  with them and may be arbitrarily old, since a learner may return after
  months (Axiom 7.1(ii): nothing ran in between). Therefore the set of schema
  versions encountered at load is unbounded above by the previous release.
  Parsing failure must not be fatal, by Thm. 7.2. Migration is therefore the
  only mechanism, and discard-with-widened-uncertainty is available as the
  terminal case, which is why it is always total.
]

#remark("7.1", name: "Three keys, three schemas, no versions")[
  The repository currently persists learner-adjacent state under
  `"leetyping_progress"` and `"some-ui:mock-interview:session"`, with
  disjoint, unversioned shapes and no shared vocabulary; `honeycomb` persists
  nothing at all, so its entire learner state is destroyed at unmount. The
  interview store validates on read with a schema and returns `null` on
  mismatch --- which is Theorem 7.3's discard case, implemented, though without
  a version field it can only discard, never migrate. Under this canon there is
  one key, one versioned envelope, and one $delta$ spanning all surfaces; the
  incomparability symptom of P.0 is a direct consequence of there being three.
]

#definition("7.2", name: "Portability obligation")[
  Because Axiom 7.1(iii) forbids synchronization, a conforming system must
  provide *export* and *import* of the persisted envelope as a single
  self-describing document. The human is the transport.
]

#remark("7.2", name: "The tutor skills are already doing this, by hand")[
  Definition 7.2 is not speculative future work; it is the formalization of a
  workaround already in use. The `lc-tutor` skill instructs the model to
  "recall last session's state (if provided by candidate or memory)" and, when
  it is not, to ask the candidate to paste a prior session summary. That is
  export/import performed by a human with no schema. The `korean-jit-reader`
  skill takes the other branch and re-runs a five-question diagnostic at every
  session open, mapping the score through a fixed table to a TOPIK level ---
  i.e. it reconstructs a one-scalar belief from scratch each time and discards
  it at session end, which is P.0's amnesia symptom and Prop. 2.1's scalar
  symptom simultaneously. Both skills are *correct given no shared artifact to
  read*. Definition 7.2 supplies the artifact, and §8 fixes what the skills may
  then do with it.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Semantic Boundary
// ═══════════════════════════════════════════════════════════════════════════

This section answers the standing question --- whether a language model is
required, and if so where --- by locating the boundary rather than by
estimating a cost.

#definition("8.1", name: "Information classes")[
  Every decision in the system falls into exactly one class:
  #v(0.3em)
  #table(
    columns: (2.9cm, 1fr, 2.2cm),
    stroke: 0.4pt,
    inset: 5pt,
    [*Class*], [*Character*], [*Oracle needed*],
    [I. Structured],
    [Inputs and outputs are typed data; the decision is a computation. Belief update, decay, scheduling, ordering, item selection.],
    [No],
    [II. Latent],
    [The quantity is hidden but the model is specified; the decision is inference. Mastery estimation, confusion attribution, abandonment hazard.],
    [No],
    [III. Unstructured input],
    [The evidence arrives as natural language and must be mapped into a fixed schema. Self-reports, free-text answers, explanations.],
    [Often],
    [IV. Open-world output],
    [The output space is combinatorial and has no enumerable optimum. Generating new exercises, prose, worked explanations.],
    [Usually],
  )
]

#axiom("8.1", name: "The oracle's properties")[
  Any language model available to this system is remote or local-but-large,
  non-deterministic, unversioned from the application's point of view,
  rate-limited, and may be absent entirely. Its latency is orders of magnitude
  above a frame budget.
]

#theorem("8.1", name: "Oracle-free scheduling")[
  No belief update and no policy decision may depend on the availability of an
  oracle.
]

#proof[
  Suppose $pi$ requires an oracle call. By Axiom 8.1 the call may fail or be
  slow; by Def. 6.4(P4) the policy runs between exercises, so its latency is
  in the learner's critical path; by Axiom 6.1 and Definition 6.2 the
  continuation probability depends on the experience delivered, so latency and
  unavailability enter the *objective* directly rather than as an
  infrastructural concern. A policy that stalls therefore reduces $J$ by
  reducing survival, and a policy that fails leaves the system with no next
  exercise at all, violating (P1) totality. By Def. 8.1 both scheduling and
  belief update are class I--II, so no oracle is needed to satisfy them; the
  dependency would be gratuitous as well as harmful.
]

#definition("8.2", name: "Authoring time versus runtime")[
  *Authoring time* is any moment before the artifact ships: a build step, a
  content-generation script, a reviewed pull request. Its outputs are content
  under Axiom 1.2 --- versioned, inspectable, diffable, testable. *Runtime* is
  any moment during a learner's session.
]

#proposition("8.1", name: "Class IV belongs at authoring time")[
  Exercise generation, prose composition, worked explanations, distractor
  construction, and reference-profile drafting are class IV, and all of them
  may be performed by an oracle at authoring time, where Axiom 8.1's
  properties are harmless: latency is irrelevant, non-determinism is resolved
  by review, and the output is versioned by the same mechanism as the rest of
  the content.
]

#remark("8.1")[
  Proposition 8.1 is the load-bearing economic claim of this section. It says
  the *most valuable* thing an oracle does for this project --- authoring
  content that would otherwise take a human months --- is precisely the thing
  that needs no runtime dependency, no key, no quota, and no availability
  guarantee. The content pipeline is: source material $->$ oracle $->$ JSON
  artifacts $->$ review $->$ repository $->$ static client.
]

#proposition("8.2", name: "Class III is admissible at runtime, as a sensor")[
  An oracle may convert unstructured learner input into schema-bounded
  evidence at runtime, subject to four conditions: (i) its output is an
  *observation* (Def. 3.1) carrying a confidence, never a belief write;
  (ii) the schema is closed and validated, and validation failure discards the
  observation rather than propagating it; (iii) the interaction is
  off-critical-path --- between sessions or on explicit request, never between
  exercises; (iv) the feature degrades to absent, not to broken.
]

#remark("8.2", name: "Why a small local model suffices here")[
  Condition (ii) reduces the class III task to constrained extraction against a
  closed schema --- "the learner said they confuse the doubled consonants when
  rushing" becomes a bounded record naming concepts already in $cal(K)$ and a
  trigger already in the policy vector. That is a mapping task, not a reasoning
  task, and it does not require frontier capability. Under condition (iv) the
  choice of model is a quality dial with no architectural consequence, which is
  the precise sense in which this project does not depend on any particular
  provider.
]

#proposition("8.3", name: "Deterministic graders strictly dominate where they exist")[
  For grading, an oracle is admissible only where no deterministic grader
  exists, and its verdict enters as one bounded-weight observation rather than
  as ground truth.
]

#proof[
  A deterministic grader --- exact match, canonicalized comparison, a
  compiler, a unit test, an edit distance --- is class I: it is free, instant,
  replayable, testable, and has no failure mode the estimator must model. An
  oracle verdict is a noisy channel whose error rate is unknown and
  uncalibrated, so under Def. 5.1 it must be folded with a likelihood
  reflecting that noise, i.e. with bounded weight. Where both are available the
  deterministic one dominates on every axis. Where only the oracle is
  available --- an open-ended explanation, a free translation --- it is the
  only channel, and the bounded weight is what keeps a single hallucinated
  verdict from moving a belief further than a single observation should.
]

#theorem("8.2", name: "Degradation containment")[
  Removing the oracle entirely changes the *richness of evidence* and the
  *supply of content*. It does not change the belief schema, the estimator, the
  policy's type, the renderer, or any persisted artifact.
]

#proof[
  By Thm. 8.1 no class I--II component calls an oracle, so their code paths are
  unchanged. By Prop. 8.1 class IV output is content, already shipped, so its
  absence affects only future releases. By Prop. 8.2 class III produces
  observations, and the absence of a source of observations is already a
  modelled condition (Prop. 3.2, Thm. 5.3). Hence the offline system is a
  strict subset of the online one, with identical types.
]

#corollary("8.1", name: "The standing question, answered")[
  The system does not need a language model to be adaptive; adaptivity is
  class I--II throughout. It needs one to be *stocked* (class IV) and it
  benefits from one to be *conversational* (class III). Both are separable,
  and the first is separable in time rather than in space, which is why the
  cost of the project's constraint is a slower content pipeline rather than a
  weaker product.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Renderer
// ═══════════════════════════════════════════════════════════════════════════

#definition("9.1", name: "Renderer")[
  A *renderer* is a function from exercise state to presentation, together
  with a mapping from raw user input to outcome candidates. It holds no
  pedagogical state, makes no selection decisions, and is replaceable without
  reference to anything in §§1--8 except the exercise type of Definition 4.1.
]

#theorem("9.1", name: "Renderer independence")[
  Under Definitions 4.1, 4.2, and 9.1, a change of renderer --- hex grid to
  list, keyboard to selection, screen to audio --- requires no change to
  $cal(K)$, $rho$, $delta$, $U$, or $pi$.
]

#proof[
  Each of those objects is defined over concepts, observations, and exercises;
  none mentions presentation. The renderer consumes an exercise and produces
  observations of the type Definition 3.1 fixes. Substituting a renderer
  therefore substitutes one producer of that type for another, leaving all
  consumers well-typed.
]

#definition("9.2", name: "Nuisance parameters")[
  The *nuisance parameters* $nu$ of a renderer are the components of a
  response that depend on the presentation rather than on the learner's
  competence: input-device latency, layout scan time, keystroke count per
  answer token, audio playback duration, and the learner's familiarity with
  the interface itself.
]

#proposition("9.1", name: "Raw latency is not a belief field")[
  Response latency may not be stored in the belief without correction for
  $nu$, because $nu$ varies across renderers by more than the competence
  differences the estimator exists to detect.
]

#proof[
  Compare two surfaces in this repository. In `honeycomb`, a response is one
  or a few keystrokes located on a hex grid, and the measured interval
  includes visual search over the grid. In `leetype`, a response is a
  continuous stream of hundreds of keystrokes against visible code, and the
  reported quantity is words-per-minute over a whole chunk. A latency in the
  first is not commensurable with a rate in the second, and neither is
  commensurable with the same learner's latency on the same concept in a
  quiz-selection UI. If both wrote to a shared field, the belief would move on
  interface changes and on nothing else. The correction is renderer-supplied
  calibration: each renderer reports latency relative to its own baseline for
  a trivial item, and the estimator consumes only the standardized residual.
]

#proposition("9.2", name: "The renderer may not own pedagogical state")[
  Any pedagogical decision held in renderer-local state is (i) lost at
  unmount, (ii) invisible to the estimator, and (iii) unavailable to any other
  renderer.
]

#proof[
  Immediate for component-local state under any component lifecycle;
  exhibited concretely by `adaptiveHidden` (Prop. 6.1) and by the entire
  learner state of `honeycomb`, which lives inside a WASM instance constructed
  on mount and dropped on unmount, so that `CompletionMode.completed` --- the
  only mastery-shaped object in the Hangul surface --- has a lifetime strictly
  shorter than one visit.
]

#remark("9.1", name: "What the renderer is for")[
  Nothing in this section diminishes the renderer's importance; the hex grid,
  the code display, and the recording UI are what make the exercises worth
  doing, and by Axiom 6.1 that is a term in the objective, not a decoration.
  The claim is narrower: the renderer's contribution to $J$ runs entirely
  through the continuation probability, and it must not run through the belief.
]

// ═══════════════════════════════════════════════════════════════════════════
= Grounding Against the Present Source
// ═══════════════════════════════════════════════════════════════════════════

Every claim in this section is checked against source at the version this
canon is filed. The purpose is not to enumerate defects but to demonstrate
that the theory is *contentful*: it predicts, in advance, where each surface
will fail, and it predicts non-obviously that three shipped behaviours which
look like arbitrary choices are in fact required.

#heading(level: 2)[What the theory retrospectively vindicates]

#table(
  columns: (4.4cm, 1fr),
  stroke: 0.4pt,
  inset: 6pt,
  [*Shipped behaviour*], [*Now derived*],
  [The `!show_romanization` gate on every `on_match` in
   `crates/hangul-game-core`],
  [Corollary 3.2. A hinted response has zero evidential yield; crediting it
   writes a posterior the likelihood does not support. Previously justified
   only by product intuition, and once removed in analysis before being
   restored (*The Single-Glyph Ceiling*, Rem. 6.2).],
  [Silent swallow of storage-quota errors in `leetype` and `interview`],
  [Proposition 7.2, *conditional* on Theorem 7.2. Correct for `interview`;
   correct for `leetype` only once Prop. 7.1's unbounded `solves` array is
   bounded.],
  [Schema-validated read returning `null` on mismatch in `interview`],
  [Theorem 7.3's terminal discard case, implemented. It is missing only the
   version field that would let it migrate instead of discard.],
  [Uniform random draw in all three game modes],
  [Proposition 6.2. Optimal for the uniform belief those modes hold. The
   defect is the belief, not the sampler.],
  [Framework-agnostic pure reducer plus effect list in `packages/ui/topik`],
  [Anticipates Theorem 9.1 and Definition 6.1's separation, at the session
   layer. The architecture is already the right shape; it is simply
   parametrized over content position rather than over learner belief.],
)

#heading(level: 2)[What the theory predicts will fail, and where]

#table(
  columns: (3.3cm, 3.5cm, 1fr),
  stroke: 0.4pt,
  inset: 6pt,
  [*Surface*], [*Present learner model*], [*Predicted failure, and the result predicting it*],

  [`crates/hangul-game-core` + `packages/ui/honeycomb`],
  [`HashSet<String>` of completed identities, plus a shared scalar
   `current_lifetime_ms`; both in-memory, both destroyed at unmount],
  [Cannot represent partial competence, uncertainty, or decay (Prop. 2.2);
   cannot distinguish concepts with one dial (Thm. 6.1); collects
   streak-biased evidence (Prop. 3.3); loses everything per visit (Prop. 9.2).
   The reported symptom --- clearing the jamo game yet being unable to type a
   word --- is Remark 1.1: recognition and production were one concept.],

  [`packages/ui/leetype`],
  [`{ xp, level, solves: SolveRecord[] }` in one `localStorage` key, plus an
   in-component `adaptiveHidden` latch],
  [Scalar cannot support a policy (Prop. 2.1); unbounded log breaches the
   quota, worst learners-first (Prop. 7.1); latch is not a policy (Prop. 6.1);
   `levelRequired` gating is an unlock DAG with the objections of P.2.],

  [`packages/ui/topik`],
  [`score: number` and a `{batch, message, question}` cursor; no persistence
   of either],
  [Positional identity orphans on every content revision (Thm. 1.1);
   batch-level pass/fail discards the per-item distribution and replays
   identically (Rem. 4.3); `BATCH_PASSED` is emitted by a UI action with no
   threshold, so the evaluation is learner self-report and the score is
   decorative.],

  [`packages/ui/interview`],
  [A persisted session snapshot; no cross-session competence model],
  [Class III evidence (spoken/free-text answers) is collected and then
   discarded rather than folded (Prop. 8.2); the richest observation channel in
   the repository currently updates nothing.],

  [`pedagogy/`],
  [A markdown checklist of four levels],
  [An ordered syllabus (P.2, row 1) with heading-derived identity (Thm. 1.1)
   and boolean gates (Prop. 2.2); the strongest domain content in the
   repository sits on the weakest learner model.],

  [Tutor skills (`lc-tutor`, `korean-jit-reader`, `rust-jit-tutor`,
   `clrs-jit-tutor`, `dsa-jit-tutor`)],
  [Dreyfus/Bloom levels per concept, held in conversation context; carried
   between sessions by asking the human to paste a summary, or re-derived by a
   fresh diagnostic],
  [The state is correct in *shape* --- per-concept, graded, with an explicit
   progression --- and has no artifact to live in (Rem. 7.2). Re-running a
   diagnostic each session is Prop. 2.3's window failure at $N = 5$.],
)

#heading(level: 2)[The unreconciled duplication]

The most consequential finding of the audit is not in the table. Two
independent adaptive systems already exist in this repository, over
*overlapping subject matter*: the in-application surfaces above, and the tutor
skills, which cover Korean, LeetCode/DSA, CLRS, and Rust --- the same domains
the applications address. They share no concept space, no belief
representation, no evidence format, and no artifact. A learner may demonstrate
mastery of union-find to `lc-tutor` on Monday and be offered a beginner
union-find drill by `leetype` on Tuesday, and neither component is
mis-implemented. Definition 1.1 plus Definition 7.2 is the smallest thing that
would reconcile them, and the reconciliation is *asymmetric and cheap*: the
skills need only be able to read and write $delta$, which is a document, not a
service.

// ═══════════════════════════════════════════════════════════════════════════
= The Minimal Sufficient Implementation
// ═══════════════════════════════════════════════════════════════════════════

Stated as obligations in dependency order, not as code. Nothing here
prescribes a language, a package layout, or a crate boundary; those are
derived decisions and belong in ADRs filed against this section.

#rule("O1 · Concept space")[
  A finite, versioned, shipped $cal(K)$ per subject matter with stable
  identifiers (Def. 1.3), a prerequisite relation, and a confusion relation.
  Authored as content, reviewed as content. *This is the first obligation and
  nothing else can be built before it.* For the Hangul domain it must
  distinguish recognition from production per glyph (Rem. 1.1). A sink
  (Def. 6.5) is an instance of the confusion relation this obligation
  already names, not a fourth relation --- the taxonomy O1 requires has room
  for it without amendment to this rule.
]

#rule("O2 · Reference profiles")[
  At least one $rho_v$ per subject matter, versioned, drawn from published
  acquisition orders, frequency data, and known confusion families (Rem. 5.2).
  A profile is a shipped file, not a computation.
]

#rule("O3 · Belief envelope")[
  One persisted document per learner, spanning all surfaces: schema version,
  profile version, sparse $delta$ keyed by concept id, bounded evidence ring,
  and nothing else (Def. 7.1). Read-time decay (Thm. 5.3), total migration
  (Thm. 7.3), export/import (Def. 7.2), and correct-but-degraded behaviour
  when absent (Thm. 7.2).
]

#rule("O4 · Estimator")[
  A pure, replayable, timestamp-ordered fold $U$ (Def. 5.1, Axiom 5.1) with
  graph propagation (Prop. 5.2), presentation correction (Cor. 3.3), and
  nuisance standardization (Prop. 9.1). No knowledge of the objective
  (Thm. 6.2).
]

#rule("O5 · Exercise algebra")[
  The tuple of Definition 4.1 and the policy vector of Definition 4.2, as
  data. `create_game_mode(&str)` is superseded (Prop. 4.1). Named modes become
  shipped valuations. $p_"credited"$ is distinct from $p_"scored"$ (Rem. 4.1).
]

#rule("O6 · Policy")[
  One handwritten $pi$ satisfying (P1)--(P5) of Definition 6.4, with $alpha$
  and $beta$ named and configurable rather than implicit (Cor. 4.2), and with
  the continuation term present in the objective (Axiom 6.1) rather than
  handled as a separate engagement feature.
]

#rule("O7 · Renderers")[
  Existing surfaces are retained and become renderers (Def. 9.1) plus
  observation producers. They hold no pedagogical state (Prop. 9.2) and each
  supplies its own latency baseline (Prop. 9.1). *No renderer is rewritten as
  part of this work.*
]

#rule("O8 · Semantic boundary")[
  Content generation moves to an authoring-time pipeline producing versioned
  artifacts (Prop. 8.1). Any runtime oracle use is a sensor emitting
  confidence-weighted observations off the critical path (Prop. 8.2), and the
  offline build is a strict subset (Thm. 8.2).
]

#heading(level: 2)[Sequencing, and what is deliberately deferred]

O1--O3 are prerequisites for everything and are the whole of the first
increment; they are also, deliberately, the increment with no visible product
change. O4--O6 are the adaptive core. O7 is a migration, not a rewrite. O8 is
independent of all of the above and may proceed in parallel.

Deferred with reasons, so that their absence is not read as oversight:
*multi-device sync* (Axiom 7.1(iii); the export document of Def. 7.2 is the
accepted substitute); *learned policies* (Cor. 6.2 keeps the seam open;
the sample budget does not exist yet); *affect modelling* (P.5); *content
authoring itself* (P.5); *calibration of $rho$ against real learners* (§12
names it a falsifier rather than a task, because it requires learners).

// ═══════════════════════════════════════════════════════════════════════════
= Falsifiers
// ═══════════════════════════════════════════════════════════════════════════

A live document must say in advance what would refute it. Each item below is
an observation that would force an amendment under §13, together with what it
would cost.

+ *A subject matter of genuine interest has no finite concept space.* If a
  target competence --- "explains a design trade-off well", "writes idiomatic
  prose" --- resists enumeration, Axiom 1.1 fails for it. Cost: the domain
  moves outside this canon, or Def. 1.1 is weakened to admit an open-ended
  residual concept with a different estimator. This is the most likely
  falsifier.

+ *Reference profiles turn out not to be sparse.* If observed learners deviate
  from $rho_v$ at most concepts rather than few, $|"dom"(delta)|$ approaches
  $|cal(K)|$ and Theorem 5.1's economy claim fails, though its structure
  survives. Cost: profiles per bucket rather than per domain, or a compressed
  deviation encoding. Detectable as soon as any real $delta$ exists.

+ *Decay parameters prove unidentifiable at this observation density.* If
  $lambda$ cannot be estimated from the volume of evidence a hobby-scale
  application collects, Definition 5.4 has a free parameter it cannot fit.
  Cost: fix $lambda$ from published forgetting curves per concept class and
  stop pretending it is learned. Cheap; probably the right default from the
  start.

+ *The instrument--intervention allocation has no stable setting.* If no
  $(alpha, beta)$ produces sessions that are both informative and tolerable,
  Theorem 4.2's tension is not merely real but binding, and the objective
  needs a third term or a constraint formulation. Cost: §6 is rewritten;
  §§1--5 survive.

+ *Continuation is not predictable from anything observable.* Axiom 6.1's
  hazard term requires that the probability of return depend measurably on
  what was delivered. If it does not --- if returning is driven entirely by
  factors outside the application --- the objective's most distinctive feature
  is inert. Cost: $J$ collapses to the unweighted sum; Remark 6.1 is withdrawn.

+ *A deterministic grader is found for a class III task, or an oracle proves
  necessary for a class I--II one.* Either would move the §8 boundary. The
  first is welcome and cheap; the second would falsify Theorem 8.1 and is the
  outcome this canon would most want to know about early.

+ *Cross-surface concept sharing proves illusory.* If "typing fluency" in
  `honeycomb` and in `leetype` turn out to be genuinely different competences
  after nuisance correction (Prop. 9.1), then the single shared $cal(K)$ of O1
  is wrong and the surfaces need disjoint concept spaces with an explicit
  mapping. Cost: moderate; O3's single envelope survives, O1 splits.

+ *The observed blocker distribution has no finite cover at any useful
  granularity.* If attempts at unclassified blockage never cluster into a
  small, reusable set of sinks --- if every stall is its own cause --- then
  Definition 6.5's $Sigma$ cannot be authored at a size a small team can
  maintain, and Theorem 6.3's totality holds only through $"route"(bot)$
  alone. Cost: the sink taxonomy is kept deliberately sparse or abandoned,
  and the fully worked fallback route is promoted from optimization to
  primary mechanism --- survivable, since by construction it is already
  correct and already non-blocking, but it forfeits whatever efficiency a
  matched bridge would have bought over it.

// ═══════════════════════════════════════════════════════════════════════════
= Amendment Protocol
// ═══════════════════════════════════════════════════════════════════════════

This canon is a live document and expects to be amended far more often than
its two siblings, because it is filed *ahead* of the source it governs rather
than after it. The discipline:

+ *Triage before source.* A new user story touching a governed workspace is
  first located in this canon. If it is derivable from an existing result,
  cite the result in the change and proceed. If it is not, the story is
  proposing an amendment, and the amendment lands first --- in the same change
  or an earlier one, never later.

+ *Amendments add; they do not rewrite.* A superseded result is retained and a
  new numbered item records the revision and its reason, in the manner of
  *The Single-Glyph Ceiling*'s Remark 6.2. Hand-assigned numbers exist so that
  a citation in a three-year-old source comment still resolves. Renumbering is
  prohibited.

+ *Falsifiers are promoted, not deleted.* When an observation in §12 occurs,
  it becomes a numbered result recording what was observed, what it refuted,
  and what replaced it. §12 is then extended with the new theory's falsifiers.

+ *Evidence is cited.* An amendment motivated by observed learner behaviour
  cites the observation. An amendment motivated by an implementation
  difficulty cites the code. An amendment motivated by neither is a change of
  taste and should be argued as one.

+ *The version line moves on every amendment*, and the change is summarized in
  a dated entry below.

#heading(level: 2)[Amendment log]

*v1.0 --- 2026-07-25.* Initial filing. Establishes the object (P.2), the
five-transformation factorization (Thm. P.2), the instrument--intervention
duality (Thm. 4.2) as the discipline's distinguishing feature, the
prior-plus-deviation-plus-ring decomposition (Thm. 5.1), lazy decay
(Thm. 5.3), eviction tolerance (Thm. 7.2), and the semantic boundary
(Thm. 8.1, Thm. 8.2). Grounded against `crates/hangul-game-core`,
`packages/ui/{honeycomb,leetype,topik,interview}`, `pedagogy/`, and the tutor
skills as of this date. No source change accompanies this filing, by design:
§11 sequences the work, and O1 is the first increment.

*v1.1 --- 2026-08-16.* Formalizes the confusion relation O1 has required
since v1.0 but left undefined: sink and bridge (Def. 6.5),
sink-is-not-a-learner-identity (Rem. 6.4), bridge losslessness (Prop. 6.3),
sinks-do-not-become-modes as a corollary of Theorem 4.1 (Cor. 6.3), and
routing totality (Thm. 6.3) --- the routing function over declared sinks
plus an unclassified state is total by construction, independent of whether
the declared sinks cover every latent cause of blockage. Falsifier added to
§12: no finite cover at any useful granularity. Filed against O1 and §6 per
this section's own triage rule, ahead of the source it governs in
`packages/ui/leetype`, per the discipline stated at v1.0's filing.

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[Appendix --- Notation Index]
// ═══════════════════════════════════════════════════════════════════════════

#table(
  columns: (auto, auto),
  stroke: 0.4pt,
  [*Symbol*], [*Meaning*],
  [$cal(K)$, $k$], [Concept space and a concept (Def. 1.1)],
  [$prec$], [Prerequisite relation; curriculum graph $(cal(K), prec)$ (Def. 1.2)],
  [$"id"(k)$], [Stable concept identifier, content-independent (Def. 1.3)],
  [$S_t = ((mu_t (k))_k, z_t)$], [Latent learner state: per-concept mastery and global traits (Def. 2.1)],
  [$mu_t (k)$], [True success probability at $k$ under reference conditions (Def. 2.1)],
  [$z_t$], [Learner-global latent traits: fatigue, engagement, input fluency (Def. 2.1)],
  [$hat(B)_t$], [Belief: per concept $(hat(mu), hat(sigma), tau, lambda)$ (Def. 2.4)],
  [$hat(sigma)$], [Dispersion; load-bearing for the information term (Thm. 2.1)],
  [$tau$], [Time the entry was last supported by evidence (Def. 2.4, Thm. 5.3)],
  [$lambda$], [Stability; governs decay rate (Def. 5.4)],
  [$o = (k, e, r, Delta t, p, t)$], [Observation (Def. 3.1)],
  [$Y(e, hat(B))$], [Evidential yield: expected uncertainty reduction (Def. 3.2)],
  [$G(e, S)$], [Intervention gain: expected improvement in true state (Def. 4.3)],
  [$e = (k, "obj", c, p, "term")$], [Exercise (Def. 4.1)],
  [$p$], [Policy vector: hint, pressure, scored, credited, retry, modality, ... (Def. 4.2)],
  [$U : hat(B) times o -> hat(B)$], [Estimator fold (Def. 5.1)],
  [$rho_v$], [Reference profile at content version $v$ (Def. 5.2)],
  [$delta$], [Sparse per-learner deviation from $rho_v$ (Def. 5.3)],
  [$Lambda_(Delta t)$], [Decay operator, applied at read time (Def. 5.4, Thm. 5.3)],
  [$W$], [Bounded evidence ring (Def. 5.5)],
  [$pi : hat(B) -> e$], [Policy (Def. 6.1)],
  [$J(pi)$], [Pedagogical objective, survival-weighted (Def. 6.2)],
  [$alpha, beta$], [Explicit allocation between intervention and measurement (Def. 6.2, Cor. 4.2)],
  [$nu$], [Renderer nuisance parameters (Def. 9.2)],
)

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[References]
// ═══════════════════════════════════════════════════════════════════════════

- Sibling canon, "The Unsettled Surface," `docs/canon/dom-state-estimation-canon.typ`
  --- the estimation-then-control factorization inherited in §P.4, and the
  format, minimal-sufficient-state-space objective, and Amendment Protocol
  discipline this document mirrors.
- Sibling canon, "The Single-Glyph Ceiling," `docs/canon/hangul-progression-canon.typ`
  --- the content-model algebra (stimulus, answer sequence, content domain)
  from which the exercises of §4 draw their material; its Remark 6.2 is the
  behaviour Corollary 3.2 derives.
- ADR 0001, "Multimodal word testing," `crates/hangul-game-core/docs/adr/0001-multimodal-word-testing.md`.
- ADR 0002, "Content-domain genericity and crate boundary," `crates/hangul-game-core/docs/adr/0002-content-domain-genericity-and-crate-boundary.md`.
- ADR 0003, "Word challenge board and overlay architecture," `crates/hangul-game-core/docs/adr/0003-word-challenge-board-and-overlay-architecture.md`.
- ADR 0004, "Mutation isolation," `crates/hangul-game-core/docs/adr/0004-mutation-isolation.md`.
- Engine source audited: `crates/hangul-game-core/src/internal/{difficulty,engine,types,stimulus,game_modes,content_domain}.rs`
  and `src/internal/game_modes/{completion,endless,vocabulary}.rs`.
- Host source audited: `packages/ui/honeycomb/src/lib/hangul/{difficulty-presets,wasm-game-bridge}`,
  `packages/ui/leetype/src/{lib/leetype/player-store,components/typing-game/leetype,types}`,
  `packages/ui/topik/src/lib/topik/core/{session-types,session-reducer}`,
  `packages/ui/interview/src/lib/interview/{session-storage,core}`.
- Curriculum source audited: `pedagogy/{README.md,docs/CONCEPTS.md,challenges}`.
- Tutor skills audited: `lc-tutor`, `korean-jit-reader`, `rust-jit-tutor`,
  `clrs-jit-tutor`, `dsa-jit-tutor` --- the parallel, unreconciled adaptive
  system identified in §10.
