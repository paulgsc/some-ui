# `some-censor`

Browser extension that profiles and mutates a vendor-controlled DOM. Built on
the `@some-extension/transport` kernel.

> [!IMPORTANT] > **Canon-governed workspace — read the canon before editing this package.**
>
> - [`docs/canon/dom-state-estimation-canon.typ`](../../docs/canon/dom-state-estimation-canon.typ) — _The Unsettled Surface_ — the observe/estimate/plan/act factorization this extension implements, and the impossibility results (§2) that forbid treating the vendor DOM as settled or fully observed
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
