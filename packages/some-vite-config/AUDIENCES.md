# Build audiences: one app, a bundle per deploy

`apps/www` is one TanStack app that deploys three ways: the Docker image on the home
network, the GitHub Pages site, and (later) a VPS. Some of what it will carry only means
anything on the home network (the OBS control workspace is the first). **Build audiences**
keep that code out of every build that never runs there, without a second app, a second
route tree or a weaker type system.

This is about bundle size, not access. Nothing here hides or protects anything; a service
a LAN-only page talks to is the server's to guard.

## How it works

- **Each `packages/ui/*` workspace declares an audience** in `package.json`:
  `"someUi": { "audience": "public" | "lan" }` (schema: `src/audience/schema.ts`). The field
  is required. Every profile, manifest and gate is typed against `AUDIENCES`.
- **Each build selects a profile.** `apps/www/build.profiles.ts` lists them (`lan`, the default,
  carries everything; `pages` carries `public`), chosen by `SOME_UI_PROFILE`.
- **`audiencePlugin` stubs what the profile leaves out.** An import of an excluded workspace
  resolves to a module exporting the same names, each a function that throws when called.
  `tsc` still resolves the real package, so the route tree, typed links, search schemas and
  loaders are identical in every profile; only the bundle differs. The workspace's
  `/contract` subpath is never stubbed.
- **Gated routes live under a gate directory** (`gates` in `build.profiles.ts`; for `lan`,
  `apps/www/src/routes/_dashboard/_lan/`). Its layout (`_lan.tsx`) calls
  `requireAudience("lan")` in `beforeLoad`, which turns a visit into the app's ordinary
  not-found in a build without the audience, before a loader or component can reach a stub.

## What is enforced, and what is not

