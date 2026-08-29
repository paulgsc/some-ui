// ═══════════════════════════════════════════════════════════════════════════
//  CANON I — The Unprovable Measurement
//  A Formal Theory of Complexity Pedagogy under Confounded Evidence,
//  Authored Propositional Mapping, and Unconditional Progression
// ═══════════════════════════════════════════════════════════════════════════

#set document(
  title: "The Unprovable Measurement",
  author: "some-ui Complexity Pedagogy Working Group",
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
// the three sibling canons in this directory do it: the numbers are stable
// citation anchors across future amendments (§13). This canon has a second,
// stronger reason — §7's register is cited *by identifier from source code*
// and checked mechanically (Rem. 7.1), so a renumbering is not a cosmetic
// change here, it is a broken build.

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
  #text(size: 22pt, weight: "bold")[The Unprovable Measurement]
  #v(0.4em)
  #text(size: 13pt, style: "italic")[
    A Formal Theory of Complexity Pedagogy under Confounded Evidence,\
    Authored Propositional Mapping, and Unconditional Progression
  ]
  #v(1.2em)
  #text(size: 11pt)[Canon I of the Complexity Pedagogy Architecture]
  #v(0.15em)
  #text(size: 10pt)[
    Governing `@some-ui/leetype` · `crates/leetype_wasm` ·\
    `packages/some-content/prompts/leetype-exercise-generator` · `pedagogy/`
  ]
  #v(1em)
  #text(size: 9.5pt)[Version 1.0 --- 2026-08-28]
  #v(2cm)
]

#block(inset: (left: 1.5em, right: 1.5em))[
  *Abstract.* LeetType was built on the premise that a learner demonstrates
  competence by *producing* source under a reveal loop. That premise has a
  defect this document treats as its founding observation: production is
  *blocking*. A learner who cannot type the witness cannot advance, so the
  surface selects for learners who already have the competence it exists to
  build, and everyone else abandons. The repair is not a difficulty dial. It
  is a change of subject: the artifact under assessment stops being the
  source and becomes the *diff*, the source demotes to revealable evidence,
  and the load-bearing act stops being production and becomes *selection* ---
  matching a diff to the theoretical proposition it witnesses. This document
  derives, rather than posits, why that object is forced. It establishes the
  cost algebra under which a complexity claim is *computed* from control-flow
  structure rather than asserted (§2); the admissibility relation a constraint
  perturbation actually moves (§3); and then the result that gives the canon
  its title and its whole architecture --- *Theorem 4.1*, that no finite set
  of runtime observations entails a complexity class, so the execution
  surface this design is built around is permanently *apparatus* and
  permanently not *subject*. From there the remaining structure is forced: a
  diff is a witness to a graph rewrite and minimality is semantic distance,
  not line count (§5); the diff-to-proposition mapping must be authored,
  total, and never inferred, which is precisely what licenses a verdict with
  no semantic verifier behind it (§6); the propositions must be a numbered,
  cross-round register cited by identifier from source, not a per-exercise
  bag of strings (§7); the round cycle never repeats a failed round but
  re-poses it one level up, at the constraint (§8); progression is
  unconditional while credit is not, and --- because the entire interaction
  alphabet reduces to pointing --- the small-screen surface is the *reference*
  surface rather than a degraded fallback (§9); and a proposition is discharged only
  by transfer plus negative discrimination, never by one correct selection
  over a closed set (§10). The sibling canon *The Unobservable Learner* is
  inherited wholesale for belief, decay, persistence and the oracle boundary;
  this canon adds the object those mechanisms are maintained *over*, and does
  not re-derive any of them.
]

#pagebreak()

#outline(depth: 2, indent: auto)

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[Prolegomenon --- why the object is a selection]
// ═══════════════════════════════════════════════════════════════════════════

#heading(level: 2, numbering: none)[P.1 · The pain, stated before any model]

#remark("P.0", name: "The founding observation")[
  The surface `packages/ui/leetype` shipped in M20 is, mechanically, correct:
  the reveal loop converges, the gate is provable without a DOM, the corpus
  validates at module load, and the whole thing is derived from a decision
  record that anticipated most of its own objections. It is nonetheless
  built on a premise that cannot hold, and the premise is visible in one
  sentence of its own documentation: _"a step is finished when its proof is
  typed."_

  Three consequences, each observed rather than predicted:

  + *Production is blocking.* The learner must emit the witness. If they
    cannot, the reveal loop eventually shows it to them and they copy it ---
    at which point the interaction has measured transcription, not
    competence. The gate's own mitigation (a miss is a repeat, capped at
    three attempts) is an admission of this: the cap exists because without
    it _"the player can always eventually reach the end"_ stops being true.

  + *The competency being probed is not the competency being trained.* Typing
    fluency against one's own baseline is a real measurement of a real thing.
    It is not a measurement of whether the learner can tell why a nested scan
    multiplies and a sequential one adds. The surface's own slogan concedes
    this --- _"a competency probe whose only input modality happens to be
    typing"_ --- and LTY-MOBILE is the first thing to take it seriously, by
    replacing the modality on a phone. This canon takes it seriously
    everywhere.

  + *The exercise is not epistemic.* Nothing in the M20 loop asks the learner
    to hold a claim, commit to it before seeing the answer, and be wrong in a
    way the system can use. It asks them to reproduce a fragment. Syntax
    pedagogy is a real subject and is not this one.
]

#axiom("P.1", name: "Abandonment is the binding constraint")[
  A learning surface whose next state is gated on an unassisted correct
  production has an expected session length bounded by the learner's existing
  competence, not by their interest. Every design decision in this canon that
  looks permissive is paying this axiom.
]

#heading(level: 2, numbering: none)[P.2 · Six candidate objects, eliminated]

The question this section answers is not _"what should the game look like"_
but _"what mathematical object is the unit of interaction," _ because the
answer to the second forces most of the answers to the first.

#table(
  columns: (auto, auto, 1fr),
  stroke: 0.4pt,
  [*Candidate*], [*Verdict*], [*Why*],

  [*Complexity quiz* --- show code, ask for its $Theta$ class],
  [Rejected],
  [Degenerates into specimen recognition within a dozen items. The learner
   learns which shapes have been asked before, which is a fact about the
   corpus rather than about cost. It also has no notion of a *constraint*, so
   it cannot express the only question that makes complexity load-bearing in
   practice: not _what class is this_ but _is this class admissible here_.],

  [*Write the optimization* --- present slow code, require fast code],
  [Rejected],
  [Blocking in exactly the sense of Axiom P.1, and additionally *obsolete*: an
   agent emits the patch, the learner reads nothing, and the assessment has
   measured access to a model. The interesting judgement --- why this patch,
   and why the smallest one --- is precisely the part an autocompleted patch
   skips.],

  [*Autograded patch* --- accept any diff whose measured runtime fits the
   budget],
  [Rejected],
  [Grades on the empirical surface, which Theorem 4.1 proves cannot carry the
   claim. A patch that passes under the test harness's inputs and is
   asymptotically unchanged is scored identically to one that changes the
   class. This is the failure mode most likely to be proposed as an
   "objective" grader, and it is objective about the wrong quantity.],

  [*Free-form defence* --- learner writes prose justifying the change],
  [Rejected],
  [Requires a semantic verifier that does not exist. LTY-WHY already reached
   this boundary and stopped at the honest place --- accept, do not grade ---
   and the resulting shim is a stub precisely because prose cannot be judged
   here. Making it the *primary* interaction would make the whole surface a
   stub.],

  [*Fixed curriculum of complexity lessons* --- read, then exercise],
  [Rejected],
  [Has no failure channel. A learner who reads $n(n + n^2) = Theta(n^3)$ and
   nods has produced no observation, so the system's belief about them is
   whatever it was before. It also cannot be non-blocking *and* assessing at
   once, because it never asks for a commitment.],

  [*Selection over a closed set of (artifact, proposition) pairs, cycled
   against a real execution of an algorithm under a mutating constraint*],
  [*Accepted*],
  [Non-blocking (the artifact is revealed regardless, Axiom 9.1); epistemic
   (a commitment precedes the reveal, Axiom 9.2); assessable without a
   verifier (the mapping is authored and the choice set is closed,
   Theorem 6.1); grounded (the algorithm genuinely compiles and runs, and the
   run is genuinely evidence, §4); and cumulative (the propositions are a
   fixed register cited across rounds, §7, which is what makes transfer
   measurable at all, §10).],
)

#heading(level: 2, numbering: none)[P.3 · Selection is forced, not chosen]

#proposition("P.1", name: "The probe must be a selection")[
  Under Axiom P.1, and given that no semantic verifier for free-form
  justification exists in this repository, the only interaction that is
  simultaneously (i) non-blocking, (ii) capable of producing an observation
  the system may act on, and (iii) able to render a verdict with its own
  justification attached, is a selection over a closed, authored set.
]

