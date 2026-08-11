# @some-ui/resume

`resume.typ` is the source of truth for Paul Gathondu's résumé — a
[Typst](https://typst.app) document, distilled from this repository itself.

It's written in STAR grammar, told project-first. Each entry opens with the
premise the project exists to answer — a browser is an operating system and
tabs are its processes; exposure should be opt-in; visual comfort is
measurable; a curriculum should adapt to the learner — and then cashes that
premise out in the mechanism implementing it: the state machine, the
invariant, the build constraint, the test corpus. The rule the document is
held to is that **a premise earns its place only if the next line cashes it
out in a mechanism**; motivation without mechanism doesn't belong on the
page.

There is deliberately no "Technical Skills" list. Enumerating languages and
tools communicates nothing a reader can verify; the same tools appear in the
bullets, attached to the thing they were used to build.

Nothing posting-specific lives here, so the document stays a reusable
drop-in for any application flow. The provenance map (résumé claim → the
crate, package, or workflow file backing it), the format's revision history,
and any posting-specific requirements analysis live separately in
`resume.meta.typ` — read as source, the same way `docs/canon/*.typ` is not
something you build so much as something you cite. See its header comment
for why the split exists.

> Claims in `resume.typ` are load-bearing: if something here stops being
> true, cut the line rather than re-justifying it, and update the matching
> entry in `resume.meta.typ` §2. The workspace counts in particular are
> derived, not remembered — see that section's _Counts_ note.

## Pipeline (MVP)

```
resume.typ  --typst compile-->  dist/resume.pdf
```

`pnpm build` (`scripts/compile.mjs`) compiles the document to
`dist/resume.pdf`. There's no browser-side WASM compiler and no server in
this first cut — that's a deliberate MVP cut, not an oversight: static
precompilation is the cheapest thing that actually proves the concept
(source-controlled `.typ` in, previewable/downloadable `PDF` out), and it's
the one option that doesn't ship a multi-megabyte compiler to every visitor
of `apps/www` just to render one page. See the option comparison this
decision was made against for the fuller tradeoff.

`apps/www`'s `/resume` route serves the compiled PDF for inline preview and
download — see its README for how the two are wired together.

### Hermetic tool provisioning

`scripts/compile.mjs` only compiles: it never downloads or installs executable
code. The repository's Nix shells provide `typst` from the `flake.lock`-pinned
`nixpkgs` input, so local and CI builds use the same content-addressed toolchain:

```sh
nix develop .#ci --command pnpm --filter @some-ui/resume build
```

The default development shell and `ci-playwright` shell provide the same tool.
Outside Nix, install Typst through the environment's normal, auditable package
management before building. A missing binary fails immediately with a setup
message; the build never turns missing tooling into an implicit network request.

`pnpm watch` runs `typst watch` for live recompilation while editing.

## What's out of scope for this MVP

- In-browser (WASM) compilation / live preview without a rebuild.
- Multiple resume variants generated from shared content (the "targets"
  idea - `rust.pdf`, `frontend.pdf`, etc.) - one document is enough to prove
  the pipeline; splitting content only pays off once there's a second
  variant that actually needs it.