| Layer | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Types | `gates` is a total record over the gated audiences, so a new audience fails `tsc` until it has a gate; profile audiences are checked against `AUDIENCES`                                                                                                                                                                                                                                                                                                                             |
| Build | `audiencePlugin` fails the build on a missing or invalid `someUi` field, and on an import of a gated workspace from outside its gate, in **every** profile (not only the ones that stub it)                                                                                                                                                                                                                                                                                          |
| CI    | `pnpm check:ui-manifests` (the plugin's own manifest reader, run from source) runs on every PR and in root `pnpm lint`, so a workspace no app builds yet still fails the PR that adds it; turbo hashes `SOME_UI_PROFILE` for `www#build`                                                                                                                                                                                                                                             |
| Tests | `src/audience/__tests__/plugin.test.ts` (real builds over a fixture workspace: stubs, contract, boundary, manifests); `apps/www/src/routes/__tests__/audience-gates.test.ts` (every route under every gate is not-found without its audience, and loads with it; a source file outside the gates that names a gated path must import `hasAudience`, with the gated paths taken from the route tree so moves and new gates are covered; pins the router behaviour the gate relies on) |

The router behaviour that test pins, measured on `@tanstack/react-router` 1.170: before a
parent's `beforeLoad` runs, a child's `validateSearch` and `params.parse` have already run,
and a throw from either is recorded while the parent's not-found still wins. A throw from
`loaderDeps`, `search.middlewares` or `context` fails matching before the guard runs at all.

**Invariants A1–A3: what the checks above cannot see.** Each is written for review, human or
bot, one hunk at a time (`REVIEW.md`). Each held on `main` when it was written; a violation
is a regression, not debt. Each falsifier covers deletions and moves as well as additions.

**A1: A gated route reaches no stub before its guard.**

- _Claim:_ in a route file under a gate directory, the values of the `loaderDeps`, `search`
  and `context` route options reference nothing imported from a gated workspace's main
  entry: a specifier that is a non-`public` workspace's package name, or a subpath of it
  other than `/contract`.
- _Falsified by_ a hunk, in such a file, that adds to one of those options a reference to an
  identifier imported from such a specifier, or that re-points an import already referenced
  there at such a specifier (for example `/contract` to the main entry); or a hunk that moves
  a route file with such a reference under a gate directory, or adds to `gates` in
  `apps/www/build.profiles.ts` a directory whose route files already have one; or a hunk to a
  workspace's `package.json` that changes `someUi.audience` from `public` while a route file
  under a gate directory references that workspace in one of those options (the route files
  under the directories in `gates` are the ones to read). Whether a workspace is gated is its
  `package.json`'s `someUi.audience`.
- _Scope:_ route files under the directories in `gates` (`apps/www/build.profiles.ts`), and
  the `someUi` field of every `packages/ui/*/package.json`. `validateSearch` and `params` are
  exempt: the router tolerates a throw there, and `audience-gates.test.ts` fails if an
  upgrade changes that. Held when written: no route under a gate defines any of these
  options.
- _Why not enforced:_ `audience-gates.test.ts` stubs every workspace its manifest gates, so
  it fails on any such call the probe URL reaches, audience changes included (checked by
  mutation); but it takes one path per route; a call behind a branch on a search
  param or a param value it does not set goes through. A lint rule would need the imported
  package's audience, which lives in another file's manifest, and `eslint --cache` re-uses a
  file's verdict until that file changes. Types cannot see it: stubs are invisible to `tsc`
  by design.

**A2: A contract entry carries no implementation.**

- _Claim:_ in a workspace whose `someUi.audience` is not `public`, the module its
  `package.json` exports as `./contract`, and every module that one imports relatively,
  import values only from `zod` and from each other; every other import is `import type`.
- _Falsified by_ a hunk, in such a module, that adds a value import from any other specifier
  or turns an `import type` into a value import; or that adds a relative import of a module
  not already in the contract's graph, when that module, or any module it imports relatively,
  does not meet the claim (read the newly imported module and follow its relative imports);
  or a hunk to that workspace's `package.json` that points `exports["./contract"]` at a
  module not meeting the claim, or makes the workspace non-`public` while its contract
  module does not meet it.
- _Scope:_ `packages/ui/*` workspaces with a non-`public` audience. Held when written, with
  none in the repo yet. The first, `@some-ui/lesson-crm`, exports no `./contract` at all, so
  it holds vacuously there; the OBS workspace is expected to be the first with one.
- _Why not enforced:_ mechanical; not yet a test. The plugin never stubs `/contract`, so
  whatever a contract module imports ships in every profile: a size regression, not a
  broken build, so neither the build nor an existing test notices. A lint rule would see one
  file at a time, but the claim is about the contract's whole relative-import graph, rooted
  at `package.json#exports` in another file. A test can walk that graph (the way
  `check:ui-manifests` walks manifests); with no gated workspace yet it would walk nothing,
  so it lands with the first one.

**A3: Public UI offers a gated route only when the build carries it.**

`audience-gates.test.ts` enforces the file-level half: a file outside the gates that names a
gated path as a string literal must import `hasAudience`, and the gated paths are recomputed
from the route tree on every run, so moving a page under a gate or adding a gate directory is
checked against every existing link. What is left is inside such a file.

- _Claim:_ in `apps/www/src` outside the gate directories, every `Link`, `<Navigate`,
  `navigate(` or `redirect(` whose `to` is the path of a route under a gate directory sits in
  code that runs only when `hasAudience("<audience>")` from `@/lib/build-profile` is true.
- _Falsified by_ a hunk outside the gate directories that adds such a `to` outside the
  checked branch, that moves one out of it, or that deletes or weakens the check while the
  link stays (the import left in place keeps the test quiet); or that adds a link whose `to`
  is not a string literal (a variable, a template) and can resolve to a gated path, without
  the check. The gated paths are those of the route files under the directories in `gates`
  (`apps/www/build.profiles.ts`).
- _Scope:_ `apps/www/src`, excluding the gate directories. Held when written: no file outside
  them names a gated path.
- _Why not enforced:_ the test reads files, not control flow: which branch a link sits in,
  and what a non-literal `to` evaluates to, are beyond a text scan, and a test rendering
  every public page in a `pages` build to see its links would be an open-ended state space
  for the cost of one link to not-found. `tsc` accepts the link on purpose (the route tree is
  the same in every profile), and a lint rule would need the route tree, another file (the
  `eslint --cache` problem again).

## Known gaps

- **Tailwind still scans gated workspaces in every profile** (#1538). `style.context.ts`
  lists every UI package `www` depends on, as its test requires, so utilities used only by a
  LAN workspace are generated into the public stylesheet too. Bytes of CSS, no code. The
  first LAN workspace, `@some-ui/lesson-crm`, landed without fixing it: it is built from
  `@some-ui/shared` components and adds few utilities of its own.