#proof[
  (i) forbids any interaction whose next state depends on an unassisted
  correct answer, so the interaction must be revealed-either-way; (ii)
  forbids any interaction that requires nothing of the learner before the
  reveal, since a post-reveal answer is contaminated and carries no
  information about the learner's prior state; therefore the interaction must
  require a *commitment* that is cheap enough to be universally payable and
  that precedes revelation. A commitment payable by a learner with no
  competence at all is either an abstention or a choice from a presented set.
  (iii) then forbids free-form commitment: a verdict on free text requires a
  verifier this repository does not have, and this repository's own standing
  rule --- _no judgment is allowed unless it can produce its own
  justification_ --- forbids rendering one anyway. A choice from a closed set
  whose correct member is authored admits a verdict computed by identity, with
  the author's own sentence as its justification. Selection is what remains.
]

#remark("P.1", name: "This is the same argument LTY-MOBILE already made, generalized")[
  `docs/leetype/README.md`'s LTY-MOBILE section derives a discrimination probe
  for phones and is careful to call it _"a strictly weaker signal"_ than
  production. That judgement was correct *for the signal* and is retained
  (Def. 10.2 is why a weak signal is still usable). What LTY-MOBILE could not
  see from inside M20's premise is that production's stronger signal is
  purchased with Axiom P.1's cost, and that the cost exceeds the signal for
  every learner who does not already hold the competence. This canon does not
  overturn LTY-MOBILE; it promotes it off the phone.
]

#theorem("P.2", name: "Mandatory factorization")[
  Any system implementing the accepted object of P.2 must contain five
  logically distinct artifacts --- an *algorithm* $A$, a *constraint set* $C$,
  a *diff set* $D$, a *proposition register* $P$ with an authored mapping
  $mu : D -> P$, and an *evidence channel* producing execution results --- and
  no two may be collapsed without forfeiting a result proved in §2--§10.
]

#proof[
  $A$ and $D$ cannot be collapsed: §5 requires a diff to denote a *rewrite* of
  $A$'s cost graph, which presupposes both the graph and the edit as separate
  objects, and §6's probe requires several candidate diffs against one $A$.
  $C$ and $A$ cannot be collapsed: Theorem 3.1 requires the constraint to move
  while the algorithm is held fixed, which is not expressible if the constraint
  is a property of the algorithm. $P$ cannot be collapsed into $D$: §7 requires
  a proposition to be cited by *distinct* diffs across rounds, which is the
  entire mechanism of transfer (Def. 10.2); a proposition owned by one diff
  cannot be transferred to another. $mu$ cannot be collapsed into either
  endpoint: Axiom 6.1 requires it to be authored rather than derived, and an
  authored relation with no independent existence has nowhere to be reviewed.
  The evidence channel cannot be collapsed into any of the four: Theorem 4.1
  proves it cannot license a claim about them, and a channel fused with the
  claim it cannot license is precisely the error Corollary 4.1 forbids.
]

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
= The objects
// ═══════════════════════════════════════════════════════════════════════════

#definition("1.1", name: "Algorithm")[
  An *algorithm* $A$ is a complete, compilable program together with an entry
  point and a declared input alphabet. It is complete in the strong sense:
  $A$ compiles and runs without the learner supplying anything. $A$ is *not*
  the assessed artifact (Cor. 6.1) and is *not* required to be visible
  (Prop. 1.1).
]

#proposition("1.1", name: "The source is revealable and never gating")[
  $A$'s source is hidden by default, revealable on request, and its
  revelation may never be conditioned on any learner state, any prior answer,
  any timer, or any threshold.
]

#proof[
  Immediate from Axiom 9.1 (progression is unconditional) applied to the one
  artifact a learner might need in order to progress. A conditioned reveal is
  a gate, and a gate on the evidence is worse than a gate on the answer,
  because it withholds the material from which a commitment would be formed.
]

#definition("1.2", name: "Constraint")[
  A *constraint* $c$ is a symbolic bound on an input dimension --- $n <= 10^5$,
  $|A| <= 100$, "values fit in `u32`" --- together with the identifier of the
  dimension it bounds. A *constraint set* $C$ is a finite set of constraints
  over distinct dimensions. Constraints are data, never prose: a bound the
  system cannot evaluate against a cost expression is a comment.
]

#definition("1.3", name: "Budget")[
  A *budget* $B$ is a bound on admissible work, expressed in primitive
  operations --- $10^7$, $10^9$ --- optionally annotated with a wall-clock
  figure for the learner's benefit. $B$ is *coarse by construction* (Ax. 3.1)
  and is never a runtime guarantee.
]

#definition("1.4", name: "Diff")[
  A *diff* $d$ is an ordered list of authored segments over $A$'s source, each
  a `context`, `deletion` or `addition` fragment carrying its own text, from
  which both an engine-facing source string and a per-rendered-line
  classification are mechanically derived. A *diff set* $D$ is a finite set of
  diffs against one $A$, presented together.

  This is deliberately the shape `packages/ui/leetype`'s `DiffHunkSchema` and
  `DiffSegmentSchema` already carry, and Rem. 11.1 records that the reuse is
  wholesale rather than incidental: the M20 corpus's hunks are already
  well-formed instances of this definition.
]

#definition("1.5", name: "Proposition and register")[
  A *proposition* $p$ is a numbered, general claim about cost --- not about
  any particular program. The *register* $P$ is the totally-ordered finite set
  of propositions enumerated in §7, each carrying a stable identifier of the
  form `CW-P`$n$. A proposition is a member of $P$ or it does not exist; there
  is no per-exercise proposition, and no anonymous one.
]

#definition("1.6", name: "Mapping")[
  $mu : D -> P$ assigns to each diff the one proposition it witnesses. $mu$ is
  authored, total on every $D$ presented, and never computed (Ax. 6.1).
]

#definition("1.7", name: "Round")[
  A *round* is the tuple $(A, C, B, D, mu, r)$ where $r$ is the execution
  result of $A$ under $C$ (Def. 4.1). A *cycle* is a sequence of rounds
  generated by §8's transition rules over a fixed $A$.
]

#axiom("1.1", name: "Cardinality")[
  For every round, $ 0 < |C| <= |D| < N $ where $N$ is the corpus-wide bound
  on presentable alternatives. In words: there is always at least one live
  constraint; there are never fewer diffs than constraints; and the diff set
  is small enough to be read in full.
]

#remark("1.1", name: "What Axiom 1.1 is actually asserting")[
  The middle inequality is the substantive one and it is easy to read as
  arbitrary. It is not. A constraint that no candidate diff responds to is a
  constraint the round cannot be about, so it is either decoration or the
  diff set is under-authored; either way the round is malformed. $|D| >= |C|$
  is the weakest mechanical check that catches it. The outer bounds are the
  ordinary ones: an empty $C$ makes admissibility undefined (Def. 3.1 has
  nothing to quantify over), and an unbounded $D$ makes selection a search
  rather than a judgement, which returns the learner to the blocking regime
  Axiom P.1 forbids.
]

// ═══════════════════════════════════════════════════════════════════════════
= The cost algebra
// ═══════════════════════════════════════════════════════════════════════════

The purpose of this section is narrow and worth stating before the
definitions: it exists so that a round's complexity claim is *computed from
authored structure* rather than typed by an author as a string. A hand-written
`"Θ(n²)"` is a judgement with no justification attached, which this
repository's own standing rule forbids. A cost graph is the justification.

#definition("2.1", name: "Cost graph")[
  A *cost graph* is a term in the grammar
  $ G ::= W(c) | "Seq"(G_1, ..., G_m) | "Loop"(r, G) $
  where $W(c)$ is constant or parameterized straight-line work, $"Seq"$ is
  sequential composition of siblings, and $"Loop"(r, G)$ repeats $G$ a number
  of times given by the *repetition expression* $r$, a monomial in the input
  dimensions of Def. 1.2 (e.g. $n$, $n^2$, $log n$, $m$).
]

#definition("2.2", name: "Cost")[
  $ T(W(c)) = c, quad
    T("Seq"(G_1, ..., G_m)) = sum_(i=1)^m T(G_i), quad
    T("Loop"(r, G)) = r dot T(G). $
]

#rule("The grammar, in one line")[
  Sibling control flow adds. Nested control flow multiplies. Big-$O$ then
  keeps dominant terms. Everything in this section is a consequence of those
  three sentences, and every proposition in §7 that concerns structure is an
  instance of one of them.
]

#theorem("2.1", name: "Path decomposition")[
  For any cost graph $G$,
  $ T(G) = sum_(p in "paths"(G)) product_(v in p) r_v $
  where $"paths"(G)$ ranges over root-to-leaf paths and $r_v$ is the
  repetition expression at node $v$ (taken as $1$ at $"Seq"$ nodes and as the
  leaf's own constant at $W$).
]

#proof[
  Structural induction on $G$. For $W(c)$ there is one path, of product $c$.
  For $"Seq"(G_1, ..., G_m)$ the path set is the disjoint union of the
  children's path sets and $T$ is their sum by Def. 2.2, so the identity is
  inherited. For $"Loop"(r, G')$ every path is $r$ prefixed to a path of $G'$,
  and $r dot sum_p product_v = sum_p (r dot product_v)$ by distributivity.
]

#corollary("2.1", name: "The exponent is a maximum over paths")[
  If every repetition expression is a power of a single input dimension $n$,
  then $ T(G) = Theta(n^(e)), quad e = max_(p in "paths"(G)) sum_(v in p) a_v $
  where $r_v = n^(a_v)$.
]

