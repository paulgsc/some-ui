// ═══════════════════════════════════════════════════════════════════════════
//  CANON I — The Unsettled Surface
//  A Formal Theory of State Estimation over Non-Stationary,
//  Partially-Observable DOM Environments
// ═══════════════════════════════════════════════════════════════════════════

#set document(
  title: "The Unsettled Surface",
  author: "some-ui Extensions Working Group",
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
// (the string passed as `num`), not via Typst counters. This is a deliberate
// choice: the numbers are meant to be stable citation anchors across future
// amendments (§10), and hand-assigned numbers survive section reshuffles
// more predictably than an automatic counter would.

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
  #text(size: 22pt, weight: "bold")[The Unsettled Surface]
  #v(0.4em)
  #text(size: 13pt, style: "italic")[
    A Formal Theory of State Estimation over Non-Stationary,\
    Partially-Observable DOM Environments
  ]
  #v(1.2em)
  #text(size: 11pt)[Canon I of the Extensions Transport Architecture]
  #v(0.15em)
  #text(size: 10pt)[Governing `some-censor` · `some-filter` · and all descendants]
  #v(1em)
  #text(size: 9.5pt)[Version 1.1 --- 2026-07-10]
  #v(2cm)
]

#block(inset: (left: 1.5em, right: 1.5em))[
  *Abstract.* Browser extensions that profile and mutate a vendor-controlled
  document object model routinely fail in the same structural way: they are
  authored against an implicit assumption that the DOM is, or eventually
  becomes, a deterministic, fully observable data structure. It is neither.
  This document does not begin by defining an estimator and proving things
  about it. It begins one level up, in a *Prolegomenon* that treats the
  choice of mathematical object as itself the primary result: it names the
  recurring engineering pain, strips it to a computational class, eliminates
  six candidate abstractions (tree, event stream, state machine, graph
  rewriting, temporal-logic model, cooperative replicated store) against that
  pain, and only then *derives*, rather than posits, that internal state must
  be an *estimate* and that any invariant-maintaining system over this
  environment must factor into exactly four transformations. The formal canon
  then derives, from first principles, why no finite algorithm can certify
  that a vendor page has "settled" and why no finite observation vocabulary
  can certify that a vendor page's state is "fully known." From these two
  impossibility results it obtains the only architecture compatible with
  them: a four-stage pipeline in which an unreliable, partial, reorderable
  *observation channel* feeds a *monotonic estimator* that maintains a
  provisional *hypothesis*, against which a *planner* computes the minimal
  repair needed to satisfy a declared *invariant*, which an *actuator* applies
  without re-entering the channel unfiltered. The environment is modeled not
  as a benign graph but as a *stratified, latent, endogenously-coupled, and
  optimization-pressured* substrate — every one of those four adjectives is
  cashed out as an axiom, not left as atmosphere. Every layer is stated as a
  formal object with explicit axioms, and every non-trivial claim is proved
  or falsified by exhibited counterexample. The
  model is then grounded against the production source of `some-censor` and
  `some-filter`, showing that the architecture already implicit in their
  session counters, retry loops, and identity guards is not an accumulation
  of ad-hoc patches but a set of theorems this canon makes explicit.
]

#v(0.6em)
#block(inset: (left: 1.5em, right: 1.5em))[
  *Status of this document.* This is not a design proposal. It is filed as
  the reference from which extension source is *derived*, not the other way
  around. Any future encounter with unexpected vendor behavior is first
  triaged against §10 (the Amendment Protocol) before a single line of
  TypeScript is patched. A patch that cannot be traced to an amendment of
  this canon is, by definition, a happy-path patch, and will regress.
]

#v(0.6em)
#block(inset: (left: 1.5em, right: 1.5em))[
  *What kind of object this is.* The artifact maintained here is a *theory*,
  and its maintenance discipline is *theory revision*, not bug-fixing: the
  code is disposable and re-derived, while the canon is the durable object a
  falsifying observation revises. The design objective throughout is not
  "the true model" — the true state space of a vendor runtime is unboundedly
  large and useless — but the *minimal sufficient state space*: among all
  state spaces capable of expressing the invariant $Phi$ and proving the
  properties of §5--§8, the one of least informational content, i.e. the
  smallest model from which the implementation is uniquely derivable. Every
  additional primitive carries proof obligations; every additional state
  dimension manufactures new transition cases; so the search is explicitly
  for the *smallest* adequate ontology, not merely a correct one. The
  Prolegomenon below is where that search is conducted in the open, before
  any notation is spent.
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
architecture derived here should feel *inevitable* rather than *chosen*. The
sections below climb the abstraction ladder in the order the ladder is
actually built: pain, then computational class, then a bake-off of candidate
mathematics, then the derivation of the primitive objects and operations, and
only then the axioms of §3 and the theorems of §5--§8. A reader who disagrees
with the canon should be able to attack it *here*, at the choice of object,
not merely quarrel with a definition after the object is already fixed.

#heading(level: 2, numbering: none)[P.0 · Phenomenology (the pain, stated without a cure)]

Before any abstraction, the recurring field failures, named without proposing
a fix and each paired with the tacit assumption it falsifies:

- *Whack-a-mole.* An element is repaired; moments later an
  indistinguishable element in the same role is unrepaired, or the same one
  reverts. — _Assumes: repairing the currently-visible set repairs the set._
- *Flicker / oscillation.* A key rapidly alternates repaired/unrepaired.
  — _Assumes: the observer's own writes are not themselves observed as new
  evidence._
- *Stale state after in-app navigation.* A "reviewed"/"dismissed" decision
  attaches to the wrong content after an SPA route change that recycled the
  same physical nodes. — _Assumes: a physical node's meaning is stable while
  the node persists._
- *Permanently-stuck "unresolved".* A card never leaves a pending state
  because the one event that would have advanced it never fired.
  — _Assumes: if a change happened, some subscribed event announced it._
- *Self-inflicted misreading.* A detector samples a subtree the extension
  itself just restyled, and classifies its own artifact as vendor truth.
  — _Assumes: measurement does not disturb the thing measured._

Each symptom is later shown to be not an exceptional transition to be
special-cased, but evidence that the problem was embedded in a state space
too large to be correct — an *ontological* error the way a type error is a
*syntactic* one.

#heading(level: 2, numbering: none)[P.1 · Computational characterization]

Strip the browser away. What remains is: *maintain a declared invariant over
an environment that (i) you do not control, (ii) you cannot fully observe,
and (iii) never certifiably halts.* This is not scheduling (nothing is being
ordered for throughput), not search or optimization (there is no objective
functional to extremize), not consensus (there is no peer to agree with).
It is the conjunction of two classical problems: *state estimation* over a
partially observable process, followed by *invariant-maintaining control* of
it. Naming the class is all P.1 claims; that estimation is *forced* rather
than merely available is argued in P.3, and must not be assumed here.

#heading(level: 2, numbering: none)[P.2 · Candidate models, and why five are rejected]

The falsifiable core of this document. Each row is a mathematical object
capable, on its face, of modeling "a changing DOM"; the verdict column is the
attack the pain of P.0 makes on it. Only the object surviving every attack
is carried into §1.

#table(
  columns: (3.6cm, 2.1cm, 1fr),
  stroke: 0.4pt,
  inset: 6pt,
  [*Candidate object*], [*Verdict*], [*Decisive objection*],
  [DOM as a labeled *tree/graph*],
  [Rejected],
  [The invariant is stated over logical keys ($KK$), not tree topology; and
   node identity is not stable (§4), so the graph's own vertices are not
   durable enough to hang state on.],
  [DOM as an *event stream* (streaming / process algebra)],
  [Rejected],
  [A stream model presumes the stream is the truth; §2.3 proves any finite
   event vocabulary is incomplete, so the stream is a lossy, reorderable
   *shadow* of the mutations, never their log (Prop 3.1).],
  [DOM as an observable *state machine*],
  [Rejected],
  [State is not directly observable: the observer cannot read $G_t$, only its
   partial effects. A state machine you cannot read the state of is exactly a
   *hidden*-state process, which is a different object.],
  [DOM as a *graph-rewriting system*],
  [Rejected],
  [The rewrite rules are the vendor's unknown, Turing-complete program (§2.1);
   rewriting is undecidable to analyze (Prop 2.1) and its node identities are
   recycled without announcement (Prop 4.1). The formalism buys nothing the
   opacity does not immediately take back.],
  [DOM as a *temporal-logic / model-checking* target],
  [Rejected],
  [Model checking requires a *known, bounded* transition system to check
   against. Here the transition function is unknown and the state space
   unbounded, so there is no Kripke structure to hand the checker.],
  [DOM as a *cooperative replicated store* (pure CRDT)],
  [Partly adopted],
  [CRDT convergence — a commutative, idempotent, associative merge — is
   *exactly* the estimator's fold (Thm 5.1) and is retained. But a CRDT
   assumes every replica eventually broadcasts all its updates; the vendor is
   a replica that never cooperates, so the *transport* assumption fails even
   though the *merge* assumption holds.],
  [DOM as a *partially observable, non-stationary dynamical system*, estimated
   then controlled],
  [*Accepted*],
  [Survives every objection above: it presumes neither observability of state,
   nor completeness of events, nor stability of identity, nor a known
   transition function, nor a cooperative peer — while still borrowing CRDT
   merge for the estimator and the reconcile-loop pattern for control. It is
   the *smallest* object retaining what works and discarding every assumption
   the pain of P.0 falsifies.],
)

