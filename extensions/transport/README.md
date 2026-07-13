# @some-extension/transport

A property-agnostic transport kernel implementing the four-stage
observe/estimate/plan/act architecture (and its lifecycle/adapter
refinements) derived in
[`extensions/docs/dom-state-estimation-canon.typ`](../docs/dom-state-estimation-canon.typ)
(§5–§8, §D).

**This package is not the source of truth for its own behavior — the canon
is.** Every module here is checked against a Definition/Axiom/Theorem number
in that file, not a feature spec. If a change here can't be traced to a
canon citation, it belongs in an [Adapter](../docs/dom-state-estimation-canon.typ)
(Definition D.3) instead, or the canon is missing an amendment (§10) that
should land first.

## Status

All stories of [Epic #607](https://github.com/paulgsc/some-ui/issues/607)
(S1–S11) have landed. The package builds (typechecks + lints) and its full
unit (`pnpm test`) and conformance (`pnpm test:e2e`) suites pass against
`adapter/null-adapter.ts` alone — the Kernel Independence acceptance bar
(Theorem D.2). No business logic (theme/censor/redaction or any other
domain concept) exists anywhere in this tree.

## Layout

```
src/
  contracts/    Token, Hypothesis, Invariant, Adapter, Action — types only
  bootstrap/    document-lifetime static install + sentinel (Def D.2, Thm D.1)
  session/      epoch counter + reset operator (Def 5.4, D.1)
  sensor/       hybrid event+poll channel (Def 3.1–3.3) + identity reconciliation (Def 4.1, Cor 4.1.1)
  estimator/    hypothesis, per-key evidentiary order, monotonic update (Def 5.1–5.3, Thm 5.1), decay (Remark 3.3)
  adapter/      the Adapter contract + null adapter (Def D.3, Thm D.2)
  scheduler/    invariant re-evaluation cadence, R-bounded delivery bookkeeping (Def 7.2)
  actuator/     self-tagged idempotent actuation, structural exclusion (Def 7.3, Thm 7.2, Cor 7.3.1)
  lifecycle/    refresh-vs-navigation reset semantics, full teardown (Thm D.1)
tests/e2e/      Playwright conformance suite (S11) — protocol guarantees only, against the null adapter
```

No migration of `some-censor` or `some-filter` onto this package has
happened yet — that is tracked as follow-on work once a real Adapter
implementation exists (see the epic's non-goals).