#proof[
  By Theorem 2.1 each path contributes $n^(sum_v a_v)$; a finite sum of
  powers of $n$ is $Theta$ of its largest term, which is `CW-P3`.
]

#remark("2.1", name: "Loop depth is not the exponent, and this is the whole point")[
  The naive reading --- _depth $k$ implies $O(n^k)$_ --- holds only when every
  level contributes exactly $Theta(n)$. Two siblings at one level, one running
  $n$ times and one running $n^3$ times, inside an outer $n$-loop, give
  $n(n + n^3) = Theta(n^4)$ and not $n dot n dot n^3 = n^5$. The corpus is
  expected to contain instances that punish the naive reading specifically;
  `CW-P12` is the proposition that names it, and a round witnessing it is one
  of the few places where a learner's confident wrong answer is more useful
  than an abstention (Prop. 9.1).
]

#definition("2.3", name: "Dominant path")[
  A *dominant path* of $G$ is a root-to-leaf path maximizing the product of
  Theorem 2.1. It need not be unique; where it is not, the round may not
  assert that it is.
]

#proposition("2.1", name: "The cost graph is derived data, and the claim is derived from it")[
  A round authors $G$ and derives $T(G)$, its dominant path, and its
  $Theta$-class. It never authors the $Theta$-class directly. Where an author
  believes the derived class is wrong, the disagreement is a defect in $G$ ---
  which is reviewable --- and never a licence to override the derivation with
  a string.
]

// ═══════════════════════════════════════════════════════════════════════════
= Admissibility, and what a constraint diff actually moves
// ═══════════════════════════════════════════════════════════════════════════

#definition("3.1", name: "Admissibility")[
  $A$ is *admissible* under $(C, B)$ iff $T(G_A)$, evaluated at the bounds of
  $C$, is at most $B$. Written $T_A (C) <= B$.
]

#axiom("3.1", name: "Budgets are coarse")[
  $B$ is an order-of-magnitude admissibility heuristic, not a prediction of
  machine runtime. No constant factor, no cache behaviour, no allocator, and
  no language is modelled. A surface presenting $B$ must say so to the
  learner; a surface deriving a verdict from a *measured* runtime against $B$
  is making the error Corollary 4.1 forbids.
]

#definition("3.2", name: "Constraint diff")[
  A *constraint diff* is a pair $(C, C')$ differing in at least one bound,
  presented to the learner as a diff in the same visual register as a code
  diff. It is a first-class artifact of a round, not a re-render of the
  problem statement.
]

#theorem("3.1", name: "A constraint diff changes admissibility, never the class")[
  For any $A$ and any constraint diff $(C, C')$ that alters only the numeric
  bounds of dimensions and not their number or their relationships,
  $T_A$ as a function is unchanged, while $T_A (C) <= B$ and
  $T_A (C') <= B$ may differ in truth value.
]

#proof[
  $T$ is a function of $G_A$ alone (Def. 2.2), and $G_A$ is a function of
  $A$'s control-flow structure, which the constraint diff does not touch.
  Admissibility is $T$ *evaluated at* the bounds and compared to $B$
  (Def. 3.1); evaluation at different points of the same function may
  straddle $B$.
]

#corollary("3.1", name: "`CW-P4`, in its canonical form")[
  "The bound went up, so the algorithm got slower" is false. The algorithm did
  not change. What changed is whether it is allowed. This is the single most
  commonly mis-stated fact in the subject and it is a proposition of the
  register precisely so that rounds can probe it directly.
]

#remark("3.1", name: "Why the perturbation is on $C$ and not on $A$")[
  Perturbing $A$ and asking what happened to the cost is the complexity quiz
  of P.2, rejected. Perturbing $C$ and holding $A$ fixed is the operation a
  working engineer actually performs --- a service's traffic grew, a table's
  row count grew, a caller started passing the full set instead of a page ---
  and it is the only framing in which "minimal diff" is a well-posed question
  (Def. 5.2), because there is a *specific* admissibility failure to repair
  rather than a general invitation to make the code faster.
]

// ═══════════════════════════════════════════════════════════════════════════
= The two surfaces: measurement and proof
// ═══════════════════════════════════════════════════════════════════════════

This section is the canon's namesake and its most load-bearing result. Every
architectural decision about the execution runtime --- what it may return,
what may read what it returns, and what a lint must forbid --- is a corollary
of Theorem 4.1.

#definition("4.1", name: "Execution result")[
  An *execution result* $r$ is the outcome of compiling and running $A$ against
  a concrete input drawn under $C$: one of $"ok"(o)$ carrying observed output,
  logs and elapsed measurements, or $"error"(e)$ carrying a compile failure, a
  runtime fault, or a budget-exceeded timeout. $r$ is *evidence*.
]

#definition("4.2", name: "Claim")[
  A *claim* is a statement about $T$, $G_A$, a dominant path, an
  admissibility relation, or a proposition of §7. Claims live on the
  theoretical surface. A claim is *established* only by derivation from
  Def. 2.2 over an authored $G$.
]

#theorem("4.1", name: "Insufficiency of measurement")[
  No finite set of execution results entails any claim.
]

#proof[
  Let $S$ be any finite set of execution results for $A$, at input sizes
  $n_1 < ... < n_k$. Construct $A'$ agreeing with $A$ on all inputs of size
  $<= n_k$ and differing arbitrarily above it --- for instance by branching on
  $n > n_k$ into a loop of any chosen depth. $A'$ is a program with a
  different cost graph, a different $T$, and a different $Theta$-class, and it
  produces exactly $S$. Hence $S$ does not determine $T$, and any claim
  entailed by $S$ alone would have to hold of both $A$ and $A'$, which the
  claims of Def. 4.2 do not. Because $k$ was arbitrary, no enlargement of the
  observation set repairs this.
]

#corollary("4.1", name: "The two forbidden inferences")[
  Neither of the following is valid, and no surface, prompt, feedback string,
  or corpus entry may assert either:
  + _"It timed out, therefore it is $Theta(n^2)$."_ A timeout is consistent
    with any super-budget class, with a constant factor, with an infinite
    loop, and with a slow machine.
  + _"It ran in 4 ms, therefore it is $Theta(n)$."_ A fast run is consistent
    with every class at the tested sizes.
]

#proposition("4.1", name: "What measurement *can* do")[
  An execution result may:
  + *falsify an admissibility expectation* --- the learner or the system
    predicted $T_A (C') <= B$ and the run exceeded the budget, so the
    prediction is refuted;
  + *establish a concrete fact about one input* --- this input produced this
    output, this program does not compile, this run faulted;
  + *supply the motivation* a purely symbolic exercise cannot: the learner
    watched it fail.
  It may do nothing else, and in particular it may never appear as the
  justification of a claim.
]

#remark("4.1", name: "Apparatus, not subject")[
  Stated as the sentence to put in a review comment: *the code is the
  experimental apparatus, not the subject of the exam.* The run button exists
  to make the theoretical surface feel consequential. A design in which the
  learner can win by running things is a design in which Theorem 4.1 has been
  quietly denied.
]

#proposition("4.2", name: "Ordering: prediction precedes execution")[
  Where a round offers execution, the learner's prediction about the outcome
  is collected first. A prediction collected after a run is an observation of
  the run, not of the learner.
]

#proof[
  Special case of Axiom 9.2 (credit requires unassisted commitment): the run
  is assistance with respect to any claim about the run's own outcome.
]

// ═══════════════════════════════════════════════════════════════════════════
= The diff as witness
// ═══════════════════════════════════════════════════════════════════════════

#definition("5.1", name: "Graph rewrite")[
  A *rewrite* is a pair $(G, G')$ of cost graphs. A rewrite is *admissibility-
  restoring* for $(C', B)$ iff $T(G) > B$ and $T(G') <= B$ at $C'$'s bounds.
]

#theorem("5.1", name: "A diff witnesses a rewrite")[
  Every diff $d in D$ determines a rewrite $(G_A, G_(A')) $ where $A'$ is $A$
  with $d$ applied, and this rewrite --- not the text of $d$ --- is what any
  proposition $mu(d)$ is about.
]

#proof[
  $G$ is a function of control-flow structure (Def. 2.1) and $A'$ is
  determined by $A$ and $d$; hence $G_(A')$ is determined. That the rewrite
  rather than the text carries the content follows from §7: every proposition
  in the register is stated over cost graphs and input dimensions, and none
  mentions syntax. Two textually different diffs inducing the same rewrite
  witness the same proposition.
]

#corollary("5.1", name: "Distractor diffs are rewrites too")[
  A diff in $D$ that is *not* the admissible one is not "wrong code" --- it is
  a well-formed rewrite that fails to restore admissibility, or restores it by
  a different proposition, or changes observable behaviour. A distractor with
  no coherent rewrite is a strawman and is an authoring defect
  (Rem. 6.2).
]

#definition("5.2", name: "Minimality")[
  Among diffs restoring admissibility and preserving observable behaviour, the
  *minimal* one minimizes semantic distance --- the number of edges of $G_A$
  whose repetition expression or position changes. Minimality is never
  measured in lines.
]