#remark("P.0")[
  The accepted object is not the *most expressive* one — a full simulation of
  the vendor runtime would be strictly more expressive. It is the *minimal
  sufficient* one (see "What kind of object this is," front matter): the least
  it can be while still expressing $Phi$ and proving §5--§8. Expressiveness
  beyond that point is pure liability, because every unused degree of freedom
  is a class of states the implementation would otherwise have to consider.
]

#heading(level: 2, numbering: none)[P.3 · The necessity of estimation (derived, not defined)]

The estimator of §5 is not a design decision. It is forced, in five steps,
by the accepted object alone:

#proposition("P.1", name: "Estimation is forced")[
  Any extension over the environment of Definition 2.1 must maintain internal
  state that is a *hypothesis* about the environment, never a *copy* of it.
]

#proof[
  (1) The extension does not control the environment: its next state is
  $f(G_t, omega_t)$ with $f$ and $omega_t$ exogenous (Definition 2.1). (2)
  Hence it cannot issue a command guaranteed to take effect; the most it can
  do is apply a mutation that re-enters the same unreliable channel it reads
  from (Axiom 3.5). (3) It receives only *evidence*, never ground truth: no
  finite observation vocabulary is complete (Proposition 2.2), so silence is
  never proof of no-change. (4) Therefore no internal structure it maintains
  can *be* $G_t$ or $iota_t$ — it can only be a claim about them, refutable by
  the next token. (5) A refutable, evidence-derived claim about a hidden
  process *is* an estimate, and the discipline maintaining it *is* state
  estimation. The estimator is thus obtained, not selected.
]

Read in the reverse of the usual direction: one does not *define* an
estimator and then justify it; one observes that non-control plus
incompleteness *leaves no other object available*.

#heading(level: 2, numbering: none)[P.4 · The four transformations (a theorem, not a diagram)]

"Observe, estimate, plan, act" is customarily drawn as a pipeline diagram — a
design. It is instead a consequence:

#theorem("P.2", name: "Mandatory factorization")[
  Any system that maintains a declared invariant over an environment it
  neither controls nor fully observes must contain four *logically distinct*
  transformations — a *channel* turning environment effects into evidence, an
  *estimator* folding evidence into a maintained hypothesis, a *planner*
  mapping (hypothesis, invariant) to a repair, and an *actuator* enacting the
  repair back onto the environment — and no two may be collapsed into one
  without forfeiting a property proved in §3--§8.
]

#proof[
  The four are pairwise irreducible. *Channel $!=$ estimator:* evidence
  arrives lossy, duplicated, and reordered (Axioms 3.1--3.3), so raw evidence
  is not yet a coherent state; recovering order-independence requires a
  separate convergent fold (Theorem 5.1), which the channel, being unable to
  certify completeness (Prop 3.1), cannot itself perform. *Estimator $!=$
  planner:* the hypothesis is provisional and invariant-agnostic (Definition
  5.1), whereas the repair is a function of an externally declared $Phi$
  (Definition 6.2); folding the invariant into the estimator would make the
  merge non-monotonic and void Theorem 5.1's confluence. *Planner $!=$
  actuator:* the planner is a pure function producing a description $Delta$
  (Definition 6.2), while actuation re-enters the environment and must be
  self-tagged to remain sound (Axiom 3.5, Theorem 7.2); merging them would
  place an impure, channel-perturbing write inside the one stage that must
  stay referentially transparent for one-round termination (Theorem 6.1) to
  hold. *Actuator $!=$ channel:* by Remark 8.1 there must be exactly one path
  from actuation back to the estimator, and it must be the same path vendor
  mutations take; a shortcut from actuator to estimator is precisely the
  privileged side channel that would break loop suppression. Four distinct
  transformations, no fewer.
]

Only now — with the count of stages and the boundary between them *forced* —
does §8 give them names and an operational semantics. The architecture is a
theorem with an implementation, not a diagram with a rationale.

#heading(level: 2, numbering: none)[P.5 · Progressive elimination of impossible worlds]

The minimal-sufficient-state-space objective, made operational, is a descent
in which each refinement *discards* a class of worlds the implementation
thereafter need not consider. The chain the canon walks:

+ *All DOM mutations are possible.* (The unrefined world; nothing is ruled
  out.)
+ *Only observations matter* — the estimator never sees mutations, only
  tokens (§3). Worlds differing solely in unobserved mutations collapse.
+ *Only logical identities matter* — tokens are indexed by $KK$, not by
  physical node (§4). Worlds differing solely in node identity collapse.
+ *Only hypotheses over logical identities matter* — the state is $hat(H) :
  KK -> "Attr" union {bot}$ (§5), not a DOM mirror. Worlds agreeing on
  $hat(H)$ are indistinguishable to the planner.
+ *Only hypothesis transitions respecting the evidentiary order are
  admissible* — $U = max_(prec.eq)$ (§5.2--5.3). Every non-monotone
  transition is ruled out by construction.

By the last step the degrees of freedom remaining in a conforming
implementation are few, which is the real claim behind "the code falls out."
It also reframes debugging: *an edge case is not an exceptional transition;
it is evidence that the problem is still embedded in a space larger than this
descent has yet shrunk it to.* The fix is to eliminate the offending world at
the earliest step that admits it, not to add a transition at the last.

#heading(level: 2, numbering: none)[P.6 · The canon as a theory-revision system]

Everything above explains why §10 (the Amendment Protocol), not any theorem,
is the load-bearing section. The workflow this document institutes is not
`reality → requirements → implementation → bug → patch`, in which the revised
artifact is the code. It is `reality → observation → current theory →
counterexample → theory revision → re-derived implementation`, in which the
revised artifact is *this file*. A field failure is triaged to the *assumption
it falsified* (§10.1) and repaired at the level of an axiom or a definition;
the affected downstream theorems are re-derived; and only then is code
re-emitted from the revised theory. Code is downstream and disposable. The
canon is the object under revision.

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= Preliminaries and Notation
// ═══════════════════════════════════════════════════════════════════════════

This canon treats the browser tab as a laboratory instrument observing a
process it does not control. Before any claim can be stated, the universe of
discourse must be fixed.

#definition("1.1", name: "Discrete round")[
  Time is modeled as a discrete, well-ordered index $t in NN$, a *round*.
  Rounds do not correspond to wall-clock intervals of fixed length; a round
  is any indivisible unit of change the vendor's runtime commits between two
  points at which the observer could, in principle, take a measurement (a
  microtask checkpoint, an animation frame, an event-loop tick). No upper
  bound on the number of rounds in a browsing session is assumed, and none
  may be assumed — see Proposition 2.1.
]

#remark("1.5", name: "Phase stratification within a round")[
  A round is a unit of *sequence*, not of *phase*. The vendor's event loop is
  stratified: `MutationObserver` callbacks drain in the microtask phase,
  layout and paint occur under `requestAnimationFrame`, and slack work runs
  under `requestIdleCallback`. Two actions the sequence orders as "same round"
  may in fact straddle a phase boundary — the estimator ingesting a token in
  a microtask while the actuator writes in the next animation frame. This
  canon's convergence results (Theorem 5.1) are deliberately *phase-blind*:
  they hold under any reordering of evidence, and phase-reordering of evidence
  is a special case. But *actuation scheduling* — which phase $alpha$ writes
  in — is not phase-blind, because writing during the vendor's layout phase
  induces jank and can itself provoke mutation (Remark 2.6). Phase is
  therefore not modeled in the estimator, where it is provably irrelevant, and
  *is* an explicit obligation of the sensor driver, where it is not (§8.3,
  §10.1).
]

#definition("1.2", name: "Universes")[
  Three disjoint universes are fixed:
  - $"Node"$ --- the (unbounded, time-varying) set of *physical* DOM node
    identities the vendor's runtime may allocate. Physical identity is
    ephemeral: a node may be destroyed and a structurally similar node
    allocated later without any relationship being declared between them.
  - $KK$ --- the (extension-defined, stable) set of *logical keys* the
    invariant $Phi$ (§6) is actually stated over -- e.g. a YouTube video ID.
    Logical keys are what the business rule cares about; physical nodes are
    merely where evidence about a logical key is currently rendered.
  - $"Attr"$ --- the set of observable local properties a node may carry
    (attribute values, class membership, computed style, text content, and
    so on).
]

#definition("1.3", name: "Preorder shorthand")[
  $prec.eq$ denotes a preorder ("no less advanced than") fixed by context; its
  strict part is $prec$; its induced equivalence is $approx$. Every use of
  $prec.eq$ in this canon is *total* on the domain it is applied to (proved,
  not assumed, at each use site) so that $max_(prec.eq)$ is always
  well-defined.
]

#remark("1.4")[
  Nothing below assumes a specific vendor, framework, or rendering strategy.
  The model is deliberately blind to whether the DOM is produced by React,
  a hand-rolled SPA router, server-streamed HTML, or Shadow DOM web
  components. Any property claimed here that turns out to depend on such a
  detail is a bug in this canon, not a property of the DOM, and must be
  routed through §10.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Hidden Environment
// ═══════════════════════════════════════════════════════════════════════════

== The vendor process

