# `@some-ui/leetype`

Code-typing activity: challenge selection, chunked code display, typing game
UI, timers, and local progress storage. Wraps the `leetype_wasm` engine.

> [!IMPORTANT] > **Canon-governed workspace — read the canon before editing this package.**
>
> - [`docs/canon/adaptive-learning-canon.typ`](../../../docs/canon/adaptive-learning-canon.typ) — _The Unobservable Learner_ — the `adaptiveHidden` latch is not a policy (Prop. 6.1); `PlayerProgress.solves` grows without bound against an evictable quota (Prop. 7.1); XP and level cannot support adaptation (Prop. 2.1). Read §6–§7 before touching `player-store` or the adaptive threshold
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
