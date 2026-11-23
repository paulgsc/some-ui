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
  video by shot. The producer also writes 40 px WebP previews. The Pages build serves
  up to 2 KiB per preview and 24 KiB total. A missing preview uses a theme-colored
  screen and shared grain tile. A missing asset shows its title card. On desktop each
  media block is a closed, tilted rectangular prism. Its aperture uses the still or
  clip's display ratio inside the shell.
- **Previews.** The episode's two waiting screens use the same previews as the faces,
  with one brief sheen on their first appearance. Each face keeps its preview underneath
  the image or native video poster. The landing's script-free build rule means reveal
  is browser-native. Decode-driven fades, request-error replacement and pausing a video
  as its face leaves the stage require a controller.
- **Narrow screens.** The same resolved scenes form a native horizontal scroll-snap deck,
  with bounded previous and next links and positions in published order. On browsers with
  scroll-driven CSS, all three cards turn together as the deck scrolls. The browser owns
  gesture thresholds and settling. Scroll-state queries suppress offscreen card focus
  where supported. The deck reserves room for its tallest scene. Browsers without scroll
  snap and wide screens in reduced-motion mode show the same markup as a static list.
  Narrow reduced-motion mode keeps the deck without the turns or video playback.

## Themes

The landing wears the repo's session themes (C1184): `themes.ts` takes each one's colours
from `@some-ui/styles` when the site is built, and the page names no colour of its own.
The device's light or dark setting picks Mochi or Mochi Night, and the header's theme
picker (radios, no script) tries any other; the page keeps nothing about the choice. It
opens behind the app's own palette icon, drawn from lucide at build time
(`theme-icons.ts`), as the app's theme switcher shows it, and closes on a click outside
it, on Escape, or when a theme is picked: its open state is a popover, which the browser
dismisses.

## The mochi

Until the owner's photo is bundled, the photo slot holds the mochi (`mochi.ts`). It blinks
and sways where the page moves (C1186), and a reader can send it a hug (C1187): it is a
button, and pressing it sets a heart rising, all CSS, with no script and nothing kept.

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