#definition("2.1", name: "Vendor process")[
  The vendor page at round $t$ is a finite directed graph
  $ G_t = (V_t, E_t), quad V_t subset.eq "Node", quad E_t subset.eq V_t times V_t, $
  together with a labeling $L_t : V_t -> "Attr"$. The trajectory is governed
  by an unknown, non-stationary transition function
  $ G_(t+1) = f(G_t, omega_t), $
  where the input decomposes as
  $ omega_t = omega_t^"exo" + g(alpha(Delta_(t-1))) $
  into an *exogenous* part $omega_t^"exo"$ --- user interaction, a timer
  firing, a network response arriving, a `requestAnimationFrame` callback, an
  `IntersectionObserver` crossing a threshold, or any other scheduled
  continuation of the vendor's own program --- and an *endogenous* part
  $g(alpha(Delta_(t-1)))$, the vendor's own reaction to the observer's most
  recent actuation (§7), routed through an unknown coupling $g$. Neither $f$,
  nor $g$, nor the distribution of $omega_t^"exo"$ is known to, or
  controllable by, the observer. The endogenous term is small print with
  large consequences and is developed in Remark 2.6.
]

#remark("2.2")[
  $f$ is not merely unknown; it is realized by a Turing-complete client-side
  program (the vendor's bundled JavaScript). This single fact is the source
  of both impossibility results below, and is why this canon reaches for
  computability theory rather than settling for an empirical "pages are
  flaky" framing. Flakiness is not a defect to be engineered around; it is
  the correct behavior of an environment whose next state is a function of
  a program the observer never gets to read.
]

#remark("2.4", name: "The substrate is optimization-pressured, not merely unknown")[
  $f$ is not a neutral unknown. The vendor is an economic actor optimizing its
  own objectives --- Core Web Vitals, bundle size, memory footprint, render
  latency --- and its build pipeline will de-duplicate, inline, virtualize, or
  prune exactly the DOM structure an extension keys on when that structure is
  cheap to eliminate. This upgrades the framing of Remark 2.2 from "flaky" to
  *adversarial-by-optimization*: the observer should expect its load-bearing
  selectors and attributes to erode not through malice but through the
  vendor's relentless pressure to ship less DOM. An architecture must
  therefore treat the durability of any single observable feature as a
  depreciating asset, which is a further, independent reason no fixed
  observation vocabulary can be trusted to remain complete (Proposition 2.2)
  or even stable.
]

#remark("2.6", name: "Endogenous coupling (actuation-induced mutation)")[
  The environment is not a closed box the observer merely watches: the
  actuator writes to $G_t$, and $f$ *reads* $G_t$, so the observer's own
  actuation is an input to the vendor's process --- the $g(alpha(Delta_(t-1)))$
  term of Definition 2.1. Adding a class, inserting a node, or restyling a
  subtree can trip the vendor's framework into a re-render, which arrives back
  as fresh evidence. This *topological porosity* between §2 (environment) and
  §7 (actuator) is the mechanistic root of "whack-a-mole": the loop is not
  merely observing a moving target, it is partly *driving* the target it
  observes. The canon confines the damage in two places --- Axiom 3.5 makes
  re-entrance a first-class channel property, and Theorem 7.2 (loop
  suppression) proves the loop still terminates *provided* actuation is
  idempotent and self-tagged, i.e. provided $g compose alpha$ reaches a fixed
  point rather than a cycle. Where it does not, Corollary 7.2.1(iii) classifies
  the residual oscillation as genuine environment contention, not a bug.
]

== Impossibility of universal settlement

#proposition("2.1", name: "No decider for settlement")[
  There is no algorithm $D$ that, given the vendor's program $P$ and an
  initial state $G_0$, decides in finite time whether there exists a round
  $T$ such that $G_t = G_T$ for every $t >= T$ (i.e. whether the page
  *settles*).
]

#proof[
  By reduction from the Halting Problem. Suppose $D$ exists. Let $M$ be an
  arbitrary Turing machine and $w$ an input; construct a vendor page $P_(M,w)$
  whose script, on every round, executes one further step of a simulation of
  $M$ on $w$ and, so long as $M$ has not halted, toggles a class on a
  sentinel node (a DOM mutation); once $M$ halts, $P_(M,w)$ performs no
  further mutation, ever. Then $P_(M,w)$ settles if and only if $M$ halts on
  $w$. Feeding $P_(M,w)$ and its initial state to $D$ would therefore decide
  the Halting Problem, contradicting Turing (1936). Hence $D$ cannot exist.
]

#corollary("2.1.1")[
  A browser extension is strictly weaker than $D$: it cannot inspect $P$'s
  source, only $G_t$'s effects. It follows that no extension may assume the
  existence of a round $T$ after which "the page is done." Any code path
  whose correctness depends on reaching such a $T$ --- a fixed timeout
  treated as *completion* rather than *abandonment*, a one-shot
  `querySelectorAll()` treated as exhaustive --- is unsound by construction,
  independent of how rarely it is observed to fail in practice. Proposition
  2.1 does not claim every page mutates forever; it claims no algorithm run
  by the observer can *certify* that a given page has stopped, which is the
  only claim the architecture in §5--§8 needs.
]

== Impossibility of a truth-authority signal

#definition("2.2", name: "Manifest and latent state")[
  The vendor's true state at round $t$ partitions, from the observer's
  standpoint, into a *manifest* subspace and a *latent* subspace. The
  *manifest* subspace is what any channel $delta$ (§3) can in principle range
  over: the graph $G_t$ and the observable labels $L_t$ --- attribute values,
  class membership, computed style, text, structure. The *latent* subspace is
  everything the vendor's runtime carries that no configuration of $delta$ can
  observe: attached event-listener sets, live CSSOM rules not yet reflected in
  any element's computed style at a sampled node, framework-internal component
  state, and content rendered to `<canvas>` or across a closed Shadow root.
  The map from true state to manifest state is a *projection*: it forgets the
  latent coordinates entirely.
]

#proposition("2.2", name: "No complete observation vocabulary")[
  For any finite observation vocabulary $EE = {E_1, dots, E_n}$ fixed at
  authoring time (DOM event types, `MutationObserver` callback categories,
  or finite boolean combinations thereof), there exists a reachable vendor
  behavior that alters $G_t$ without causing any $E_i in EE$ to fire.
]

#proof[
  $EE$ is closed and finite by construction --- it is written into the
  extension's source before the vendor has shipped whatever release the
  extension will eventually run against. The vendor's implementation space
  is not closed: across independent, uncoordinated deploys, the vendor may
  introduce a visibility change via a newly inserted stylesheet rule rather
  than an inline style or class mutation on the watched subtree; may render
  behind a Shadow DOM boundary outside the observer's configured `subtree`
  scope; may signal state purely through an `IntersectionObserver` callback
  with no corresponding DOM mutation at all; may render to `<canvas>` with
  no DOM representation whatsoever; or may simply rename the very attribute
  the observer keys on. None of this requires adversarial intent on the
  vendor's part --- an ordinary refactor suffices, since the vendor owes the
  observer no notice and no compatibility guarantee. Because $EE$ is fixed
  and the vendor's future implementation space is not, for every candidate
  $EE$ a change exists that evades it. $EE$ therefore cannot certify
  completeness.
]

#remark("2.3")[
  Proposition 2.2 makes the observation channel a *sound but incomplete*
  abstraction of the true mutation stream, in exactly the sense of Cousot
  and Cousot's abstract interpretation (1977): firing of $E_i$ is reliable
  evidence that *some* tracked change occurred (soundness); silence from
  every $E_i in EE$ is never reliable evidence that *no* change occurred
  (incompleteness). Treating a `MutationObserver` callback, or any other
  single signal, as a "truth source" conflates these two directions. This is
  precisely why `some-censor`’s observer narrows `attributeFilter` to
  `["data-video-id"]` and *still* cannot be the only channel --- see §9.1,
  which shows the production code already compensates for exactly this gap.
]

#remark("2.5", name: "Observability asymmetry sharpens 2.2")[
  Proposition 2.2 as proved says the vendor can change *how* it signals, in a
  way a fixed vocabulary misses. Definition 2.2 lets a strictly stronger claim
  be stated: the vendor can move state *out of the manifest subspace
  altogether*. A visibility decision expressed as a live CSSOM rule injection,
  a state change carried only in an event-listener rebind, a value held in
  framework-internal memory, or a frame drawn to `<canvas>` --- none of these
  is a manifest mutation that $delta$ merely happened not to subscribe to;
  each is *structurally outside the projection* of Definition 2.2, so no
  configuration of $delta$, however exhaustive, could subscribe to it. Where
  Proposition 2.2 defeats *completeness of a vocabulary*, this defeats
  *completeness of the manifest channel as such*. The architectural
  consequence is identical and reinforcing: the estimator's silence can never
  be read as the environment's silence, and the only sound response to
  suspected latent state is to re-derive it from whatever manifest projection
  it eventually casts a shadow onto (a repaint, a reflow, a re-observed
  attribute), never to wait for a signal the latent subspace is not obligated
  to emit.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Observation Channel
// ═══════════════════════════════════════════════════════════════════════════

Section 2 established that the observer cannot access $G_t$ and cannot be
told, completely or on schedule, when $G_t$ has changed. What it receives
instead is formalized here.

#definition("3.1", name: "Token")[
  A *token* is a tuple $s = (k, a, tau)$ where $k in KK$ is a claimed logical
  key, $a subset.eq "Attr"$ is a set of locally observed properties, and
  $tau in NN$ is a *local* timestamp assigned by the channel implementation
  itself (a logical tick, not a wall-clock reading --- see Remark 5.1 on
  why this sidesteps cross-machine clock skew). A token asserts nothing beyond: "as of local tick $tau$, I
  believe key $k$ carries properties $a$." It is not a command and it is not
  a guarantee.
]

