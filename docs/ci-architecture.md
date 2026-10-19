# CI architecture

The rule, in one line: **a shared CI node carries only what holds by
definition for every workflow that uses it; workflows diverge at the latest
point where sharing still pays.** Epic #1615 measured the workflows against
it; this page records the rule, the decisions it led to, and what each part
does now.

## The rule and its test

Past a shared node, every workflow inherits every change made at that node.
So a node is shared only when it passes all four questions:

1. **Invariant:** is it true of every workflow by definition, or only by
   coincidence today?
2. **Payoff:** what does sharing delete, fix once, or reuse?
3. **Cascade:** which workflows move when the node changes, and is there a
   check that fails before they do?
4. **Divergence:** where do the workflows legitimately differ? If the node
   needs an input per difference (more than about two to six), split earlier.

**Sharing by content-addressing has no cascade.** A cache keyed by its inputs
(turbo's task cache) cannot serve a stale entry, so it couples workflows
without one breaking another. Sharing a produced artifact or a parameterized
workflow does cascade. Prefer the first wherever both work.

## PR CI and Trunk

`pr.yml` asks "does this change break what it touches?": turbo's
`--filter=...[HEAD^1]` scopes Node work to changed packages and their
dependents, and `_detect-changes.yml` decides which of Rust, Node and Deny
run. `trunk.yml` asks "is the whole repo healthy?" on every push to `main`,
unfiltered.

Each has one aggregate check, judged by `re-actors/alls-green` (#1616):

- **CI Gate** is the one check branch protection requires. Every job votes;
  only the jobs whose own `if:` skips them for an unchanged area may be
  skipped, and `changes` must succeed (a failed detection once skipped
  everything and passed).
- **Trunk Gate** requires every job, since nothing in Trunk is conditional.
- Both run under `if: always()`, not `!cancelled()`: a skipped required check
  counts as passed, so a gate skipped on a cancelled run would read green. The
  cost is a red gate on a head a newer push superseded.

## Setting up a job

`.github/actions/node-ci-setup` is the one place a workflow installs the
workspace (#1618): nix, the pnpm store cache, the frozen install, and the
résumé's assets. `build: affected` (the default, for `pr.yml`'s Node jobs)
also builds the changed packages; every other caller passes `build: none` and
builds what it needs. An inline `pnpm … install` in a workflow needs a
`Why not node-ci-setup:` line above its step, which `pnpm check:workflows`
enforces. Three do: the Pages rollback build (a rollback checks out an older
tree, whose copy of the action would run), `pr.yml`'s one-package install,
and `wasm-release`'s root-only install.

## Release tracks

The publish legs are the leaves: they share nothing and change only on
purpose. What gates each one:

| Track               | Gate                                        | Notes                                                                                                                         |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Pages               | Environment approval (`pages-release`)      | Decision 1, #1859. A newer push cancels a run still waiting.                                                                  |
| Mobile APK          | Environment approval (`mobile-release`)     | Decision 1, #1859.                                                                                                            |
| Docker (`www`)      | Release PR (`changeset-release/www-docker`) | `queue: max`; an ordinary run that starts after a newer release skips (#1958). Whether its version carries anything is #1951. |
| Extensions          | Release PR per extension                    | Notes chosen per version (#1750), so the version carries information.                                                         |
| wasm crates         | changesets/action PR                        | `queue: max` (#1958). Earlier runs' changesets are dropped per run: #1959.                                                    |
| npm (`release.yml`) | Manual dispatch, changesets/action          | Decides from `main`'s state, so the default queue is right.                                                                   |

`_environment-approval.yml` holds the approval job for Pages and the APK, and
fails if its environment has lost its required reviewer: an environment a
workflow names but that does not exist is created unprotected, and the job
runs at once.

## Storage

Every artifact and cache belongs to a family in
`packages/eslint/src/retention.ts`, each an instance of one state machine.
`.github/workflows/retention.yml` deletes what it plans (#1950, #1962): after
each workflow that uploads a family kept across runs, and hourly for the rest,
at most 300 items a sweep, since a sweep reads about 70 pages of the API and
the token's hourly budget is the whole repo's. CLAUDE.md, "Workflow storage",
has the model and what `check:workflows` enforces.

## Decisions

Recorded on #1615, with the owner's choice:

- **D1, the gate per track:** an Environment approval for Pages and the APK;
  release PRs stay for Docker and the extensions.
- **D2, versions:** a release PR only where something consumes the version
  (the Docker tag, AMO); it still opens on a turbo graph change.
- **D3, typed tooling:** TypeScript on Node's type stripping, the
  `scripts/check-workflows.ts` and `packages/eslint` idiom, not a Rust
  `xtask`.
- **D4, the turbo cache:** the local `.turbo` cache through `actions/cache`
  (#1619), not the Vercel registry.

## Accepted residuals

Each is known, rare, and clears on the next run:

- GitHub does not guarantee job order. Two pushes seconds apart can leave the
  older Pages or APK run as the one waiting, and in a rare overlap an older
  Pages deploy can follow a newer one (#1859).
- Two overlapping APK builds can briefly leave two APKs (#1859).
- Queued release runs can swap. Docker's guard covers the refresh; a wasm
  refresh then proposes bumps from an older tree, and `changeset publish`
  skips a version already published. A `publish_only` dispatch that swaps with
  a newer release could move Docker's `latest` back (#1958).
- A re-run that fails a validated run resets what the retention sweep keeps
  for that family (#1953).

## Open

- **#1619:** the `.turbo` cache, and retiring the hand-rolled `packages/*/dist`
  caches. Measure once the retention sweep has drained its backlog: before it,
  the cache sat over its 10 GB cap and evicted most of what a measurement
  would read.
- **#1621:** every shell block over a few lines defensible, typed and tested,
  or replaced.
- **#1622:** is one shared push-to-main root worth its coupling? Expected
  answer: no, once #1618 and #1619 have landed.
- **#1951** (Docker's version) and **#1959** (the wasm release branch).
