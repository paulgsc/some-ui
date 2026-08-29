# `@some-ui/canon` — the metamathematics canons

**This directory is the canonical and only home for `.typ` canons in this
repository.** A canon filed next to the source it governs is unreachable by
the other workspaces that depend on the same derivation; every canon here is
cited by at least two workspaces, and several are cited by CI boundary
scripts. Adding a `.typ` file anywhere else fails `pnpm canon:check`.

## What a canon is

A canon is **not** a design proposal, an ADR, or a README. It is a formal
theory from which source is _derived_, maintained under theory revision
rather than bug-fixing: the code is disposable and re-derivable, the canon is
the durable object that a falsifying observation revises.

The practical consequence, and the reason this matters to anyone reading a
diff:

> A patch that cannot be traced to a Definition / Axiom / Proposition /
> Theorem number in the governing canon is, by definition, a happy-path
> patch, and will regress. Amend the canon first, then derive the patch.

Each canon carries its own **Amendment Protocol** section stating how it is
revised and what counts as a falsifier. Numbering is assigned by hand so that
citation anchors survive section reshuffles.

## The canons

| Canon                                                                | Title                        | Governs                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`dom-state-estimation-canon.typ`](./dom-state-estimation-canon.typ) | _The Unsettled Surface_      | `extensions/transport`, `extensions/some-censor`, `extensions/some-filter`, and all descendants                                 |
| [`hangul-progression-canon.typ`](./hangul-progression-canon.typ)     | _The Single-Glyph Ceiling_   | `crates/hangul-game-core`, `crates/leetype_wasm`, `packages/ui/honeycomb`                                                       |
| [`adaptive-learning-canon.typ`](./adaptive-learning-canon.typ)       | _The Unobservable Learner_   | `packages/ui/honeycomb`, `packages/ui/leetype`, `packages/ui/topik`, `packages/ui/interview`, `pedagogy/`, and the tutor skills |
| [`complexity-witness-canon.typ`](./complexity-witness-canon.typ)     | _The Unprovable Measurement_ | `packages/ui/leetype`, `crates/leetype_wasm`, `packages/some-content/prompts/leetype-exercise-generator`, `pedagogy/`           |

The four are deliberately layered rather than independent:
_The Unsettled Surface_ fixes the estimation-then-control factorization,
_The Unobservable Learner_ instantiates that factorization over a learner
instead of a document, _The Single-Glyph Ceiling_ fixes the content-model
algebra the learner canon's exercises are drawn from, and _The Unprovable
Measurement_ fixes the object one surface's exercises are **about** —
inheriting the learner canon's belief, decay and oracle results wholesale
rather than re-deriving any of them.

One thing is unique to _The Unprovable Measurement_ and worth knowing before
editing it: its §7 register assigns stable `CW-P` identifiers that source code
cites **by identifier**, checked mechanically. Renumbering that section is not
a cosmetic change there — it is a broken build.

## For LLM agents

Read the governing canon **before** editing any source that cites it. The
canons are written to be read as source — they need no build step, and the
`.typ` file is the artifact, not a PDF of it. When you touch a governed
workspace:

1. Locate the canon citation nearest the code you are changing (source
   comments cite section and theorem numbers directly).
2. If your change is _derivable_ from the cited result, say so in the commit
   message with the citation.
3. If it is not, you are proposing an amendment. Write the amendment into the
   canon's Amendment Protocol section in the same change, or stop and say
   that the canon is missing a result.

Do not "clean up" a canon's hand-assigned numbering, and do not silently edit
a superseded Remark or Proposition — canons record revisions as _new_
numbered items so that older citations keep resolving.

## Commands

```sh
pnpm --filter @some-ui/canon canon:check   # invariants C1/C2
pnpm --filter @some-ui/canon canon:build   # render PDFs, if typst is installed

# or directly, the way CI would call them:
bash docs/canon/scripts/check-citations.sh
bash docs/canon/scripts/build.sh
```

Both are bash, alongside the repository's other guardrails
(`scripts/check-wasm-bindgen-boundary.sh`,
`scripts/check-mutation-boundary.sh`) — `check-citations.sh` is the third of
that family and is the one worth wiring into CI.

`canon:build` is a local convenience and is intentionally **not** a turbo
task: `typst` is not a repository dependency, and the `.typ` sources are the
canonical artifact. The script exits 0 when `typst` is absent.
