# `hangul-game-core`

Pure-Rust game engine for content-typing games, compiled to WASM. Hosts the
challenge/matcher/difficulty machinery consumed by `@some-ui/honeycomb`.

Architecture decisions live in [`docs/adr/`](./docs/adr); the derivations
those ADRs state as given live in the canons below.

> [!IMPORTANT] > **Canon-governed workspace — read the canon before editing this package.**
>
> - [`docs/canon/hangul-progression-canon.typ`](../../docs/canon/hangul-progression-canon.typ) — _The Single-Glyph Ceiling_ — the content-model algebra this crate implements: stimulus, answer sequence, token cursor, content domain
> - [`docs/canon/adaptive-learning-canon.typ`](../../docs/canon/adaptive-learning-canon.typ) — _The Unobservable Learner_ — why the engine's `HashSet` of completed identities and its single shared difficulty scalar cannot become adaptive (Prop. 2.2, Thm. 6.1), and why the `!show_romanization` gate must stay (Cor. 3.2)
>
> These are not background reading. They are the documents this package is
> _derived_ from: modules here are checked against a Definition / Axiom /
> Theorem number, not against a feature spec. If a change cannot be traced to
> a canon citation, either it belongs somewhere else or the canon is missing
> an amendment that should land first.
>
> **Human reviewers:** a diff that changes behaviour governed by a canon and
> cites nothing is incomplete — ask for the citation.
> **LLM agents:** read the cited sections before proposing a change, and never
> silently renumber or rewrite a canon result. See
> [`docs/canon/README.md`](../../docs/canon/README.md) for the amendment
> discipline.