#remark("5.1", name: "Why line count is explicitly not the measure")[
  A one-line replacement can change observable behaviour and half the cost
  graph; a five-line patch can be the smallest structure-preserving repair. A
  surface that rewards short diffs teaches golf. The question the round asks
  is _what is the smallest change to the execution graph that satisfies the
  new constraint_, which is a different question from _write the fastest
  implementation you can_ --- and the difference is the reason the second
  question invites over-engineering and the first does not.
]

#proposition("5.1", name: "Optimization attacks the dominant path")[
  A rewrite that leaves every dominant path unchanged cannot *reduce*
  $Theta(T)$. It may *raise* it: a rewrite off the dominant path that
  enlarges a dominated path until it dominates changes the class upward. So
  a rewrite alters $Theta(T)$ in neither direction only under the further
  condition that every path it touches remains dominated afterwards.
]

#proof[
  By Theorem 2.1, $T$ is the sum over paths of path products, and by Cor. 2.1
  its asymptotic value is the maximum over paths. If every maximizing path is
  unchanged, that maximum is still attained, so $Theta(T)$ cannot fall ---
  which is the first claim. It can rise, because the maximum is over *all*
  paths and a rewritten dominated path may exceed the old maximum: in
  $"Seq"("Loop"(n^2, W(1)), "Loop"(n, W(1))) = Theta(n^2)$, rewriting the
  $n$ branch to $n^3$ --- a branch that was not dominant --- yields
  $Theta(n^3)$. Under the further condition that every altered path stays
  dominated, the maximum is unchanged in both directions.
]

#remark("5.2", name: "The one-directional form is the one the design uses")[
  The unconditional half is what the pedagogy actually rests on, and it is
  the half stated as `CW-P11`: *you cannot make it asymptotically faster by
  optimizing somewhere that was never the problem.* The converse hazard ---
  an off-path rewrite making things worse --- is a distinct and less common
  authoring case, and a round that wants it should say so, because a learner
  told only the two-directional slogan will confidently mis-answer exactly
  the counterexample above.

  Recorded because the first draft of this canon stated the two-directional
  form with no hypothesis, and its proof --- _"a change confined to
  non-maximizing paths alters only dominated terms"_ --- silently assumed
  rewrites only shrink things. Caught in review of this canon's own filing.
]

// ═══════════════════════════════════════════════════════════════════════════
= The mapping, and why selection admits a verdict
// ═══════════════════════════════════════════════════════════════════════════

#axiom("6.1", name: "The mapping is authored")[
  $mu$ is authored at corpus time and reviewed by a human. It is never
  inferred at runtime, never derived from a model, and never learned from
  learner responses. No type in the governed workspaces may name an inferred
  proposition.
]

#remark("6.1", name: "This is the same posture, three times")[
  `docs/leetype/README.md` defers sink classification from typing behaviour on
  exactly this ground, LTY-WHY refuses a verdict for want of a verifier on
  exactly this ground, and LTY-SEED terminates the generation pipeline at the
  repository on exactly this ground. Axiom 6.1 is not a new restriction; it is
  the existing one applied to the one new relation this canon introduces.
]

#theorem("6.1", name: "Selection admits a justified verdict with no verifier")[
  Given a closed presented set $D$ with authored $mu$ and a presented option
  set drawn from $P$, the verdict on a learner's selected pair $(d, p)$ is
  computable as the identity $p = mu(d)$, and its justification is the
  authored statement of $mu(d)$ itself. No semantic verification is required
  or performed.
]

#proof[
  Both $D$ and the option set are finite and authored; $mu$ is a total
  authored function on $D$; equality of register identifiers is decidable.
  The repository's standing rule requires a judgement to produce its own
  justification, and the authored proposition text is a justification
  *antecedent to* the judgement rather than a rationalization of it.
]

#corollary("6.1", name: "The task is the selection, not the answer's derivation")[
  Because $mu$ is authored and semantically valid by construction, the learner
  is never asked to *invent* the correspondence. They are asked to *make the
  selection*. A round that requires the learner to construct $p$ has left the
  regime Theorem 6.1 covers and has no verdict available to it.
]

#remark("6.2", name: "Where the distractor propositions come from")[
  Options are drawn from $P$ --- other propositions of the register, preferring
  ones sharing an input-dimension or structural family with $mu(d)$. They are
  *never* per-round authored wrong sentences. This is exactly the argument
  LTY-MOBILE made for claim distractors and it is stronger here: a register
  proposition is a sentence somebody meant, generally true, and wrong only
  *for this diff* --- which is the only kind of near miss that teaches
  anything. A distractor that is false in general teaches the learner to
  detect nonsense, which is not the competency.
]

#proposition("6.1", name: "Injectivity is not required; discriminability is")[
  $mu$ need not be injective --- many diffs may witness one proposition, and
  that is the mechanism of transfer (Def. 10.2). What is required is that for
  each presented round, no two options in the presented option set are both
  true of the selected diff. Where two are, the round is malformed and must
  be repaired at authoring time.
]

// ═══════════════════════════════════════════════════════════════════════════
= The proposition register
// ═══════════════════════════════════════════════════════════════════════════

Each entry below carries a stable identifier. Source in the governed
workspaces cites these identifiers directly, and the citation is checked
mechanically (Rem. 7.1). The numbering of this section is therefore load-
bearing in a way no other section's is: an identifier is never reused, never
renumbered, and never removed --- a superseded proposition is marked
superseded and kept.

#proposition("7.1", name: "CW-P1 · Sequential composition adds")[
  Sibling control flow executed in sequence contributes the sum of its
  members' costs: $T("Seq"(G_1, ..., G_m)) = sum_i T(G_i)$.
]

#proposition("7.2", name: "CW-P2 · Nested repetition multiplies")[
  A body enclosed in a repetition contributes the product of the repetition
  count and the body's cost: $T("Loop"(r, G)) = r dot T(G)$.
]

#proposition("7.3", name: "CW-P3 · The dominant term survives")[
  A finite sum of terms in one input dimension is $Theta$ of its largest:
  $sum_j n^(a_j) = Theta(n^(max_j a_j))$.
]

#proposition("7.4", name: "CW-P4 · A bound change does not change the class")[
  Raising or lowering a bound in $C$ leaves $T$ as a function unchanged; it
  changes only whether $T_A (C) <= B$ holds. (Thm. 3.1, Cor. 3.1.)
]

#proposition("7.5", name: "CW-P5 · Preprocessing substitutes space for repeated search")[
  Replacing a repeated linear search inside a loop with one preprocessing pass
  plus expected constant-time membership rewrites $n m$ into $n + m$ expected,
  at $Theta(m)$ additional space.
]

#proposition("7.6", name: "CW-P6 · Ordering substitutes a logarithm for a scan")[
  Sorting one collection once and binary-searching it per query rewrites
  $n m$ into $m log m + n log m$, without the space of `CW-P5` and without its
  dependence on expected-case hashing.
]

#proposition("7.7", name: "CW-P7 · Sorting collapses pairwise comparison")[
  A comparison over all pairs that is answerable from adjacency in sorted
  order rewrites $n^2$ into $n log n + n = Theta(n log n)$.
]

#proposition("7.8", name: "CW-P8 · An early exit does not change the worst case")[
  A `return` inside a loop improves the *best* case and leaves the
  *worst-case* cost graph unchanged. Admissibility (Def. 3.1) is a worst-case
  relation, so an early exit cannot restore it.

  It says nothing about the typical case without an input distribution *and*
  a reason the exit condition fires early under it: an exit that triggers only
  on the final iteration, or almost never, leaves typical cost untouched.
  A round asserting a typical-case improvement is asserting something about
  the inputs, and owes that assumption explicitly.
]

#proposition("7.9", name: "CW-P9 · Triangular iteration is a constant factor")[
  $sum_(i<n) (n - i) = n(n-1)/2 = Theta(n^2)$. Iterating only the upper
  triangle halves the work and does not change the class.
]

#proposition("7.10", name: "CW-P10 · Amortization is a claim about a sequence")[
  An amortized bound constrains the total cost of a sequence of operations and
  does not bound any single operation. A per-operation worst case may exceed
  the amortized figure without contradicting it.
]

#proposition("7.11", name: "CW-P11 · Only the dominant path matters")[
  A rewrite confined to nodes off every dominant path cannot change
  $Theta(T)$, however much code it touches. (Prop. 5.1.)
]

#proposition("7.12", name: "CW-P12 · Loop depth is not the exponent")[
  Nesting depth $k$ implies $O(n^k)$ only when every level contributes
  $Theta(n)$. In general the exponent is the maximum over root-to-leaf paths
  of the sum of that path's loop exponents. (Cor. 2.1, Rem. 2.1.)
]

#proposition("7.13", name: "CW-P13 · Expected-case membership is not worst-case membership")[
  Hash-based membership is expected $O(1)$ and worst-case $O(m)$; a rewrite
  relying on it (`CW-P5`) trades a worst-case guarantee for an expected one,
  and that trade is part of what the rewrite witnesses.
]

