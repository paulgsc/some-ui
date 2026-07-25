# `leetype_wasm`

Pure-Rust typing engine for code: canonicalization, cursor matching, chunked
targets with bounded memory, and per-chunk statistics. Compiled to WASM and
consumed by `@some-ui/leetype`.

> [!IMPORTANT] > **Canon-governed workspace — read the canon before editing this package.**
>
> - [`docs/canon/hangul-progression-canon.typ`](../../docs/canon/hangul-progression-canon.typ) — _The Single-Glyph Ceiling_ — §11.2's API-authority axiom (`wasm_bindgen` confined to `lib.rs`, enforced by `scripts/check-wasm-bindgen-boundary.sh`), and the crate-boundary comparison this crate is the reference point for
> - [`docs/canon/adaptive-learning-canon.typ`](../../docs/canon/adaptive-learning-canon.typ) — _The Unobservable Learner_ — why per-chunk WPM and cumulative error counts are displays rather than learner state (Prop. 2.1), and what this crate must emit instead (Def. 3.1)
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
