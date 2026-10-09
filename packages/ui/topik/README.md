# `@some-ui/topik`

Korean study session: framework-agnostic session state machine (pure reducer +
effect list + repository), chat and quiz panels, material selection, and TTS
effects.

The session architecture is documented in
[`src/lib/topik/README.md`](./src/lib/topik/README.md).

## Two renderers, two lessons

The applet mounts one of two renderers, chosen by the room its host grants
(`surface`, default `auto`):

- **Desktop** (`md` width and up, 480px height and up) — the session machine:
  a conversation plays through, then a batch quiz with the transcript
  alongside it.
- **Handheld** (below either) — `components/topik/handheld`: the phone's
  drama ([`docs/makjang/README.md`](../../../docs/makjang/README.md)). A
  lesson is one scene tree, played as a vertical webtoon by makjang's engine
  (`core/drama`, `core/drama-runtime`): each line heard before it is read
  (audio → Hangul → gloss), each scene's choice asked as large Korean
  targets, a wrong choice playing its consequence and repair, and the ending
  followed by the author's notes (작가의 말) on the choices made. It plays
  trees only: the operator's served ones (`adapter/tree-feed`), one the
  learner's own model wrote, or one kept on their shelf. Conversation files
  are the desktop's.

The handheld surface is not the desktop one reflowed. Stacking the desktop
panes on a phone scrolls the transcript out of view and silently turns an
open-book quiz into a closed-book one; the canon names that a valuation change
(Prop. 9.4) and declares the handheld valuation instead (Cor. 4.4, as the
drama amends it in v1.13: Rem. 4.12, 4.13).

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