#definition("3.2", name: "Observation channel")[
  The observation channel is a relation $delta$ between the true mutation
  sequence $mu_1, mu_2, dots$ realized by $f$ (Definition 2.1) and the token
  sequence $s_1, s_2, dots$ actually delivered to the estimator. $delta$ is
  deliberately under-specified; §3.1 fixes only the properties it is
  required to satisfy.
]

== Channel axioms

#axiom("3.1", name: "Lossiness")[
  $delta$ need not be total: a mutation $mu_i$ may produce zero tokens.
]

#axiom("3.2", name: "Duplication")[
  $delta$ need not be injective: the same underlying fact may be delivered
  as two or more distinct token occurrences, $s_i = s_j$ for $i != j$.
]

#axiom("3.3", name: "Reordering")[
  For $mu_i$ realized before $mu_j$ ($i < j$), the tokens $delta(mu_i)$ and
  $delta(mu_j)$ carry no guarantee of arriving in that order in the
  delivered stream.
]

#axiom("3.4", name: "Deletion by absence")[
  There is no reserved token shape asserting "key $k$ no longer exists."
  Removal is inferred, never announced: the estimator must treat the
  *absence* of continued evidence, or the physical disconnection of a
  previously-bound node, as the only available signal of removal. (This is
  not a limitation the architecture works around --- Definition 6.1 folds it
  directly into the invariant-evaluation contract.)
]

#remark("3.3", name: "Tombstoning versus decay: absence is not deletion")[
  Axiom 3.4 must be read carefully, because a naive reading of it is unsound.
  There are two epistemically distinct grounds for removing a key from the
  hypothesis, and the DOM affords only the weaker one:
  - *Tombstoning* --- an active, positive proof that key $k$ is gone. This is
    the clean signal a log would provide; Axiom 3.4 says the DOM does not
    provide it.
  - *Decay* --- a downgrade of $hat(H)(k)$ toward $bot$ driven by *sustained
    absence of reinforcing evidence*, never by a single observation.
  The trap is to treat *physical disconnection of the bound node* as a
  tombstone. Under virtualization (Proposition 4.1) a node scrolling
  off-screen is disconnected while its logical key remains perfectly alive;
  reading disconnection as deletion therefore *false-positives* exactly on the
  vendor's most common optimization. The sound treatment is decay: absence
  lowers confidence gradually, so a key briefly unobserved is not evicted,
  while a key absent past a staleness bound is. Decay is a *controlled*
  departure from the strict monotonicity of §5 --- it is the one sanctioned
  downward move --- and is admissible only when gated by the epoch (Definition
  5.4) and the per-ingestion identity-continuity check (Corollary 4.1.1), so
  that it can never be confused with the *upward* merge of new evidence. An
  ungated, per-observation decay would reintroduce precisely the flicker
  Theorem 5.1 exists to forbid.
]

#axiom("3.5", name: "Actuator re-entrance")[
  The channel does not, by default, distinguish a token caused by the
  vendor's own process from a token caused by the observer's own actuation
  (§6) re-entering the same subtree. Distinguishing the two is the
  responsibility of the actuator, not the channel, and must be achieved by
  an explicit, channel-visible self-tag (§7.4).
]

#axiom("3.6", name: "Observability asymmetry")[
  $delta$ ranges only over the manifest subspace (Definition 2.2). The vendor
  may, at any round and without notice, migrate a state distinction from the
  manifest subspace into the latent one --- expressing henceforth via an
  injected stylesheet rule, an event-listener rebind, framework-internal
  memory, or a `<canvas>` draw what it previously expressed via a watched
  attribute or class. After such a migration the distinction is *structurally*
  invisible to $delta$: not merely unsubscribed-to, but outside the projection
  $delta$ can observe at all. No reconfiguration of $delta$ recovers it; only
  a manifest shadow the latent state later casts (a repaint, a reflow, a
  derived attribute) can.
]

#proposition("3.1", name: "The channel is not a log")[
  No implementation of $delta$ satisfying Axioms 3.1--3.4 can be upgraded,
  by any local change to the delivery mechanism alone, into a total,
  order-preserving, deduplicated log of $mu_1, mu_2, dots$ without
  additional information the vendor does not provide.
]

#proof[
  A total, order-preserving, deduplicated log would certify, by its
  completeness, that no mutation occurred outside those recorded --- exactly
  the certificate Proposition 2.2 shows cannot exist for any fixed,
  finite observation vocabulary. Since any concrete $delta$ is realized by
  some finite vocabulary of DOM APIs (`MutationObserver` configuration,
  event listeners, polling predicates), Proposition 2.2 applies to it
  directly.
]

== The hybrid channel

#definition("3.3", name: "Hybrid channel")[
  Let $SS_"event"$ be the sub-channel realized by push-based subscriptions
  (`MutationObserver`, DOM events) and $SS_"poll"$ the sub-channel realized
  by time- or activity-triggered re-sampling of a *holding set* of keys the
  event channel has not yet resolved. The channel actually available to the
  estimator is
  $ SS = SS_"event" union SS_"poll". $
]

#remark("3.2")[
  $SS_"poll"$ is not a fallback bolted on for robustness; it is the direct,
  necessary compensator implied by Proposition 2.2. Because no finite event
  vocabulary can certify completeness, an architecture relying on
  $SS_"event"$ alone inherits an unbounded, silent failure mode: a key stuck
  in "unresolved" forever, with nothing left to wake it. $SS_"poll"$ trades
  latency for the one property $SS_"event"$ structurally cannot offer ---
  a *bound* on how long a key may remain unresolved. §9.1 identifies
  `retryUnresolved()` and its 500ms interval in `some-censor` as exactly
  this compensator, and explains why it is triggered by both a timer and
  "any observer activity," not by a signal specific to any one held key.
]

// ═══════════════════════════════════════════════════════════════════════════
= Identity Reconciliation
// ═══════════════════════════════════════════════════════════════════════════

A subtlety Proposition 2.2 does not by itself surface: even when a token
*is* delivered, the observer must still determine which logical key it is
evidence *for*. This is a distinct problem from ordering evidence about a
known key (§5), and failing to separate the two is a common source of the
"whack-a-mole" failure mode the primer motivating this canon names directly.

#definition("4.1", name: "Identity resolution")[
  Let $iota_t : "Node" -> KK$ (partial, and only defined where extraction
  succeeds) be the *true* mapping from a physical node to the logical key it
  currently renders. $iota_t$ is not observed; it is estimated by an
  extraction function
  $ xi : "Node" times "Attr" -> {("full", k, a) , ("partial", k), ("raw")} $
  applied fresh at every ingestion, never cached across rounds without
  re-validation. The three-way codomain is deliberate: "full" (a key and
  its full property set are extractable now), "partial" (a key is
  extractable but some required property is not yet), "raw" (nothing
  actionable yet).
]

#remark("4.1")[
  This three-way split is not a simplification for exposition; it is load
  bearing. A binary success/failure extraction discards exactly the
  information that lets the estimator mount a *provisional* hypothesis
  entry while a slower-hydrating property is still pending, instead of
  discarding all partial evidence and waiting for the next full resolution
  attempt. §9.1 shows this is precisely `some-censor`’s `"raw" | "video-only"
  | "full"` classification, introduced specifically because the binary
  version measurably left cards unresolved indefinitely.
]

#proposition("4.1", name: "Identity non-permanence")[
  $iota_t(n) = iota_(t')(n)$ is *not* guaranteed for $t' > t$ even when node
  $n$ remains connected to the document and no environment-wide
  discontinuity (§5.3) has occurred. A physical node may be recycled by the
  vendor's own rendering strategy (list virtualization, keyed-diff reuse) to
  carry a different logical key, with no token asserting the change and no
  removal token for the old key (Axiom 3.4).
]

#proof[
  By exhibited behavior: a virtualized list scroller detaches off-screen
  content from a node and re-populates the *same* node with a different
  item's content to avoid a DOM allocation, an optimization entirely
  internal to the vendor's rendering library and invisible from outside it.
  No axiom in §3 forbids this, and Proposition 2.2 already establishes the
  observer cannot enumerate every internal optimization strategy a vendor
  might adopt, now or in a future release.
]

#corollary("4.1.1")[
  Every ingestion must re-derive $xi(n, dot)$ and compare it against the
  key the estimator *previously* associated with $n$, rather than trusting
  that a node's associated key is invariant once established. A mismatch is
  itself an event --- an *implicit* deletion of the old key's hypothesis
  entry that Axiom 3.4 guarantees will never arrive as an explicit token.
  §9.1 identifies this exactly as `some-censor`’s per-element
  previous-vs-current `data-boyo-vid` comparison in `upsert()`, run on
  *every* extraction regardless of whether extraction otherwise succeeded.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Estimator
// ═══════════════════════════════════════════════════════════════════════════

== Hypothesis and order

#definition("5.1", name: "Hypothesis")[
  The estimator's internal state is a *hypothesis*
  $ hat(H) : KK -> "Attr" union {bot}, $
  the observer's current best explanation of $iota$ and $L$ restricted to
  the keys it has ever received evidence for. $hat(H)(k) = bot$ denotes "no
  evidence yet." $hat(H)$ is provisional by construction: it is a claim
  about the world, never the world itself.
]

