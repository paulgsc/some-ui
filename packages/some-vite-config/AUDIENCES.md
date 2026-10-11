# Build audiences: one app, a bundle per deploy

`apps/www` is one TanStack app that deploys four ways: the Docker image on the home
network, the GitHub Pages site, the Android app (`apps/mobile`), and (later) a VPS. Some of
what it will carry only means anything on the home network (the OBS control workspace is
the first), and some only inside the Android app (`@some-ui/soundbites`, which records
from the phone's microphone). **Build audiences**
keep that code out of every build that never runs there, without a second app or a weaker
type system. (One route tree for every profile was part of that design; it is now recorded as
debt, below in "Paths".)

This is about bundle size, not access. Nothing here hides or protects anything; a service
a LAN-only page talks to is the server's to guard.

## How it works

- **Each `packages/ui/*` workspace declares an audience** in `package.json`:
  `"someUi": { "audience": "public" | "lan" | "apk" | "web" }` (schema: `src/audience/schema.ts`).
  The field is required. Every profile, manifest and gate is typed against `AUDIENCES`.
- **Each build selects a profile.** `apps/www/build.profiles.ts` lists them (`lan`, the default,
  carries `public`, `lan` and `web`; `pages` carries `public` and `web`; `mobile`, the Android
  app's, carries `public` and `apk`), chosen by `SOME_UI_PROFILE`.
- **The desktop web and the phone are separate surfaces.** `web` and `apk` are mirrors: each
  holds what one device affords and the other has no counterpart for (Hangul Honeycomb, a
  keyboard game, is `web`; the soundbite recorder, the phone's microphone, is `apk`). Neither
  surface is the other fitted to a different screen, so neither profile carries the other's
  workspaces. `public` is what both play.
- **`audiencePlugin` stubs what the profile leaves out.** An import of an excluded workspace
  resolves to a module exporting the same names, each a function that throws when called.
  `tsc` still resolves the real package, so the route tree, typed links, search schemas and
  loaders are identical in every profile; only the bundle differs. The workspace's
  `/contract` subpath is never stubbed.
- **Gated routes live under a gate directory** (`gates` in `build.profiles.ts`; for `lan`,
  `apps/www/src/routes/_dashboard/_lan/`, for `apk`, `_dashboard/_apk/`). Its layout
  (`_lan.tsx`, `_apk.tsx`) calls `requireAudience("lan")` (or `"apk"`) in `beforeLoad`, which turns a visit into the app's ordinary
  not-found in a build without the audience, before a loader or component can reach a stub.
- **Or behind a door**, where shared code needs a gated workspace without a route of its own
  (the session player binding a panel, a page every build routes to). A door is a directory in
  `gates` that is also listed in `doors` (`build.profiles.ts`); today one, `web`'s
  `apps/www/src/lib/web-surface/`. Its `index.ts` hands the workspace out only where the build
  carries the audience and something inert elsewhere (A4): Hangul Honeycomb's panel joins the
  shared registry's panels in a web build, and is absent from the Android app's, which
  therefore offers no activity that plays it (`apps/www/src/lib/playable`).

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

**Invariants A1–A4: what the checks above cannot see.** Each is written for review, human or
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
- _Scope:_ `packages/ui/*` workspaces with a non-`public` audience. Held: the one contract
  in the repo, `@some-ui/soundbites`'s `src/contract.ts`, re-exports `src/lib/policy.ts`,
  whose one import is `import type`; `@some-ui/lesson-crm` exports no `./contract`.
- _Why not enforced:_ **mechanical; not yet a rule.** The plugin never stubs `/contract`, so
  whatever a contract module imports ships in every profile: a size regression, not a
  broken build, so neither the build nor an existing test notices. A lint rule would see one
  file at a time, but the claim is about the contract's whole relative-import graph, rooted
  at `package.json#exports` in another file. A test can walk that graph (the way
  `check:ui-manifests` walks manifests); nobody has written it yet.

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

**A4: A door hands out a gated workspace only behind its guard.**

- _Claim:_ in a door's `index.ts`, every `import()` of a gated workspace or of a module inside
  the door sits in the true branch of a conditional whose condition is written inline as
  `import.meta.env.VITE_DEVICE_BACKEND !== "true" && hasAudience("<audience>")` (for `web`),
  whose false branch loads nothing (an empty record, a component that renders `null`), and the
  index has no static value import of a gated workspace; and no module outside the door
  imports one inside it except through its `index.ts`.
- _Falsified by_ a hunk in a door's `index.ts` that adds such an `import()` or a static value
  import outside that branch, that deletes, weakens or moves the condition out of line (into a
  constant, which Rolldown folds only after chunking, so the Android app's build would write the
  chunk anyway), or that makes the false branch load code; a hunk outside a door that imports
  a path below its `index.ts` (the build allows it: the importer of the gated workspace is then
  the door's own module); or a hunk to `apps/www/build.profiles.ts` that adds a directory to
  `doors` whose `index.ts` does not meet the claim, or to `profileBuildEnv` in
  `apps/www/build.paths.ts` that sets `VITE_DEVICE_BACKEND` to `"true"` in a profile carrying
  `web`.
- _Scope:_ the directories in `doors` (`apps/www/build.profiles.ts`), and imports of them from
  the rest of `apps/www`. Held when written: `web-surface/index.ts`'s two exports
  (`WEB_PANELS`, `ExtensionsComb`) both sit behind the condition, and nothing outside the door
  imports below its index (`rg 'web-surface/' apps/www` finds none).
- _Why not enforced:_ the effect is checked, not the shape. `web-surface/index.test.tsx` loads
  the door with and without the flag and the audience and checks each export, and
  `check:bundle-paths` fails when the door's internals (`web-surface/hangul/**`, an `exclusive`
  rule) reach the `mobile` output. Neither sees a new export the test does not name until
  something in the APK binds it. Which branch an `import()` sits in is control flow, beyond a
  lint rule's reach for the same reasons as A3. The deep-import half is **mechanical; not yet a
  rule** (a `no-restricted-imports` pattern on `@/lib/web-surface/*`).

## Paths: what each build ships

Audiences decide which `packages/ui/*` workspaces a profile carries. The rule they serve is
wider, and it is the one this repository holds every build to: **a profile ships only the code
on its own path.** Code no visit to that deployable can run does not belong in its output, at
startup or in a lazy chunk, and when keeping it out takes structure (a split workspace, a
separate entry, a route tree per deployable) the repository pays for that, not the bundle.

`pnpm --filter www check:bundle-paths` (`apps/www/check-bundle-paths.ts`, rules in
`apps/www/build.paths.ts`, reader and checks in `src/bundle-paths/`) holds www to it. It
builds every profile the way its deployable does (`profileBuildEnv`), plus `--manifest` and
hidden sourcemaps, so the code checked is byte-for-byte what ships. It runs in root `pnpm lint`,
and in `pr.yml`'s Node job, which runs for any change that is not Markdown
(`_detect-changes.yml`: its lone `'!**/*.md'` pattern matches every other file), whenever
turbo's `...[HEAD^1]` selects www: a file under it or a workspace it builds from changed, or
the lockfile changed what one of them resolves (a bundler bump included). It fails on:

- **an orphan chunk**: emitted, and no HTML entry loads it through any chain of chunks;
- **an off-path module**: one `exclusive` gives to other profiles only, or one under an
  `allowlists` entry's `within` that its `allow` does not name. When the module is an
  `import()` target, its chunk and every chunk only it loads are charged to it, so a page
  off the path is reported with what it brings, not just its route file;
- **a missing module**: one `required` says the deployable cannot work without;
- **an undeclared exclusive**: a module some profiles ship and others do not, that no
  `exclusive` entry (or `decidedElsewhere`, for workspaces and npm packages) accounts for.
  This keeps `exclusive` complete: a new phone-only module fails the first time it builds;
- **stale debt**: a `debt` entry that matches nothing any more, so the list only shrinks;
- **an unmapped chunk** over 2 KiB: one whose contents cannot be attributed.

**Read a build flag where it guards an `import()`, or code that should not ship.** The audit that led here (October 2026) found
~118 KiB of native code in the web builds behind `VITE_DEVICE_BACKEND`, though Rolldown
does fold a constant across modules: it lays out chunks first and folds afterwards. A branch
on a flag imported from another module loses its code, but the chunk its `import()` named is
still written, and a module-level statement of an included module survives without the code
that used it. Written as `import.meta.env.VITE_X === "true"` at the branch, the value is a
literal before chunking and nothing is emitted. `src/bundle-paths/__tests__` pins the
first behaviour and its fix on a real build (the second is the same ordering, seen in www);
`apps/www/src/vite-env.d.ts` says it where the flag is declared. Flags still exported as
constants (`DATA_MODE`, `FETCHES_CONTENT`, `MOBILE_APP`) guard no `import()` today; one that
starts to leaves an orphan chunk, which fails.

**Why it reads the written output.** Rolldown's `OutputChunk.modules` lists modules whose code
was dropped after chunking (with a rendered length), and chunk names seen in `generateBundle`
are not always the ones written. So the reader starts from the HTML, follows the chunk names
each loaded chunk spells, and attributes code by sourcemap segments, counting a source only
where a segment maps something other than a keyword or punctuation to it (a dropped
declaration leaves a stray `var ` mapped to its first line).

What it cannot see, by construction:

- **Inside a prebuilt workspace.** A `packages/*` dist has no sourcemap for www's build to
  chain, so each file of it is one module. A workspace with code only some profiles run splits
  it into subpath entries (`BUILD.md`), and each entry file can then be named in a rule:
  `@some-ui/speech` exports its HTTP, browser and native voices this way, and `build.paths.ts`
  keeps each in the profiles that run it.
- **Code with no mapping** (a JSON module, a virtual module) belongs to its chunk only.
- **Files copied from `public/`**, which are not chunks, so no module rule reaches them. They
  are checked by name instead: `build.paths.ts`'s `offPathPublicFiles` lists what a profile
  never loads (the APK's résumé PDFs and the web-push service worker `sw.js`), `vite.config.ts`
  removes those from its output, and the check fails on one still there or on a name that
  matches nothing in `public/`. A file not on that list ships in every profile unexamined.
- **A module every profile ships**, but one of them never runs: the comparison has nothing to
  compare. It is caught only once `exclusive` names it.

**Debt today** (`build.paths.ts`, `debt`): every profile builds the one route tree, so the
routes off a profile's path ship there as stubs in the startup chunk and as page chunks
(about 67 KiB in the APK; the `apk` gate's pages in `lan` and `pages`, and the `lan` gate's
in `pages`). The gates and `keepToMobileSurface` keep them from rendering; the bytes are still
paid. Each entry goes with the change that gives that deployable its own route tree.

## Known gaps

- **Tailwind still scans gated workspaces in every profile** (#1538). `style.context.ts`
  lists every UI package `www` depends on, as its test requires, so utilities used only by a
  LAN workspace are generated into the public stylesheet too. Bytes of CSS, no code. The
  first LAN workspace, `@some-ui/lesson-crm`, landed without fixing it: it is built from
  `@some-ui/shared` components and adds few utilities of its own. So did the first `apk`
  one, `@some-ui/soundbites`, for the same reason.