#proposition("7.14", name: "CW-P14 · Two input dimensions do not collapse into one")[
  $n + m$ and $n m$ are distinct, and neither is $Theta(n^2)$ unless a
  constraint relates $m$ to $n$. A cost expression over two dimensions
  evaluated as though there were one is the most common source of a wrong
  admissibility verdict in practice.
]

#proposition("7.15", name: "CW-P15 · A recurrence is not a loop nest")[
  The cost of a recursive procedure is the solution of its recurrence over its
  call tree; reading its source's visible loop nesting as the exponent is
  invalid. `Loop` in Def. 2.1 does not model recursion, and a round about
  recursion must author its recurrence rather than pretend a nest.
]

#proposition("7.16", name: "CW-P16 · A cost independent of the bounds is not a constraint problem")[
  A term of $T$ that does not vary with any dimension $C$ bounds --- a fixed
  setup cost, an unbounded wait, work in a dimension $C$ says nothing about
  --- is unaffected by every assignment of those bounds. If such a term
  already exceeds $B$, no constraint diff makes the program admissible, and
  the failure is of a different kind from "too slow at this size."
]

#remark("7.3", name: "Why `CW-P16` exists")[
  Added during review of this canon's own filing, when Def. 8.2's second case
  --- a selected diff no constraint can rescue --- turned out to have no
  register entry to pose a question against. It is the register's first entry
  contributed by a proof obligation rather than by a teaching intention,
  which is the direction Rem. 7.2 says the register is supposed to grow in.
]

#remark("7.1", name: "The register is cited from source, and the citation is checked")[
  The governed workspaces name propositions by identifier --- `CW-P5`, not
  `"use a hash set"` --- and a check in the spirit of
  `docs/canon/scripts/check-citations.sh`'s C2 resolves every identifier
  appearing in source against this section. Two failures are equally
  reportable: an identifier in source with no entry here, and an entry here
  marked instantiable with no instance in the corpus. The first is a dangling
  citation; the second is a proposition the register claims to teach and does
  not.
]

#remark("7.2", name: "The register grows by amendment, and only by amendment")[
  A round needing a proposition the register does not contain is a request to
  amend this canon, filed as such, landing before the corpus entry that needs
  it. This is the ordinary discipline of §13 and is called out here because
  the temptation to author a one-off proposition string alongside a new
  exercise is much stronger than the temptation to fork a theorem.
]

// ═══════════════════════════════════════════════════════════════════════════
= The cycle
// ═══════════════════════════════════════════════════════════════════════════

#definition("8.1", name: "Round transition")[
  Let a round present $(A, C, B, D, mu)$. **The branch is taken on the
  derived admissibility relation $T_A (C) <= B$ (Def. 3.1), never on the
  execution result $r$.** The cycle proceeds:
  + $T_A (C) <= B$ --- $A$ is admissible. The next round holds $A$ fixed and
    applies a constraint diff $C -> C'$ (Def. 3.2). The learner's task is to
    anticipate its consequence (Prop. 4.2).
  + $T_A (C) > B$ --- $A$ is inadmissible. The round presents $D$ and the
    learner selects a pair $(d, p)$.
  + $T_(A+d) (C) <= B$ --- the selection restored admissibility. The next
    round diffs the constraint, as in (1).
  + $T_(A+d) (C) > B$ --- the selection did not restore admissibility. *The
    round does not repeat.* Its successor is Def. 8.2.

  An execution result $r$ may be *shown* at any point in this cycle, and is
  what Prop. 4.1 says it is: evidence, motivation, and a falsifier of the
  learner's expectation. It never selects a branch.
]

#remark("8.0", name: "This definition previously committed Corollary 4.1's own error")[
  Recorded rather than quietly corrected, because it is the most instructive
  thing that happened to this canon and it will be proposed again by anyone
  reading the design's slogan (_"the cycle runs on $A(C) -> "Result"$"_)
  without §4.

  The first draft branched on $r$: _"$r = "ok"$ --- $A$ is admissible under
  $C$"_ and _"$r = "error"$ --- $A$ is inadmissible."_ Both readings are
  exactly the inferences **Corollary 4.1** forbids. An $"ok"$ at one sampled
  input does not establish the worst-case relation $T_A (C) <= B$; an
  $"error"$ may be a compile failure, a fault, or a machine-dependent
  timeout, none of which is inadmissibility. So the state machine would have
  routed learners by an inference the same document declares invalid two
  sections earlier.

  The correction is not a weakening. It makes a *divergence* between the
  derived verdict and the observed result --- a theoretically inadmissible
  program that happens to finish, an admissible one that faults --- into the
  single most valuable event the surface can show, because it is Theorem 4.1
  demonstrated rather than asserted. A round engineered to produce that
  divergence is worth authoring on purpose.
]

#definition("8.2", name: "The successor of a failed selection")[
  Let $d$ be the learner's selected diff with $T_(A+d) (C) > B$. Exactly one
  of the following holds, and each names a successor:
  + *A rescuing constraint exists* --- there is a constraint set $C''$, over
    the same dimensions, with $T_(A+d) (C'') <= B$. The next round holds
    $(d, p)$ fixed, presents the constraint diff $C -> C''$, and asks for the
    pair $(c, p)$: the constraint, and the proposition explaining why the
    pair now sits inside budget.
  + *No rescuing constraint exists* --- no assignment of the bounds makes
    $A + d$ admissible, because its cost has a term independent of every
    dimension and already above $B$, or grows in a dimension $C$ does not
    bound. The next round holds $(d, p)$ fixed and asks for the pair
    $(d, p')$: *why no constraint rescues this diff* --- a strictly different
    failure kind from "too slow at this size", and one the register is
    expected to carry a proposition for.
]

#remark("8.2", name: "Why the second case is a branch and not a lint")[
  It is tempting to require every authored $d$ to be rescuable and reject
  the rest at authoring time. That would forbid a whole class of honest
  distractor --- the rewrite that adds unbounded fixed work --- and
  Corollary 5.1 has already said a distractor is a *well-formed rewrite that
  fails*, not junk. Worse, it would make the corpus's admissible-looking
  wrong answers systematically milder than the ones a learner meets in real
  code.

  So the unrescuable case is admitted and given its own question, which is a
  better question than the first one anyway: *this patch is not slow, it is
  wrong at every size* is a distinction most learners have never had to
  articulate.
]

#theorem("8.1", name: "The cycle has no absorbing failure state")[
  Under Def. 8.1 and Def. 8.2 no learner response returns the cycle to a
  state already visited, and every branch has a successor.
]

#proof[
  Branches (1) and (3) advance the constraint, a strict change by Def. 3.2.
  Branch (2) advances by applying a diff. Branch (4) delegates to Def. 8.2,
  whose two cases are exhaustive --- either some assignment of the bounds
  satisfies $T_(A+d) (C'') <= B$ or none does, and there is no third
  possibility --- and each names a successor that changes the presented
  question, from a $(d, p)$ selection to a $(c, p)$ or $(d, p')$ selection.
  Hence the state advances on every branch and the transition function is
  total.

  Totality here is a claim about the *transition function*, not about corpus
  coverage: Def. 8.2's second case requires the register to hold a
  proposition about dimension-independent cost, and Rem. 7.2 is the mechanism
  by which a missing one is added --- an amendment, before the round that
  needs it.
]

#remark("8.1", name: "Why the failure branch re-poses one level up")[
  Repeating a missed round is the interaction M20 shipped (a miss is a
  repeat, capped at three), and its cap exists because repetition is not
  progress. Branch (4) is what replaces it, and it is strictly better on
  three counts: it is not a repetition, so it cannot stall; it *uses* the
  learner's wrong selection as the subject rather than discarding it, which is
  the only way a wrong answer teaches; and it changes what is being asked
  about. In Def. 8.2's first case that is the constraint, which is where
  `CW-P4` lives --- and mis-stating `CW-P4` is the most likely reason the
  original selection was wrong. In its second case it is the difference
  between *slow at this size* and *wrong at every size* (`CW-P16`), which is
  a distinction the learner who chose that diff has demonstrably not drawn.
]

#proposition("8.1", name: "The cycle terminates only by the learner leaving")[
  There is no win state, no completion percentage, and no exhausted corpus
  condition. A cycle ends when the learner stops. Anything else reintroduces
  a terminal gate, and Axiom P.1 is what forbids one.
]

// ═══════════════════════════════════════════════════════════════════════════
= Progression, commitment, and credit
// ═══════════════════════════════════════════════════════════════════════════

#axiom("9.1", name: "Progression is unconditional")[
  No pedagogical artifact --- source, diff, proposition text, execution result,
  explanation, or the next round --- is withheld on the basis of any learner
  response. Revelation is unconditional.
]

#axiom("9.2", name: "Credit requires an unassisted commitment")[
  No observation counts as evidence about a learner unless it was recorded
  *before* the corresponding artifact was revealed. A response given after
  revelation is an observation of the revelation.
]

#definition("9.1", name: "Commitment")[
  A *commitment* is a single, cheap, mandatory-before-reveal action from a
  closed set that always includes an explicit abstention ("not sure"). It is
  the only thing in the entire design that blocks anything, and what it blocks
  is the reveal of one artifact by one interaction, never progress.
]

