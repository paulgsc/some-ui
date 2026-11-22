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