#definition("5.2", name: "Per-key evidentiary order")[
  Fix a key $k$. Tokens about $k$ are compared by the lexicographic order
  $ (epsilon, iota, tau), $
  where $epsilon$ is the *epoch* the token was ingested under (Definition
  5.4), $iota$ is the *extraction tier* it carries (Definition 4.1’s
  codomain, ordered $"raw" prec "partial" prec "full"$), and $tau$ is the
  local timestamp of Definition 3.1, used only to break ties within equal
  $(epsilon, iota)$. Write $prec.eq$ for this order restricted to tokens
  sharing key $k$.
]

#remark("5.1")[
  $prec.eq$ is total on same-key tokens because it is a lexicographic product
  of totally ordered coordinates by construction --- this is a design
  decision, not an empirical fact about the channel. A channel axiom (§3)
  never guarantees comparability on its own; the estimator *manufactures*
  totality by choosing an order whose coordinates it controls (epoch and
  tier are the estimator's own bookkeeping; $tau$ is the estimator's own
  clock, immune to cross-machine skew precisely because it is never compared
  across two different observer instances).
]

#definition("5.3", name: "Monotonic update")[
  $ U(hat(H), s) = hat(H) "with entry" k "replaced by" max_(prec.eq) (hat(H)(k), s). $
]

== Confluence

#theorem("5.1", name: "Order-independence of the estimator")[
  Fix $k$ and let $M = {s_1, dots, s_n}$ be any finite multiset of tokens
  about $k$ delivered by round $r$ under Axioms 3.1--3.3, in any delivery
  order $sigma$ and with any multiplicity. Then the hypothesis
  $hat(H)_r (k)$ obtained by folding $U$ over $M$ in order $sigma$ is
  independent of $sigma$ and of the multiplicity of any repeated element,
  and equals $max_(prec.eq) ({hat(H)_0 (k)} union M)$.
]

#proof[
  By Definition 5.2, $prec.eq$ is total on tokens sharing key $k$; a finite
  totally preordered set always has a maximum. By Definition 5.3, $U$ is
  exactly $max_(prec.eq)$ applied pointwise. $max$ over a totally preordered
  set is idempotent ($max(x,x) = x$), commutative ($max(x,y) = max(y,x)$),
  and associative ($max(x, max(y,z)) = max(max(x,y), z)$) --- elementary
  order-theoretic facts, not properties assumed of the channel. A fold of a
  commutative, idempotent, associative binary operation over a multiset is
  invariant under permutation (commutativity, associativity) and under
  repetition of any element (idempotence) of that multiset. The fold is
  therefore exactly $max_(prec.eq) ({hat(H)_0(k)} union M)$, independent of
  $sigma$.
]

#corollary("5.1.1")[
  Axioms 3.1 (loss), 3.2 (duplication), and 3.3 (reordering) are
  individually and jointly harmless *to the final value* $hat(H)_r(k)$,
  provided every token that was ever going to be delivered is eventually
  delivered at least once. This proviso is a channel *fairness* property,
  not a corollary of Theorem 5.1 --- Theorem 5.1 says nothing about tokens
  that are permanently lost. A permanently-lost unique maximum leaves
  $hat(H)(k)$ under-approximating the truth *indefinitely*, which is exactly
  why §3.2 mandates $SS_"poll"$ as a structural, not optional, component:
  polling re-issues evidence the event channel failed to deliver, restoring
  fairness for keys at risk of permanent loss.
]

== Epoch dominance

#definition("5.4", name: "Epoch")[
  An *epoch* $epsilon in NN$ is a monotonically increasing counter, advanced
  only by a distinguished *reset* operator $bot_epsilon$ that discards the
  entire hypothesis and begins a fresh epoch. Reset is reserved for
  environment-wide discontinuities the observer can bound --- typically a
  vendor-emitted navigation signal --- not for per-key evidence updates.
]

#lemma("5.2", name: "Necessity of epoch dominance")[
  If the per-key order (Definition 5.2) omits the epoch coordinate --- i.e.
  orders tokens by $(iota, tau)$ alone --- and the environment recycles a
  physical node $n$ (Proposition 4.1) such that $iota_t(n) = k_1$ for
  $t < t_r$ and $iota_t(n) = k_2 != k_1$ for $t >= t_r$, then a reachable
  delivery sequence exists under which a high-tier, user-driven property
  recorded against $k_1$ (e.g. "user has dismissed this") is retained and,
  through the identity collision, silently applied to $k_2$'s hypothesis
  entry, in violation of any invariant $Phi$ that distinguishes "reviewed"
  from "unreviewed" content.
]

#proof[
  By exhibited trace, which Proposition 4.1 already establishes as
  reachable and Axiom 3.4 already establishes cannot be preempted by an
  explicit invalidation token: the recycling event alone emits no token that
  a tier-only order can interpret as a downgrade, because tier-dominance was
  calibrated for "the same entity becoming better known," not for "a
  different entity now occupying the same physical carrier." Without an
  epoch coordinate strictly dominating tier, no token the recycling event
  can produce forces the required downgrade, so the stale high-tier value
  survives.
]

#corollary("5.2.1", name: "Two independent granularities of invalidation")[
  Soundness under identity recycling requires *two* mechanisms operating at
  different granularities, not one:
  + A *global* epoch (Definition 5.4), advanced on environment-wide
    discontinuities the observer can bound and detect (e.g. a
    vendor-emitted single-page-app navigation event).
  + A *per-key* identity-continuity check (Corollary 4.1.1), performed at
    *every* ingestion, because Proposition 4.1 shows recycling is not
    guaranteed to coincide with, or be announced by, any environment-wide
    discontinuity at all.
  Neither mechanism subsumes the other. §9.1 shows `some-censor` implements
  precisely this pair: `SessionId` for (i), the `_elToVid` previous-key
  comparison inside `upsert()` for (ii) --- and that a third, finer
  granularity (a per-entry async version counter, guarding in-flight
  `Promise` races within a single key's lifetime) exists one level below
  both, because the same order-theoretic pattern recurs at every scale a
  race can occur.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Planner
// ═══════════════════════════════════════════════════════════════════════════

#definition("6.1", name: "Invariant")[
  An invariant is a predicate $Phi : hat(H) -> {0,1}$ the extension exists to
  maintain. In every case this canon has been asked to govern, $Phi$
  decomposes as a conjunction of *local*, per-key predicates,
  $ Phi(hat(H)) = 1 quad "iff" quad forall k in KK, quad phi(k, hat(H)(k)) = 1, $
  each decidable from $hat(H)(k)$ alone. (§8 flags what changes when this
  decomposition fails to hold.)
]

#definition("6.2", name: "Planner")[
  The planner is a pure function
  $ P(hat(H), Phi) = Delta, quad Delta(k) = cases(
    "target"(k) & "if" phi(k, hat(H)(k)) = 0,
    emptyset & "if" phi(k, hat(H)(k)) = 1,
  ) $
  $Delta$ is the *minimal repair*: it touches exactly the keys currently
  failing $phi$, and specifies nothing for keys already satisfying it.
]

#theorem("6.1", name: "One-round termination under local invariants")[
  If $Phi$ decomposes as in Definition 6.1, a single evaluation of $P$
  against any $hat(H)$ produces a $Delta$ whose application yields
  $hat(H)'$ with $Phi(hat(H)') = 1$, and evaluating $P$ again against
  $hat(H)'$ (with no intervening evidence) yields $Delta' = emptyset$.
]

#proof[
  Immediate from Definition 6.2: $Delta$ is defined pointwise per key from
  the *current* $hat(H)$ alone (not from history), and for every $k$,
  applying $"target"(k)$ makes $phi(k, dot)$ hold by the definition of
  $"target"$. Since $Phi$ is a conjunction over $k$ of $phi$, and every $k$
  now satisfies $phi$, $Phi(hat(H)') = 1$. Re-evaluating $P$ against
  $hat(H)'$ then returns $emptyset$ for every $k$ by the second case of
  Definition 6.2.
]

#remark("6.1")[
  When $Phi$ does *not* decompose locally --- e.g. a global cardinality
  bound such as "at most $N$ elements are simultaneously masked" --- Theorem
  6.1’s one-round argument no longer applies, and existence of a fixed point
  must instead be argued via the Knaster--Tarski theorem for monotone
  predicates over a complete lattice. No extension currently governed by
  this canon requires a non-local $Phi$; if one is proposed, its planner
  must be re-derived under §10 before it is implemented, not patched
  ad hoc against a locally-decomposed planner that was never designed for
  it.
]

// ═══════════════════════════════════════════════════════════════════════════
= Convergence, Self-Stabilization, and the Actuation Hazard
// ═══════════════════════════════════════════════════════════════════════════

== What "correct" can and cannot mean

#definition("7.1", name: "Quiescence")[
  The environment is *$t_0$-quiescent* if $omega_t = emptyset$ for all
  $t >= t_0$. By Proposition 2.1, quiescence is never certifiable by the
  observer and is not assumed to ever hold globally; it is a *local*,
  possibly temporary condition the theorems below are stated relative to.
]

#definition("7.2", name: "Bounded delivery")[
  The channel satisfies *$R$-bounded delivery* if every mutation realized at
  or before round $t_0$ has an associated token (per Axioms 3.1--3.3,
  duplicated or reordered but present) delivered by round $t_0 + R$.
]

#theorem("7.1", name: "Bounded recovery under quiescence")[
  If the environment is $t_0$-quiescent, the channel satisfies $R$-bounded
  delivery, the actuator satisfies self-exclusion (Axiom 3.5, discharged per
  §7.4), and identity recycling has been resolved per Corollary 5.2.1, then
  there exists $t_1 <= t_0 + R$ such that $Phi(hat(H)_t) = 1$ for all
  $t >= t_1$.
]

