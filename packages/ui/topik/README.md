# `@some-ui/topik`

Korean study session: framework-agnostic session state machine (pure reducer +
effect list + repository), chat and quiz panels, material selection, and TTS
effects.

The session architecture is documented in
[`src/lib/topik/README.md`](./src/lib/topik/README.md).

> [!IMPORTANT] > **Canon-governed workspace — read the canon before editing this package.**
>
> - [`docs/canon/adaptive-learning-canon.typ`](../../../docs/canon/adaptive-learning-canon.typ) — _The Unobservable Learner_ — the `{batch, message, question}` cursor is content position, not learner state (P.2); positional identity orphans persisted belief on any content revision (Thm. 1.1); batch-level pass/fail discards the per-item distribution (Rem. 4.3). The session machine's pure-reducer shape is _endorsed_ by the canon (§10) — it is the state it carries that changes
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
