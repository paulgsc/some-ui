# The public site

GitHub Pages serves a static CV at https://paulgsc.github.io/some-ui/ (PAGES, #3401;
C1055). It is a landing, the résumé's pages, `/authorship` and a 404 page, with no app.
`render.ts` draws the landing at build time from the résumé's data and `words.ts`, and
`apps/www/render-public-site.ts` writes the pages for `vite.config.ts`'s `publicSite` to
fill.

The landing's clips and stills are never committed (C1059). Their producer workflows
(Site Assets, Snips Capture) upload them as `site-assets-<kind>-<sha>` artifacts, and
`apps/www/scripts/fetch-site-media.sh` puts the newest of each kind where the build looks.
A slot with no media draws its placeholder.

## The show

"What I built and use every day" is a script (C1180): `show.ts` lists the episodes, a
project each. Each episode is one to four scenes, and each scene is some copy and two faces.

- **Copy.** A scene's copy is a chapter of the episode's walkthrough
  (`apps/www/tests/walk/jobs-walkthrough.json`,
  `packages/video-motion/walks/home-server.json`), or its own words where there is none,
  marked `draft` until the owner has read them. A draft shows only in a preview
  (`SITE_SHOW_DRAFTS=1`), never on Pages; agreeing one sets its `draft` to false.
- **Timing.** `timeline.ts` lays the whole show on one clock: copy streams in, then the
  cubes turn.
- **Faces.** The faces are made by `apps/www/scripts/show-faces.ts` in the two producer
  jobs: each still copied from a walk's screens, each cut taken silent from a rendered
  video by shot. A face the build doesn't have shows its title card.
- **Skeletons.** Until an episode's pair turns in, each of its places stands as a skeleton
  of what is coming, a clip's frame or a still's (`faceSkeleton`, C1185).

## Themes

The landing wears the repo's session themes (C1184): `themes.ts` takes each one's colours
from `@some-ui/styles` when the site is built, and the page names no colour of its own.
The device's light or dark setting picks Mochi or Mochi Night, and the header's "Theme"
picker (radios, no script) tries any other; the page keeps nothing about the choice.

## Previewing a branch on your machine

To see a branch's site exactly as Pages would serve it, before it merges and without a
Pages run (C1111):

```sh
git fetch origin && git checkout <branch>
nix develop .#ci --command pnpm install
nix develop .#ci --command pnpm --filter www preview:pages
```

Run it in the repo's `.#ci` shell, the one Pages builds in. That shell carries the Node and
pnpm `nix/node` pins (`packageManager` is a copy of them), plus `pdftotext` for the
résumé's checks. The `default` shell has no Node or pnpm. A pnpm from outside the flake
(a global or home-manager install) that differs from `packageManager` tries to fetch and
switch to the pinned one, and can fail before it runs anything.

It fetches the newest media from main's runs, builds www with the Pages build's settings
(the `pages` profile, static data, the `/some-ui/` base), and serves the result at
http://localhost:4173/some-ui/ until you press Ctrl-C.

It needs:

- Nix, for the `.#ci` shell (or pnpm and Node at the versions `packageManager` and
  `.nvmrc` name);
- `gh`, signed in to an account that can read this repository's Actions (`gh auth status`).

Without `gh`, the command says so, and the page shows each slot's placeholder, as a
deploy with no media would. If a fetch finds nothing, the media from your last preview
stay. The first build takes a few minutes. A later one rebuilds only what changed. One
difference from Pages: a path the site doesn't have shows the landing here, where Pages
shows its 404 page.