#proof[
  By $R$-bounded delivery, every true mutation at or before $t_0$ has a
  token delivered by $t_0 + R$. By Theorem 5.1, the hypothesis after
  processing all such tokens equals the true per-key maximum regardless of
  delivery order or duplication, independent of when within $[t_0, t_0+R]$
  each arrives. By Theorem 6.1, one further planner evaluation against that
  hypothesis drives $Phi$ to 1. By the Loop Suppression Theorem (7.2,
  below), no further, self-inflicted churn re-opens $Phi$ absent new
  environment-driven evidence, and quiescence guarantees there is none.
  Hence some $t_1 <= t_0 + R$ satisfies the claim.
]

#corollary("7.1.1", name: "Recurrent maintenance, not completion")[
  Proposition 2.1 forbids assuming the environment is *ever* permanently
  quiescent. Theorem 7.1 therefore does not license "the extension is done"
  as an achievable global state. The property this architecture actually
  delivers, and the only property it should be judged against, is: *for
  every quiescent sub-interval, however short, $Phi$ holds throughout that
  interval's tail, within a bound depending only on channel delivery
  latency* --- not on how the interval began. This is the formal content of
  the primer's "self-stabilization," made precise.
]

== Loop suppression

#theorem("7.2", name: "Loop suppression")[
  If actuation is idempotent (applying $"target"(k)$ to a $k$ already
  satisfying $phi(k, dot)$ is a no-op on $G_t$) and self-tagged (§7.4), then
  for any key $k$ whose environment-driven mutation rate is zero over an
  interval, the closed loop channel $->$ estimator $->$ planner $->$
  actuator $->$ channel cannot sustain an infinite sequence of non-empty
  $Delta(k)$ over that interval.
]

#proof[
  By induction on planner rounds within the interval. Base case: after any
  round in which $Delta(k) != emptyset$ is applied, $phi(k, dot)$ holds by
  Definition 6.2. Inductive step: the next token concerning $k$ is either
  (a) environment-driven --- excluded by hypothesis over this interval --- or
  (b) an echo of the actuator's own write. By self-tagging, an echo is
  recognized at ingestion as consistent with the already-achieved target
  state, so $U$ applied to it leaves $hat(H)(k)$ unchanged (it is
  $prec.eq$-dominated by, or merges to, the value already recorded).
  $phi(k, dot)$ therefore still holds after ingestion, so the next planner
  evaluation again yields $Delta(k) = emptyset$ by Definition 6.2. By
  induction, no round in the interval after the first repair produces a
  non-empty $Delta(k)$.
]

#corollary("7.2.1", name: "Diagnostic contrapositive")[
  Sustained oscillation observed on a key $k$ implies at least one of: (i)
  actuation is not actually idempotent at the DOM level; (ii) self-tagging
  is missing or incomplete, so an actuator echo is misread as new evidence;
  or (iii) the environment's mutation rate on $k$ is genuinely non-zero
  (in which case oscillation is not a bug --- it is the correct, continuous
  re-assertion of $Phi$ against a vendor that keeps contesting it). §10
  requires triaging any reported "flicker" or "whack-a-mole" symptom against
  exactly this trichotomy before a fix is written.
]

== The actuation-observation coupling hazard

#proposition("7.3", name: "Measurement disturbance")[
  Let $alpha : Delta -> "mutation"$ be the actuator's realization map. If
  $alpha$'s output is composited into the same subtree a *detector*
  subsequently samples to produce evidence for a causally related key, and
  that output is not excluded from the detector's sampling (a violation of
  Axiom 3.5 specific to the detector/actuator pair), the estimator is fed
  evidence of its own artifact rather than of vendor truth, corrupting the
  hypothesis it was meant to refine.
]

#proof[
  Direct from Axiom 3.5: the channel does not, by default, distinguish
  actuator-caused tokens from vendor-caused ones. A detector is simply a
  particular consumer of the channel; nothing exempts it from Axiom 3.5’s
  scope unless the actuator's output is explicitly excluded from what that
  consumer samples.
]

#corollary("7.3.1", name: "The prepaint corollary")[
  §9.2 identifies a textbook, previously-shipped instance: a full-page
  anti-flash veil was realized by restyling the vendor's own elements with
  high-specificity overrides; `getComputedStyle` sampling for theme
  detection then read the veil's colors, not the vendor's, and the fix
  required by Proposition 7.3 was to remove the veil from the *ancestor
  chain* of vendor nodes entirely (an out-of-band overlay) rather than
  attempt to "see through" a self-imposed distortion. Filtering after the
  fact cannot repair a violation of Axiom 3.5; only structural exclusion
  can.
]

== Self-tagging

#definition("7.3", name: "Self-tag")[
  A self-tag is a channel-visible marker (an attribute, a naming convention,
  an ownership flag) attached to every actuator-authored node or mutation,
  checked at two points: (i) by any detector sampling the subtree, to
  exclude self-authored nodes from evidence about the vendor's state; and
  (ii) by the estimator's own ingestion path, to recognize an echo of its
  own write as Theorem 7.2 requires.
]

#remark("7.2", name: "Bidirectional self-tagging")[
  A self-tag alone discharges Axiom 3.5 in the "did I write this" direction
  but not in the converse: "was something I wrote just removed, by me or by
  the vendor?" A vendor-driven `innerHTML` replacement can silently delete
  an actuator-owned node without the actuator ever being informed via any
  channel this canon has assumed so far. §9.2 documents an *ownership
  signal* --- a flag distinct from the tag itself, cleared only by the
  actuator's own intentional teardown --- that lets a self-healing observer
  distinguish "I removed this" from "the vendor removed this out from under
  me" and re-assert only in the latter case. This is Theorem 7.2’s
  precondition extended to cover deletion, not just mutation, of the
  actuator's own output.
]

// ═══════════════════════════════════════════════════════════════════════════
= The Transport Layer Architecture
// ═══════════════════════════════════════════════════════════════════════════

§2--§7 derived, rather than assumed, the following pipeline. This section
restates it as the concrete architectural contract any sensor driver,
estimator, or planner implementation must satisfy, independent of language
or extension.

== Stages

+ *Channel* --- realizes $SS = SS_"event" union SS_"poll"$ (Definition 3.3)
  against a specific vendor surface. Owns nothing beyond token production;
  performs no mutation.
+ *Estimator* --- realizes $U$ (Definition 5.3) against $SS$'s output,
  maintaining $hat(H)$ (Definition 5.1). Performs no mutation, contains no
  business logic beyond the ordering of Definition 5.2.
+ *Planner* --- realizes $P$ (Definition 6.2) against $hat(H)$ and $Phi$.
  Performs no mutation; only computes $Delta$.
+ *Actuator* --- realizes $alpha$ against $Delta$. The *only* stage
  permitted to write to $G_t$, and required to self-tag (Definition 7.3)
  every write.

== Operational semantics

#rule("(OBS)")[
  $mu_t in "legal-mutations"(G_t)$, $s = delta(mu_t)$ (possibly
  empty, possibly duplicated, per Axioms 3.1--3.3) #linebreak()
  $=>$ enqueue $s$ onto the pending token queue $Q$.
]

#rule("(ING)")[
  $s = "head"(Q)$, $k = "key"(s)$ #linebreak()
  $=>$ $hat(H)(k) := max_(prec.eq) (hat(H)(k), s)$; dequeue $s$ from $Q$.
]

#rule("(PLAN)")[
  $Delta = P(hat(H), Phi)$ #linebreak()
  $=>$ if $Delta != emptyset$, proceed to (ACT); otherwise no state change.
]

#rule("(ACT)")[
  $G_(t+1) = alpha(Delta)(G_t)$, output self-tagged per Definition 7.3
  #linebreak()
  $=>$ re-enters the environment; subsequent evidence of this write is
  produced only via (OBS), never through a privileged side channel.
]

#remark("8.1")[
  (ACT)'s conclusion is the formal statement of "the actuator never modifies
  the estimator directly," the architectural boundary from which Theorem
  7.2 (loop suppression) is derived. There is exactly one path from
  actuation back to the estimator, and it is the same path vendor mutations
  take.
]

== Sensor-driver conformance checklist

A new channel implementation (a new vendor surface, a new extension) is
conformant with this canon if and only if it can discharge, in writing,
each of the following against Axioms 3.1--3.5:

- Which observation modalities constitute $SS_"event"$, and an explicit
  acknowledgment (not a workaround) of what Proposition 2.2 guarantees they
  will miss.
- What constitutes $SS_"poll"$'s holding set, its re-sampling cadence, and
  the fairness argument (Corollary 5.1.1) that justifies treating that
  cadence as an acceptable bound on staleness.
- The concrete realization of $iota_t$ (Definition 4.1) and the
  per-ingestion continuity check required by Corollary 4.1.1.
- The concrete realization of epoch (Definition 5.4): what vendor-emitted
  signal, if any, triggers $bot_epsilon$, and what happens in its absence.
- The concrete self-tag (Definition 7.3) and, if any detector reads the
  same subtree the actuator writes, the structural exclusion required by
  Proposition 7.3 --- not a post-hoc filter.
- Which state distinctions the driver assumes are *manifest* (Definition 2.2),
  and its plan for a distinction the vendor may migrate to *latent* (Axiom
  3.6): which manifest shadow (repaint, reflow, derived attribute) it will
  re-derive the distinction from, since no reconfiguration of $delta$ recovers
  a latent one directly.
