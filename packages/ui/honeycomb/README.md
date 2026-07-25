# `@some-ui/honeycomb`

Hex-grid UI primitives and the Hangul typing activity: board, cells, prompt
station, overlays, keyboard input management, and the WASM bridge to
`hangul-game-core`.

> [!IMPORTANT] > **Canon-governed workspace — read the canon before editing this package.**
>
> - [`docs/canon/hangul-progression-canon.typ`](../../../docs/canon/hangul-progression-canon.typ) — _The Single-Glyph Ceiling_ — the challenge/board model the hex grid renders, and the Rust/TypeScript default-config parity obligation enforced by `default-config-parity.test.ts`
> - [`docs/canon/adaptive-learning-canon.typ`](../../../docs/canon/adaptive-learning-canon.typ) — _The Unobservable Learner_ — this package is a **renderer** in the canon's sense (Def. 9.1): it may hold no pedagogical state (Prop. 9.2), and must supply its own latency baseline before any timing observation can be compared with another surface (Prop. 9.1)
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
> [`docs/canon/README.md`](../../../docs/canon/README.md) for the amendment
> discipline.