#rule("The invariant, in three lines")[
  Nothing pedagogical is gated by competence.\
  Evidence of competence requires an unassisted commitment.\
  Failed evidence changes future sampling, not present access.
]

#theorem("9.1", name: "Failure changes sampling, not access")[
  A learner response may influence only the *distribution* from which future
  rounds are drawn. It may never influence the availability of any artifact,
  the reachability of any round, or the learner's ability to continue.
]

#proof[
  Immediate from Axiom 9.1: availability, reachability and continuation are
  precisely the quantities Axiom 9.1 declares unconditional. The distribution
  over future rounds is not among them, and Def. 10.2 requires it to move.
]

#proposition("9.1", name: "Abstention is evidence, and is not failure")[
  The three responses --- correct, incorrect-and-confident,
  explicit-abstention --- are distinct observations and must be recorded as
  three, not folded into two. An incorrect confident selection calls for a
  discriminating counter-instance; an abstention calls for a cleaner instance
  of the same proposition; a correct selection calls for a nearby boundary
  case (Def. 10.2).
]

#definition("9.2", name: "Artifact switching")[
  A round holds six artifacts --- the source $A$, the constraint set $C$, the
  budget $B$, the diff set $D$, the presented option set drawn from $P$, and
  the execution result $r$. At any moment of a round *exactly one* of them is
  load-bearing: the one the learner's current commitment is about. The
  interaction is therefore *switching which artifact is in view*, and the
  alphabet of that interaction is toggle, scroll, select, press and swipe.
]

#proposition("9.2", name: "The reference surface is the small one")[
  Under Def. 9.1 and Def. 9.2 no interaction in this design requires a
  keyboard, a pointer with hover, or a viewport wide enough for two artifacts
  at once. The small-screen surface is therefore not a degraded rendering of a
  desktop design; it is the surface on which the design is complete, and the
  wide surface is the one that must justify each affordance it adds.
]

#proof[
  Def. 9.1 requires a commitment to be a single action from a closed
  presented set --- a press. Prop. 1.1 requires $A$ to be revealable --- a
  toggle. Def. 9.2's switching is a swipe or a tab. Def. 8.1's submission is a
  press. Nothing in §1--§10 names an input this list does not contain. The
  production probe of Rem. 11.2 does require a keyboard and is, by that same
  remark, optional and read by nothing.
]

#remark("9.2", name: "Simultaneity is a leak, not a luxury")[
  The wide surface's obvious advantage --- show the source, the diff set and
  the propositions at once --- is, under Axiom 9.2, a hazard rather than a
  feature. A learner reading the option set while the diff is on screen beside
  it has been handed the correspondence to check rather than asked to recall
  it, and the commitment recorded afterwards is an observation of the layout.
  One artifact at a time is what makes a pre-reveal commitment *mean*
  something, so the phone's constraint is enforcing the canon's own rule for
  free. A wide surface must therefore reproduce the sequencing deliberately;
  it does not inherit correctness from having more room.
]

#remark("9.3", name: "What this retires")[
  `docs/leetype/README.md`'s LTY-MOBILE section is built on the premise that
  the phone lacks the modality --- _"on a device with no keyboard to produce
  code with"_ --- and derives a weaker probe as the honest response.
  Proposition 9.2 inverts the premise, not the conclusion: the probe LTY-MOBILE
  reached for is the probe this canon assesses on, so the phone is not making
  do with less. Two consequences that will otherwise be re-litigated:
  a small-screen round is never a truncation of a wide one, and there is never
  a "full experience" the phone is missing. The one thing the phone genuinely
  cannot offer is the optional production probe, which is read by nothing
  (Rem. 11.2), and is therefore not a competency difference.
]

#remark("9.1", name: "Why folding them is tempting and wrong")[
  A binary correct/incorrect field is smaller, sorts more easily, and makes a
  percentage. It also destroys the only signal that distinguishes a
  misconception from a gap, which is the distinction the sampling policy of
  Theorem 9.1 exists to act on. Canon I's Axiom 3.1 (confounded observation)
  applies with full force: the channel here is *narrower* than typing, so
  discarding the one unconfounded distinction it does offer is not a
  simplification, it is the loss of the signal.
]

// ═══════════════════════════════════════════════════════════════════════════
= The ledger
// ═══════════════════════════════════════════════════════════════════════════

#remark("10.1", name: "Belief is inherited, not re-derived")[
  Everything about *how* a belief is represented, updated, decayed, persisted
  and reconstructed is settled by the sibling canon *The Unobservable
  Learner* --- prior-plus-deviation-plus-ring (its Thm. 5.1), lazy read-time
  decay (its Thm. 5.3), eviction tolerance (its Thm. 7.2), oracle-free
  scheduling (its Thm. 8.1). This section adds only the *object* the belief
  is held over, which is the register of §7, and the condition under which an
  entry may be called demonstrated. Nothing here re-opens any of those
  results, and a story that appears to need to re-open one is amending that
  canon, not this one.
]

#definition("10.1", name: "Ledger state")[
  Each proposition of the register carries, per learner, one of
  $ "unseen" -> "exposed" -> "recognized" -> "demonstrated" $
  where *exposed* means the proposition has been presented; *recognized*
  means it has been selected correctly at least once under commitment; and
  *demonstrated* means Def. 10.2 is satisfied. States advance and, under
  Canon I's decay, may lapse.
]

#definition("10.2", name: "Demonstration")[
  A proposition is *demonstrated* only on the conjunction of:
  + *positive transfer* --- correct selection under commitment on at least
    three rounds whose diffs induce structurally distinct rewrites;
  + *negative discrimination* --- correct rejection of the proposition on at
    least one round where a nearby proposition is the true witness;
  + *retention* --- at least two of the above separated by a session boundary.
]

#theorem("10.1", name: "One correct selection cannot discharge a proposition")[
  Let a round present $k$ options. A uniformly guessing learner selects
  correctly with probability $1/k$, so a single correct selection has
  likelihood ratio at most $k$ in favour of competence, which for the option
  counts this design admits ($k <= 5$) is not sufficient evidence to assert
  demonstration.
]

#proof[
  The observation is a single Bernoulli trial with success probability $1/k$
  under the null of guessing and at most $1$ under the alternative; the
  posterior odds multiply by at most $k$. Under Def. 10.2's three independent
  conditions the compounded ratio grows multiplicatively, which is the entire
  reason the definition is a conjunction rather than a count.
]

#corollary("10.1", name: "Recognition is cheap and is labelled as such")[
  *Recognized* is the state a single correct selection produces, and the
  surface may say so. It may not say *demonstrated*, and it may not render a
  progress figure that treats the two as the same quantity.
]

#proposition("10.1", name: "Negative discrimination is mandatory, not optional")[
  Without a round on which the proposition is the *wrong* answer, a learner
  who always selects it scores as competent on every round where it is right.
  Positive transfer alone is therefore not identifying, and the corpus owes
  each instantiable proposition at least one round where it appears as a
  distractor for a nearby true witness.
]

#remark("10.2", name: "This is a corpus obligation, and it is checkable")[
  Proposition 10.1 states a property of the corpus, not of the runtime: for
  each proposition, at least one round with it as $mu(d)$ and at least one
  round with it in the presented option set where $mu(d)$ is something else.
  Both are mechanically checkable at authoring time and belong in the same
  lint as Rem. 7.1's citation check.
]

// ═══════════════════════════════════════════════════════════════════════════
= Grounding against the present source
// ═══════════════════════════════════════════════════════════════════════════

#remark("11.1", name: "What already exists and is retained wholesale")[
  This canon is unusually cheap to satisfy, and the reason is worth recording
  so that nobody re-derives what is already there:

  #table(
    columns: (auto, 1fr),
    stroke: 0.4pt,
    [*Present artifact*], [*Role under this canon*],

    [`types/exercise.ts` --- `DiffHunkSchema`, `DiffSegmentSchema`,
     `typingSourceOfDiffSegments`, `renderedDiffLineKinds`],
    [Def. 1.4 verbatim. The corpus's authored hunks are already well-formed
     diffs; nothing about the segment model changes.],

    [`lib/leetype/reading-probe` --- `claimOf`, `readingProbeOf`,
     `claimPoolOf`, `READING_OPTION_COUNT`],
    [The selection machine of §6, one substitution away: the option pool
     becomes §7's register rather than other steps' claims (Rem. 6.2), and
     the answer becomes $mu(d)$ rather than the step's own claim.],

    [`components/reading-game` --- `ClaimChoices`, `ReadingFeedback`,
     `DiffCard`],
    [The rendering of a round. `DiffCard` already renders a unified hunk with
     sign and line-number columns; `ClaimChoices` already withholds the answer
     until a choice is made, which is Axiom 9.2's mechanism.],

    [`lib/leetype/exercises/obligation-graph.ts` --- `ObligationClaim`
     including `"complexity"`, `requires`, `linearize`],
    [The route structure over rounds. The `"complexity"` claim kind already
     exists and is unused; §7 is what it was waiting for.],

    [`lib/leetype/deterministic-random`],
    [Distractor ordering and sampling (Thm. 9.1) stay replayable from a seed.],

    [`crates/leetype_wasm`],
    [*Untouched.* Nothing in §1--§10 requires an engine change. The typing
     surface it powers survives as an optional production probe on a selected
     diff (Rem. 11.2) and never as a gate.],
  )
]