- The *phase* (Remark 1.5) in which the actuator writes, and the argument that
  writing there does not fight the vendor's own layout phase or induce the
  endogenous mutation of Remark 2.6.
- The eviction policy: whether removal is by physical disconnection or by
  *decay* (Remark 3.3), and --- if disconnection is used --- the explicit
  argument that virtualization (Proposition 4.1) cannot false-positive it. A
  driver over a virtualized surface must justify decay, gated by epoch and the
  identity-continuity check, rather than hard-deleting on disconnect.

// ═══════════════════════════════════════════════════════════════════════════
= Case Studies
// ═══════════════════════════════════════════════════════════════════════════

This canon is not offered as an abstract exercise. Both governed extensions
already implement it, in places by necessity discovered the hard way before
this document existed. This section is the reconciliation: it shows the
theorems above are not a new design to migrate toward, but the explanation
for invariants the source already asserts as comments.

== `some-censor`

*Environment and epoch.* `extensions/some-censor/src/lib/content/session.ts`
mints `SessionId` as a branded monotonic counter --- exactly Definition 5.4’s
$epsilon$. `Controller`’s invariant C2
(`extensions/some-censor/src/lib/content/controller.ts`) records, in its own
words, that SPA chip/feed navigation *reuses* renderer elements in place,
so a purely connectivity-based eviction (`prune()`) cannot clear stale view
state from a recycled card. This is a restatement, arrived at
independently, of Lemma 5.2: without an epoch dominating the merge order, a
recycled node's stale high-tier state survives. `_teardownRuntime()` +
`_setupRuntime()` on `yt-navigate-finish` is $bot_epsilon$.

*Identity reconciliation.* `VideoManager.upsert()`
(`video-manager.ts`) compares the freshly extracted `videoId` against the
previous `data-boyo-vid` recorded on the *same physical element*, and
destroys the stale entry when they differ --- this is Corollary 4.1.1’s
per-ingestion continuity check, executed independently of any epoch
boundary, exactly because Proposition 4.1 shows recycling need not coincide
with one.

