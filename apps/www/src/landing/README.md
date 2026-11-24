# The public site

GitHub Pages serves a static CV at https://paulgsc.github.io/some-ui/ (PAGES, #3401;
C1055). It is a landing, the résumé's pages, `/authorship` and a 404 page, with no app.
The landing reads whole with no script. Its one script, `enhance.ts` (C1422), only
enhances the show (below, "The show on a phone" and "Media").
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
  of what is coming, a clip's frame or a still's, by the face's slot (`slotOf`, C1185).

- **The cubes.** On a wide screen each media block is a closed, rounded prism with end
  caps, seen a little from below and aside, so a second surface shows at rest and through
  every turn. It stands as tall as its episode's narrowest picture needs (`pairTall`),
  and each face's picture sits in an aperture of its own shape.

## The show on a phone

Below 900 px, with the script, the show is a deck (`deck.ts`): one scene at a time, its
narration and its two faces. A swipe on any of the three turns all three together about Y,
following the finger and easing into the next face once let go. It goes round: past the
last scene to the first, and back. The finger is read by the phone's own pager
(`createPager`, `@some-ui/shared`), so the landing turns as the APK's decks do. Dots say
where you are, the arrow keys turn it, and a screen reader hears each scene once it lands.
Without the script, or with it blocked, the same scenes lie flat as a list.

## Media

Each face's clip or still sits in an aperture of its own shape, over its preview: the
producer's 40 px WebP frame (`show-faces.ts`), which the build serves within
`PREVIEW_BUDGET` (2 KiB each, 24 KiB a page), else broad theme shapes. Both carry one still
grain and the slot's mark, and a sheen crosses twice while the media waits. With the
script, the media crossfades in once it can be shown (a still decoded, a clip's first
frame), and gives way to the title card if it fails. Without it, the media paints over its
preview as it loads. Clips are ambient on every screen: autoplay, muted, loop, inline, no
controls. With the script, a clip plays only while its face is in view (on screen, and on
the stage only while the show's clock has its scene up). A reader who prefers less motion
sees each clip's preview, still.

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
and sways (C1186), and a reader can send it a hug (C1187): it is a button, and pressing it
squeezes it and sets a heart rising past its frame, all CSS, with no script and nothing
kept. Both play at every width where the reader allows motion, the phone included
(C1423); on a touch screen a quick tap plays the hug as the finger lifts. A reader who prefers less
motion gets a still heart that fades.

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
