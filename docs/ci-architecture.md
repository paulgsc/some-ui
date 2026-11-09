# CI architecture

The rule, in one line: **a shared CI node carries only what holds by
definition for every workflow that uses it; workflows diverge at the latest
point where sharing still pays.** This page states the rule, the decisions it
led to (epic #1615), and what each part of CI does. Numbers in parentheses are
the PRs that made a part what it is, or the open issues where it continues.

## The rule and its test

Past a shared node, every workflow inherits every change made at that node.
So a node is shared only when it passes all four questions:

1. **Invariant:** is it true of every workflow by definition, or only by
   coincidence today?
2. **Payoff:** what does sharing delete, fix once, or reuse?
3. **Cascade:** which workflows move when the node changes, and is there a
   check that fails before they do?
4. **Divergence:** where do the workflows legitimately differ? A node that
   needs more than a few inputs to cover them (`node-ci-setup` takes two) is
   shared too far: split earlier.

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

Each has one aggregate check, judged by `re-actors/alls-green` (#1952):

- **CI Gate** is the one check branch protection requires. Every job votes;
  only the jobs whose own `if:` skips them for an unchanged area may be
  skipped, and `changes` must succeed, since when it fails everything gated on
  it is skipped.
- **Trunk Gate** requires every job, since nothing in Trunk is conditional.
- Both run under `if: always()`, not `!cancelled()`: a skipped required check
  counts as passed, so a gate skipped on a cancelled run would read green. The
  cost is a red gate on a head a newer push superseded.

## Setting up a job

`.github/actions/node-ci-setup` is the one place a workflow installs the
workspace (#1960): nix, the pnpm store cache, the frozen install, and the
résumé's assets. `build: affected` (the default, for `pr.yml`'s Node jobs)
also builds the changed packages; every other caller passes `build: none` and
builds what it needs. An inline `pnpm … install` in a workflow needs a
`Why not node-ci-setup:` line above its step, which `pnpm check:workflows`
enforces. Three do: the Pages build (a rollback checks out an older tree,
whose copy of the action would run), `pr.yml`'s one-package install, and
`wasm-release`'s root-only install.

## Release tracks

The shared policy in `scripts/release/policy.json` assigns packages and a
release branch to each Changesets track. Each track serializes runs across
refs because all its dispatches write that same branch. The publisher remains specific to
its artifact:

| Track          | Gate                                                              | Release branch                                 |
| -------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Pages          | Environment approval (`pages-release`); dispatch deploys directly | None                                           |
| Mobile APK     | Environment approval (`mobile-release`), including dispatch       | None                                           |
| Docker (`www`) | Merge its version PR                                              | `changeset-release/www-docker`                 |
| Extensions     | Merge the reviewed AMO build/notes PR                             | `changeset-release/extension-suspender-ledger` |
| WASM crates    | Merge their version PR                                            | `changeset-release/wasm`                       |
| Node packages  | Manual dispatch to version intents, then merge their PR           | `changeset-release/node`                       |

`track.mjs` projects the pnpm workspace onto the owning track for each
Changesets invocation. It preserves the workspace's catalogs and overrides,
hides foreign intents, rejects an intent that mixes tracks, and restores the
original workspace/config/foreign intents on normal return or exception. This prevents
WASM versioning from rewriting a Node consumer's registry pin. Each publisher
also restricts Changesets to the exact owned package/version request; its tags
and GitHub Releases use the same scope. `publish_only` dispatch retries current
versions for that track; it does not create new intents. Normal Node dispatch
versions pending Node intents, while normal WASM dispatch requests crate bumps.

A version transition in an owned manifest requests publication. Commit titles
are descriptive and can be edited without changing that decision. WASM can
publish bumped crates and request bumps for different source-only crates in the
same push. Refreshing the WASM PR carries forward the standing branch's
still-unmerged crate bumps, so a second source run cannot drop the first
crate's request. Older queued source runs whose crates gained a later version on
main request no additional bump. Docker keeps its dependency-graph check for
actual source changes.

The shared semantic diff ignores version-only manifest modifications,
changelogs and changeset bookkeeping when deciding whether Pages/APK need
approval or Docker/WASM need another source release. Added/deleted manifests,
dependency adoption, scripts and other manifest fields remain real changes.
The extension release is separate from Changesets and retains its built-content
digest and reviewed release record.

`RT1` in `scripts/release/release.test.mjs` exercises real Git trees and the
installed Changesets CLI, including isolated versioning, mixed intents,
publication subsets, retry cleanup, and mixed/reordered pushes. PR CI's Node
unit-test job runs it. Earlier checks paired CLI/action versions and required
a www bump; neither distinguished release ownership or semantic source changes.
The old shared `changeset-release/main` branch is superseded: pending release
PRs on it should be closed and regenerated on their owning branches.

`_environment-approval.yml` holds the approval job for Pages and the APK. A
newer push cancels a run still waiting for approval (`cancel-in-progress` per
environment), and the job fails if its environment has lost its required
reviewer: an environment a workflow names but that does not exist is created
unprotected, and the job runs at once.

## Storage

Every artifact and cache belongs to a family in
`packages/eslint/src/retention.ts`, each an instance of one state machine.
`.github/workflows/retention.yml` deletes what it plans (#1953, #1962): after a
successful run of each workflow that uploads a family kept across runs, so a
new copy prunes the old at once, and hourly for the rest. A sweep reads about
70 pages of the API from the token's hourly budget, which the whole repo
shares, so it does not run after every push, deletes at most 300 items, and
stops below a floor of remaining requests. A pull request that changes the
sweep only reports. CLAUDE.md, "Workflow storage", has the model and what
`check:workflows` enforces.

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
- Queued release runs can swap. Docker and WASM suppress source refreshes already covered by a newer
  version on main; `changeset publish` skips a version already published. A `publish_only` dispatch that swaps with
  a newer release could move Docker's `latest` back (#1958).
- A re-run that fails a validated run resets what the retention sweep keeps
  for that family (#1953).

## Open

- **#1619:** the `.turbo` cache, and retiring the hand-rolled `packages/*/dist`
  caches. Measure hit rates once the retention sweep has drained its backlog.
- **#1621:** every shell block over a few lines defensible, typed and tested,
  or replaced.
- **#1622:** is one shared push-to-main root worth its coupling? Expected
  answer: no, now that the install is shared and once #1619 lands.
- **#1951** (Docker's version). The separate WASM branch addresses #1959.