*Hybrid channel.* `observer.ts` implements $SS_"event"$ as two signals: an
`attributeFilter` on `data-video-id` (Proposition 2.2’s finite,
necessarily-incomplete vocabulary, chosen because it fires only *after*
YouTube's own hydration of that subtree) and `childList`/`subtree`
mutations. `VideoManager`’s `_unresolved` map plus `retryUnresolved()` on a
500ms interval realize $SS_"poll"$ precisely as Remark 3.2 predicts:
"unresolved" is not treated as failure, it is treated as *pending*, re-
sampled independent of any specific triggering event, so that a card whose
`data-video-id` never produces a usable attribute mutation is not stuck
forever.

*Extraction tiers.* `extract/index.ts`’s three-way
`raw | video-only | full` classification is Definition 4.1’s codomain by
another name, introduced (per its own comment) because a binary
success/failure split left the majority of cards unresolved indefinitely ---
an empirical rediscovery of Remark 4.1.

*Fractal monotonicity.* Three independent scales of the same order-theoretic
pattern (Theorem 5.1’s $max_(prec.eq)$) are present simultaneously:
`SessionId` at the environment scale (Definition 5.4), extraction tier at
the per-key scale (`video-only` $prec$ `full`, `_backfill` never downgrading
a resolved channel per `VideoEntry`’s Entry-4 invariant), and a per-entry
`_version` counter at the *intra*-key async scale (`VideoEntry._applyView`,
guarding against a stale `Promise` resolution overwriting a newer one). This
is not three separate mechanisms; it is one theorem applied wherever a race
can occur, and any future extension exhibiting a fourth kind of race should
expect a fourth application of the same pattern, not a bespoke fix.

*Loop suppression.* `data-boyo-vid` and the manager's registry membership
jointly self-tag every actuator-owned card (Definition 7.3); `_promote()`’s
existing-entry repair path (Invariant M2, upsert idempotence) is exactly
Theorem 7.2’s idempotent-actuation precondition.

== `some-filter`

*The measurement disturbance instance.* ADR 0001
(`extensions/some-filter/docs/adr/0001-dark-mode-pipeline-rework.md`)
documents, independently of this canon, precisely Proposition 7.3: the
prior prepaint veil restyled the vendor's own elements with `!important`
overrides, so `getComputedStyle` read the veil's colors during
classification, not the vendor's --- Finding 2 in the ADR is a restatement
of the measurement-disturbance proof. The adopted fix --- an overlay
promoted to the top layer, anchored to `document.documentElement` rather
than as an ancestor of vendor nodes --- is exactly the *structural
exclusion* Corollary 7.3.1 requires, not the filtering-after-the-fact the
same corollary rules out.

*Self-tag.* `[data-my-ext]`, checked by `theme-detector.ts`’s sampling walk
(`el.hasAttribute("data-my-ext") || el.closest("[data-my-ext]")`) at every
tier of its sampling, is Definition 7.3’s self-tag, discharged at the
*detector* rather than the actuator, because in this extension it is the
detector whose evidence must be protected from the actuator's own output.

*Bidirectional self-tagging.* `prepaint.ts`’s `sw-dirty` class on
`document.documentElement` is a distinct signal from the veil element's own
tag: it exists so a self-healing observer can tell "the veil is gone because
I intentionally removed it" (`disablePrepaint()` clears `sw-dirty` *first*)
from "the veil is gone because a vendor body-replacement swept it away
unintentionally" (`sw-dirty` still set $=>$ recreate). This is exactly
Remark 7.2’s extension of Axiom 3.5 to deletion.

*Apply-then-detect under Proposition 2.1.* The ADR's adopted flow --- theme
first under the veil, detect against true vendor colors, restore only if
already-dark, then remove the veil last --- is a direct instance of Theorem
7.1’s structure: act toward the invariant under an *incomplete* hypothesis
(no quiescence has been certified, nor could it be, per Proposition 2.1),
then continuously re-observe and re-reconcile, rather than waiting for a
settlement signal that Proposition 2.1 already proves cannot be relied
upon.

// ═══════════════════════════════════════════════════════════════════════════
= The Amendment Protocol --- Canon Law
// ═══════════════════════════════════════════════════════════════════════════

== Triage procedure

Any future encounter with unexpected vendor behavior --- a flicker, a
missed mutation, a stuck "unresolved" entry, a stale masked/revealed state
surviving navigation --- is routed through the following procedure *before*
a patch is written against extension source. A patch that skips this
procedure is, by construction, a happy-path patch: it will silence the
symptom without addressing which of §2--§7’s preconditions failed, and will
resurface in a different guise.

+ *Does the failure manifest as evidence contradicting an already-repaired
  key, immediately after actuation?* Suspect a violation of Axiom 3.5 or an
  incomplete self-tag (Definition 7.3, Remark 7.2). Extend the self-tag or
  its detector exclusion; do not add a timeout or a "just re-check" guard.
+ *Does the hypothesis never reach $Phi$ despite an apparently quiescent
  page?* Suspect a failure of $R$-bounded delivery (Definition 7.2).
  Extend $SS_"poll"$'s coverage or $SS_"event"$'s subscription set
  (selectors, `attributeFilter`, event types); do not shrink the invariant
  to match what the current channel happens to observe.
+ *Does the same physical carrier now represent the wrong logical entity?*
  Suspect a gap in the per-ingestion identity-continuity check (Corollary
  4.1.1) or a missing epoch boundary (Lemma 5.2). Extend the identity
  reconciliation check at ingestion; do not add element-specific special
  casing downstream of the estimator.
+ *Does the hypothesis flicker or regress on duplicate or reordered
  evidence?* Suspect a non-total or mis-specified per-key order (Definition
  5.2) --- audit the epoch/tier/timestamp construction directly; do not add
  a debounce as a substitute for a correct order.
+ *Ontological obscuring: did the vendor move the distinction out of the
  manifest subspace?* If the evidence that used to arrive simply stopped, and
  the state is now carried in injected CSS, a listener rebind, framework
  memory, or `<canvas>` (Axiom 3.6), do not widen $delta$ to chase a signal
  that no longer casts a manifest shadow. Re-derive the distinction from the
  manifest shadow it *does* cast (Remark 2.5), or amend §2 to record the
  latent migration.
+ *Epistemic ambiguity: are we confusing physical absence with logical
  deletion?* If a key is being evicted while it is still logically alive
  (classically, on a virtualized scroll), the eviction rule is treating
  disconnection as a tombstone. Replace it with gated *decay* (Remark 3.3);
  do not special-case the scroll container.
+ *Topological coupling: did our own actuation trigger the mutation?* If the
  contested mutation appears only after, and only because of, an actuator
  write (the $g compose alpha$ term of Remark 2.6), the fix is idempotent,
  self-tagged actuation reaching a fixed point (Theorem 7.2), not a longer
  debounce on the echo.
+ *Temporal stratification: are we observing and acting in different phases?*
  If the race is between a microtask ingestion and an animation-frame write
  (Remark 1.5), reschedule actuation into a phase that does not fight the
  vendor's layout; do not paper over a phase-boundary race with a `setTimeout`.
+ *None of the above?* The anomaly is evidence of a gap in this canon's own
  axioms, not merely in an implementation of them. File the amendment
  against §2 or §3 first --- extending the channel or environment model ---
  and only then re-derive the affected downstream theorems and the source
  that depends on them.

== Non-negotiables

The following may never be reintroduced, in this or any descendant
extension, regardless of how a specific incident appears to motivate them:

- *No assumed settlement time.* Any code path that treats a fixed timeout,
  a single `requestIdleCallback`, or an absence of recent mutations as
  *completion* rather than *current best estimate* violates Proposition
  2.1. A timeout may bound how long the observer waits before acting on its
  current hypothesis; it may never be read as evidence that the hypothesis
  is now exhaustive.
- *No single truth-oracle event.* Any code path whose correctness depends
  on one observer callback, one custom event, or one selector query having
  fired violates Proposition 2.2. Every such signal must be treated as
  sound-but-incomplete evidence feeding $U$, never as a gate that, once
  passed, is assumed never to need re-checking.
- *No unfiltered actuation re-entrance.* Any DOM write performed by an
  actuator that is not self-tagged (Definition 7.3) and, where a detector
  shares its subtree, not structurally excluded (Corollary 7.3.1) violates
  Axiom 3.5 and voids Theorem 7.2’s guarantee.
- *No silent cross-epoch or cross-identity merges.* Any merge of evidence
  into an existing hypothesis entry that has not passed both the epoch
  check (Definition 5.4) and the per-ingestion identity-continuity check
  (Corollary 4.1.1) violates Lemma 5.2 and can silently apply one logical
  entity's state to another.

== Versioning

This canon is versioned independently of any extension's release cadence.
A change to §2 or §3 (the environment or channel model) is a *major*
amendment and requires re-deriving every theorem in §5--§8 that depended on
the changed axiom before any source change lands. A change that adds a case
study (§9) or sharpens the triage procedure (§10.1) without altering an
axiom or theorem is a *minor* amendment. No amendment may be recorded
solely as a source-code commit message; it must be reflected in this file.

*Recorded amendments.*
- *v1.0 → v1.1* (2026-07-10). A *major* amendment: it adds axioms to the
  environment and channel model (§2--§3) and a Prolegomenon that derives,
  rather than posits, the object the rest of the canon reasons about. New
  environment/channel content: the Prolegomenon (phenomenology, candidate-model
  elimination, the necessity-of-estimation proof P.1, the mandatory-factorization
  theorem P.2, the impossible-worlds descent, and the theory-revision framing);
  Definition 2.2 (manifest vs latent state) and Axiom 3.6 (observability
  asymmetry); the endogenous decomposition of $omega_t$ (Definition 2.1, Remark
  2.6); Remark 2.4 (optimization-pressured substrate); Remark 1.5 (phase
  stratification); and Remark 3.3 (tombstoning vs decay). Downstream theorems in
  §5--§8 were reviewed against each new axiom and stand unchanged --- the new
  axioms sharpen the environment the existing theorems already tolerate; they do
  not weaken a precondition any theorem relied on. The conformance checklist
  (§8.3) and triage (§10.1) were extended to exercise the new axes.

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[Appendix A --- Glossary]
// ═══════════════════════════════════════════════════════════════════════════

#table(
  columns: (auto, auto, auto),
  stroke: 0.4pt,
  [*Canonical term*], [*`some-censor`*], [*`some-filter`*],
  [Hidden environment $G_t$], [YouTube's rendered DOM], [Arbitrary vendor page DOM],
  [Epoch $epsilon$ / $bot_epsilon$], [`SessionId` / teardown+restart on `yt-navigate-finish`], [Tab navigation / extension enable-disable cycle],
  [Logical key $KK$], [`VideoId`], [Themed page / tab id],
  [Identity resolution $xi$], [`tryExtract()` --- `raw \| video-only \| full`], [`classifyPage()` sampling walk],
  [Hypothesis $hat(H)$], [`VideoManager`’s `_byVideo` map], [Detector's luminance sample set],
  [Per-key order $prec.eq$], [session $>$ tier $>$ `_version`], [(single-shot classification, no multi-tier merge yet)],
  [Invariant $Phi$], [every un-whitelisted, unrevealed video is masked], [page communicates at correct effective luminance],
  [Planner $P$], [`upsert()` / `_promote()` / `_backfill()`], [`theme-apply.ts`’s apply/restore branch],
  [Actuator $alpha$], [`DomHandle.apply()`], [`applyTheme()` / `restoreVendor()`],
  [Self-tag], [`data-boyo-vid`, registry membership], [`[data-my-ext]`],
  [Ownership signal (deletion-direction)], [(not yet separated from self-tag)], [`sw-dirty` class on `<html>`],
  [Hybrid channel poll leg $SS_"poll"$], [`retryUnresolved()`, 500ms interval], [(single-shot; no poll leg yet --- candidate future amendment)],
  [Manifest / latent (Def. 2.2, Ax. 3.6)], [`data-video-id` attr (manifest); React virtualization / internal state (latent)], [Sampled computed style (manifest); injected CSSOM veil rules (latent)],
  [Endogenous coupling (Rem. 2.6)], [vendor re-render provoked by a `data-boyo-vid` write], [vendor body-replacement reacting to the prepaint veil],
  [Eviction: decay vs disconnect (Rem. 3.3)], [`prune()` is disconnect-based; decay under virtualization is a candidate amendment], [(no long-lived per-key hypothesis to evict yet)],
)

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[Appendix B --- Notation Index]
// ═══════════════════════════════════════════════════════════════════════════

#table(
  columns: (auto, auto),
  stroke: 0.4pt,
  [*Symbol*], [*Meaning*],
  [$G_t = (V_t, E_t)$], [Hidden vendor DOM graph at round $t$ (Def. 2.1)],
  [$f, omega_t$], [Vendor transition function; input (Def. 2.1)],
  [$omega_t^"exo"$, $g(alpha(Delta_(t-1)))$], [Exogenous vs endogenous (actuation-induced) input (Def. 2.1, Rem. 2.6)],
  [Manifest / latent], [Observable vs $delta$-invisible state subspaces (Def. 2.2, Ax. 3.6)],
  [$EE$], [Fixed, finite observation vocabulary (§2.2)],
  [$delta$], [Channel delivery relation (Def. 3.2)],
  [$s = (k, a, tau)$], [Token: key, properties, local timestamp (Def. 3.1)],
  [$SS = SS_"event" union SS_"poll"$], [Hybrid observation channel (Def. 3.3)],
  [$iota_t$], [True physical-to-logical identity map (Def. 4.1)],
  [$xi$], [Identity/property extraction function (Def. 4.1)],
  [$hat(H)$], [Estimator's hypothesis (Def. 5.1)],
  [$prec.eq$], [Per-key evidentiary order: epoch $>$ tier $>$ timestamp (Def. 5.2)],
  [$U$], [Monotonic update, $= max_(prec.eq)$ pointwise (Def. 5.3)],
  [Decay], [Gated downward eviction under sustained absence (Rem. 3.3)],
  [$epsilon$, $bot_epsilon$], [Epoch counter, reset operator (Def. 5.4)],
  [$Phi$, $phi$], [Global invariant, its per-key decomposition (Def. 6.1)],
  [$P$, $Delta$], [Planner, minimal repair set (Def. 6.2)],
  [$alpha$], [Actuator realization map (§7.3)],
  [$t_0$-quiescent], [No exogenous input from $t_0$ onward (Def. 7.1)],
  [$R$-bounded delivery], [Every mutation at or before $t_0$ delivered by $t_0+R$ (Def. 7.2)],
)

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[References]
// ═══════════════════════════════════════════════════════════════════════════

- A. M. Turing, "On Computable Numbers, with an Application to the
  Entscheidungsproblem," 1936. --- undecidability underlying Proposition 2.1.
- P. Cousot and R. Cousot, "Abstract Interpretation: A Unified Lattice Model
  for Static Analysis of Programs by Construction or Approximation of
  Fixpoints," POPL 1977. --- the sound/incomplete framing of Remark 2.3.
- L. Lamport, "Time, Clocks, and the Ordering of Events in a Distributed
  System," CACM 1978. --- logical clocks underlying the local timestamp
  $tau$ of Definition 3.1.
- E. W. Dijkstra, "Self-Stabilizing Systems in Spite of Distributed
  Control," CACM 1974. --- the recurrent-maintenance framing of Corollary
  7.1.1.
- M. Shapiro, N. Preguica, C. Baquero, M. Zawirski, "Conflict-Free
  Replicated Data Types," 2011. --- state-based convergence via commutative,
  idempotent merge, underlying Theorem 5.1.
- B. Knaster and A. Tarski, "Un theoreme sur les fonctions d'ensembles,"
  1928. --- fixed-point existence for the non-local-invariant case of Remark
  6.1.
- Y. Bar-Shalom, T. Fortmann, "Tracking and Data Association," 1988. --- the
  data-association framing underlying §4’s identity reconciliation, distinct
  from ordering evidence about an already-resolved key.
- Kubernetes controller / reconciliation-loop pattern (`kubernetes/kubernetes`,
  `sig-apps` design docs). --- an independently-arrived-at instance of the
  observe/estimate/plan/act separation of §8, offered as convergent
  engineering evidence rather than a formal source.
- DarkReader (`darkreader/darkreader`, MIT license). --- reference study
  underlying `some-filter`’s ADR 0001 (§9.2); the "apply first, refine
  after" ordering it establishes is the engineering precedent for Theorem
  7.1’s structure. Code derived from it must retain DarkReader's MIT notice
  per ADR 0001 §5, independent of this canon.