#remark("11.2", name: "What changes, and what the change costs")[
  + *The gate stops being a progression predicate.* `useExerciseRunner`'s
    `advance(progression)` currently consults weighted WPM against a sampled
    baseline. Under Axiom 9.1 the advance predicate is the commitment, not
    the fluency. The baseline, the two WPM scalars and the reveal window
    remain meaningful *for the production probe* and stop being meaningful for
    anything else.
  + *The typing surface is demoted, not deleted.* A learner who wants to type
    the selected diff may; nothing reads the result. This is the same posture
    LTY-SEAM holds for the whole exercise ($p_"credited" = "false"$) and it is
    inherited rather than re-argued. On the reference surface (Prop. 9.2)
    there is no typing at all, and that is not a missing feature there.
  + *The corpus gains $A$, $C$, $B$ and $G$.* This is the real cost. Today a
    step carries a fragment; a round carries a whole compiling program, its
    constraints, its budget and its cost graph. Rem. 11.3 is why that cost is
    payable.
  + *A cost that is left visible:* the construction family has no authored
    equivalent of `whyRepairDiscriminates`, so §6's justification is thin for
    construction-shaped rounds. This canon does not paper over it with
    generated prose; the repair is an authored sentence per round, argued as
    a corpus change.
]

#remark("11.3", name: "The execution runtime, and the two things it must not become")[
  No route in `paulgsc/server`'s published inventory executes anything today;
  an execution surface is a new server capability with its own review. Two
  constraints follow immediately and are not negotiable:

  + *The static deployment has no server.* GitHub Pages ships this workspace
    with no `file_host`. An execution result must therefore be satisfiable
    from a *recorded transcript* --- generated into the static snapshot
    (`paulgsc/server#328`, LTY-SRV4), never hand-committed --- with the live
    runtime supplying the same shape when one is reachable. This is the
    `DATA_MODE` discipline the repository already applies to content, and
    Theorem 4.1 is what makes it sound here rather than a degradation: a
    recorded run and a live run are equally incapable of establishing a
    claim, so nothing pedagogical is lost by recording one.

  + *Execution is not an oracle for scheduling.* Canon I's Theorem 8.1 forbids
    a scheduling decision that depends on a remote service. An execution
    result may motivate, illustrate and falsify; it may not select the next
    round. A cycle must remain fully playable with every execution failing to
    reach the server.
]

#remark("11.4", name: "The corpus stops living beside the client modules")[
  LTY-SEED settled that a reviewed, oracle-authored corpus is *bundled* rather
  than fetched, on an argument this canon accepts as stated: _"reviewed content
  is bundled; unreviewed, developer-local content is fetched,"_ and the axis
  that matters is review, not origin. That argument is untouched. What has
  changed is the *object*, and the change is large enough to move the
  conclusion without contradicting the reasoning:

  #table(
    columns: (auto, auto),
    stroke: 0.4pt,
    [*A step, under M20*], [*A round, under this canon*],
    [a source fragment, inline, a few lines],
    [a complete compilable program $A$ (Def. 1.1)],
    [--- ],
    [a constraint set $C$ and a budget $B$ (Def. 1.2, Def. 1.3)],
    [one authored hunk],
    [a diff set $D$ with $|D| >= |C|$ (Ax. 1.1)],
    [`concepts`, a bag of strings],
    [an authored $mu : D -> P$ into a numbered register (Def. 1.6)],
    [--- ],
    [an authored cost graph $G$ (Def. 2.1, Prop. 2.1)],
    [--- ],
    [a recorded execution transcript per round (Def. 4.1, Rem. 11.3)],
  )

  Three consequences follow, and none of them is a preference:

  + *Bundle size becomes a function of corpus size.* A step was small enough
    that a growing corpus cost the client nothing anyone would notice. A round
    carries a whole program plus transcripts, and a corpus that grows is a
    bundle that grows, on every page load, for material the learner will never
    reach in one session.

  + *The corpus acquires a server-side producer.* A transcript is produced by
    executing $A$, which is a server capability (Rem. 11.3). Committing a
    transcript by hand beside the client module would mean hand-maintaining an
    artifact a machine generates --- the exact drift LTY-PATCH eliminated
    between a hunk's `source` and its line kinds, reintroduced one level up.

  + *Review is preserved by the publication path, not by the file's location.*
    LTY-SEED's load-bearing axis is that no unreviewed content reaches a
    player. A server-owned corpus with a reviewed import path satisfies that
    axis exactly as a committed `.ts` module did; what it does not satisfy is
    the *incidental* property that the file happened to sit next to the code.
    LTY-SEED's own list of foreclosures is scoped to a fetched corpus in place
    of review, and is upheld: nothing here fetches unreviewed material, and
    nothing calls an oracle at runtime (Canon I Thm. 8.1 stands).

  The migration therefore lands as `paulgsc/server#324` (`[EPIC][LTY-SRV]`)
  already scopes it, with two amendments this canon forces on it: LTY-SRV1's
  schema must model $A$, $C$, $B$, $G$, $D$, $mu$ and transcripts rather than
  the M20 `Exercise` shape it was drafted against, and LTY-SRV2's importer
  must carry the §7 citation check (Rem. 7.1) and the coverage obligation
  (Rem. 10.2) across the boundary, because a lint that only runs in the client
  repository stops running the moment the corpus leaves it.
]

#remark("11.5", name: "The study-nudge domain acquires real producers, and one temptation")[
  `docs/study-nudge.md` records that three of the domain's seven signals have
  no honest producer --- `scored-below-target`, `curriculum-updated` and
  `app-updated` --- because _"inventing them from session data would put a
  number the server trusts on a guess."_ This canon supplies two of them
  honestly and forbids the obvious wrong version of the first:

  + *`curriculum-updated` gets a producer.* Publishing rounds into the
    server-owned corpus (Rem. 11.4) is a genuine curriculum change for the
    subjects whose ledger contains the affected propositions --- the same
    shape `paulgsc/server#277` establishes for material generally, and it
    should be that mechanism rather than a second one.

  + *`scored-below-target` gets a producer, bounded by Theorem 10.1.* A
    ledger entry that fails Def. 10.2 after having been *recognized* is a real,
    defensible below-target observation. A single incorrect selection is not:
    by Theorem 10.1 one trial over $k <= 5$ options carries at most a
    factor-$k$ likelihood ratio, and firing on it would make a wrong tap
    trigger a notification. That is a gate wearing the costume of a nudge, and
    Axiom 9.1 forbids it as surely as it forbids a locked round.

  + *The outcome grain changes.* `paulgsc/server#286`'s `activity_outcome`
    grain decision and `#288`'s separation of attendance from performance were
    drafted where a score is a completion ratio. For this surface the outcome
    is a *ledger transition on an identified proposition* --- carrying the
    `CW-P` identifier and which of Def. 10.1's states was entered --- and a
    completion ratio over rounds is attendance, precisely the conflation `#288`
    exists to end. `#289`'s `RankingSignals` read of that table inherits the
    same distinction.

  The whole of this remark is a request for amendment to `paulgsc/server`'s
  study-nudge milestone, filed there, not a licence for this repository to
  emit anything on its own account.
]

// ═══════════════════════════════════════════════════════════════════════════
= Falsifiers
// ═══════════════════════════════════════════════════════════════════════════

This canon is wrong if any of the following is observed. Each is stated so
that it could actually happen, not so that it comfortably cannot.

+ *Selection is also blocking.* Learners abandon at the commitment prompt at
  rates comparable to M20's abandonment at the typing prompt --- in which
  case Axiom P.1's diagnosis was about interaction cost generally, not about
  production specifically, and Def. 9.1's "single cheap action" is still too
  much.

+ *The register does not transfer.* Learners reach *demonstrated* on a
  proposition and then fail rounds witnessing the same proposition in an
  unfamiliar program --- in which case Def. 10.2's three conditions are not
  identifying and the object of belief is finer-grained than a proposition.

+ *Distractors from the register are not near misses.* If register
  propositions are so easily eliminated that selection is trivial regardless
  of understanding, Rem. 6.2's argument fails and per-round authored
  distractors --- with all the strawman risk that carries --- become
  necessary.

+ *The cost graph is not authorable.* If real programs worth probing routinely
  resist expression in Def. 2.1's grammar (data-dependent bounds, early exits
  interacting with nesting, recursion --- `CW-P15` already concedes the last),
  then Prop. 2.1's "derive, never assert" is unaffordable and the canon owes
  either a richer grammar or an honest escape hatch with its own review rule.

+ *Measurement wins anyway.* If learners, given a run button, reliably infer
  classes from timings and are reliably right, Theorem 4.1 remains true as
  mathematics while being pedagogically irrelevant --- and Cor. 4.1's
  prohibitions would be enforcing a distinction the learner correctly ignores.
  This would not falsify the theorem; it would falsify the design's decision
  to build the whole assessment on the theorem's far side.

