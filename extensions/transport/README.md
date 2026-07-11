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

Tracking [Epic #607](https://github.com/paulgsc/some-ui/issues/607). See that
issue for the module tree, story sequencing, and the Kernel Independence
acceptance bar (Theorem D.2): this package must build and pass its full
conformance suite with **no business logic** — only a null adapter.

## Layout

```
src/
  contracts/    Token, Hypothesis, Invariant, Adapter, Action — types only
```

Everything else (`bootstrap/`, `session/`, `sensor/`, `estimator/`,
`adapter/`, `scheduler/`, `actuator/`, `lifecycle/`) lands story-by-story;
see the epic for sequencing.