+ *The reference surface is not the small one.* If learners on a phone
  systematically abandon rounds that wide-screen learners complete --- because
  a diff hunk is unreadable at that width, or because artifact switching
  (Def. 9.2) loses the thread a wide layout keeps --- then Prop. 9.2 has
  mistaken an input-alphabet argument for a comprehension argument, and the
  small surface is bounded by legibility rather than by modality.

+ *Hoisting the corpus costs more than it saves.* If a server-owned corpus
  (Rem. 11.4) makes authoring materially slower --- a round that used to be a
  reviewed diff on a `.ts` file becomes a migration, an import and a
  regeneration --- then the bundle-size argument was not the binding one, and
  the corpus belongs back beside the client with a size budget instead.

+ *Constraint mutation is not motivating.* If the $"ok"$ branch (Def. 8.1.1)
  reads as an absence of content --- nothing happened, the code still works,
  a number changed --- then the cycle's reward structure is carried entirely
  by failure, and §8's symmetry is cosmetic.

// ═══════════════════════════════════════════════════════════════════════════
= Amendment protocol
// ═══════════════════════════════════════════════════════════════════════════

This canon is maintained under theory revision. The source it governs is
derivable and disposable; this document is the durable object.

+ *A patch that cannot cite a numbered result here is a happy-path patch.*
  Amend first, then derive. A pull request stemming from the epics this canon
  governs cites the Definition, Axiom, Proposition, Theorem or `CW-P`
  identifier it derives from, in the commit message.

+ *Amendments add; they do not rewrite.* A superseded result is retained and a
  new numbered item records the revision and its reason. §7's identifiers are
  under the strictest form of this rule --- they are cited from source and
  checked mechanically (Rem. 7.1), so a renumbering is a broken build and a
  removal is a dangling citation. A retired proposition is marked retired and
  kept.

+ *Falsifiers are promoted, not deleted.* When an observation in §12 occurs it
  becomes a numbered result recording what was observed, what it refuted, and
  what replaced it; §12 is then extended with the new theory's falsifiers.

+ *Evidence is cited.* An amendment motivated by observed learner behaviour
  cites the observation; one motivated by an implementation difficulty cites
  the code; one motivated by neither is a change of taste and should be argued
  as one.

+ *The version line moves on every amendment*, and the change is summarized
  below.

#heading(level: 2)[Amendment log]

*v1.0 --- 2026-08-28.* Initial filing, ahead of the source it governs, per the
discipline the sibling canons filed under. Establishes the accepted object
(P.2) and the derivation that selection is forced (Prop. P.1); the five-artifact
factorization (Thm. P.2); the cost algebra and path decomposition (Def. 2.1,
Def. 2.2, Thm. 2.1, Cor. 2.1); admissibility and the constraint diff
(Def. 3.1, Def. 3.2, Thm. 3.1); the insufficiency of measurement (Thm. 4.1)
and its two forbidden inferences (Cor. 4.1); the diff-as-witness and
minimality-as-semantic-distance (Thm. 5.1, Def. 5.2); the authored mapping and
the verifier-free verdict (Ax. 6.1, Thm. 6.1); the proposition register
`CW-P1`--`CW-P16` (§7); the round cycle and its non-repeating failure branch
(Def. 8.1, Def. 8.2, Thm. 8.1); unconditional progression with conditional credit
(Ax. 9.1, Ax. 9.2, Thm. 9.1); the reference-surface inversion (Def. 9.2,
Prop. 9.2, Rem. 9.2, Rem. 9.3); and the ledger with its demonstration condition
(Def. 10.1, Def. 10.2, Thm. 10.1). Records two cross-repository consequences as
requests for amendment rather than as unilateral claims: the corpus hoist and
the two amendments it forces on `paulgsc/server#324` (Rem. 11.4), and the
signal producers and outcome grain it changes in that repository's study-nudge
milestone (Rem. 11.5). Grounded against `packages/ui/leetype`,
`crates/leetype_wasm`, `docs/study-nudge.md`, and `paulgsc/server`'s published
route inventory as of this date. No source change accompanies this filing, by design: §11 records
what is retained and what changes, and the milestone's epics sequence the
work.

*Corrections made during review of this filing, before it landed.* Four
defects were found by automated review of the filing pull request and are
recorded rather than silently fixed, because three of them are mistakes this
document exists to prevent and will be made again:

+ *Def. 8.1 branched the state machine on the execution result $r$* --- the
  inference Cor. 4.1 forbids, committed by this canon two sections after
  forbidding it. Corrected to branch on Def. 3.1's derived relation, with
  Rem. 8.0 recording the error and the divergence case it turns into an
  asset.
+ *Def. 8.1's failure branch promised a rescuing constraint that need not
  exist* --- a diff adding fixed work above $B$ is unrescuable by any bound,
  so Thm. 8.1's totality did not follow. Corrected by Def. 8.2's exhaustive
  two-case successor, with Rem. 8.2 on why the unrescuable case is a branch
  rather than a lint, and Thm. 8.1's proof rewritten to rest on that
  exhaustiveness.
+ *Prop. 5.1 asserted that an off-dominant rewrite cannot change
  $Theta(T)$*, which is false upward --- enlarging a dominated path until it
  dominates changes the class. Corrected to the one-directional claim, with
  the two-directional form given its hypothesis, a counterexample, and
  Rem. 5.2.
+ *`CW-P8` claimed an early exit bounds the typical case*, unsupported
  without an input distribution. Corrected to best- and worst-case alone.

`CW-P16` was added in the course of the second, and is the register's first
entry contributed by a proof obligation rather than a teaching intention
(Rem. 7.3).

#pagebreak()

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[Appendix --- Notation Index]
// ═══════════════════════════════════════════════════════════════════════════

#table(
  columns: (auto, auto),
  stroke: 0.4pt,
  [*Symbol*], [*Meaning*],
  [$A$], [Algorithm: a complete, compilable program (Def. 1.1)],
  [$C$, $c$], [Constraint set and a constraint (Def. 1.2)],
  [$B$], [Budget, in primitive operations (Def. 1.3)],
  [$D$, $d$], [Diff set and a diff (Def. 1.4)],
  [$P$, $p$], [Proposition register and a proposition (Def. 1.5, §7)],
  [`CW-P`$n$], [Stable proposition identifier, cited from source (§7, Rem. 7.1)],
  [$mu : D -> P$], [Authored diff-to-proposition mapping (Def. 1.6, Ax. 6.1)],
  [$r$], [Execution result, $"ok"$ or $"error"$ (Def. 4.1)],
  [$G$], [Cost graph (Def. 2.1)],
  [$T(G)$], [Cost of a graph (Def. 2.2)],
  [$W(c)$, $"Seq"$, $"Loop"(r, G)$], [The three cost-graph constructors (Def. 2.1)],
  [$r_v$], [Repetition expression at node $v$ (Thm. 2.1)],
  [$T_A (C) <= B$], [Admissibility (Def. 3.1)],
  [$(C, C')$], [Constraint diff (Def. 3.2)],
  [$(G, G')$], [Graph rewrite witnessed by a diff (Def. 5.1, Thm. 5.1)],
  [$k$], [Presented option count, $k <= 5$ (Thm. 10.1)],
)

// ═══════════════════════════════════════════════════════════════════════════
#heading(level: 1, numbering: none)[References]
// ═══════════════════════════════════════════════════════════════════════════

- Sibling canon, "The Unobservable Learner," `docs/canon/adaptive-learning-canon.typ`
  --- inherited wholesale for belief representation (its Thm. 5.1), lazy decay
  (Thm. 5.3), eviction tolerance (Thm. 7.2), the oracle boundary (Thm. 8.1,
  Prop. 8.1, Prop. 8.2), confounded observation (Ax. 3.1), and the
  instrument--intervention duality (Thm. 4.2). §10 of this canon adds only the
  object those mechanisms are maintained over.
- Sibling canon, "The Unsettled Surface," `docs/canon/dom-state-estimation-canon.typ`
  --- the estimation-then-control factorization Thm. P.2 extends, and the
  Amendment Protocol discipline this document mirrors.
- Sibling canon, "The Single-Glyph Ceiling," `docs/canon/hangul-progression-canon.typ`
  --- the content-model algebra whose stimulus/answer separation §6's closed
  option set is an instance of.
- Decision record, `docs/leetype/README.md` --- M20's user story, its five
  decisions, and the LTY-FRAME / LTY-PATCH / LTY-WHY / LTY-MOBILE / LTY-SEED /
  LTY-PICKER sections this canon supersedes in premise (P.0) and reuses in
  mechanism (Rem. 11.1).
- Client source audited: `packages/ui/leetype/src/types/exercise.ts`,
  `src/lib/leetype/{reading-probe,deterministic-random,exercises}`,
  `src/components/{reading-game,typing-game,exercise-picker}`,
  `src/hooks/leetype/use-exercise-runner`.
- Engine source audited: `crates/leetype_wasm/src/leetype/{program,reveal,session,stats,view}.rs`
  and `crates/leetype_wasm/tests/invariants.rs`.
- Server surface audited: `paulgsc/server`'s `apps/servers/file_host/src/routes`
  and the published inventory mirrored at `packages/contract-harness/routes.server.json`
  --- no execution route exists as of this filing (Rem. 11.3).
