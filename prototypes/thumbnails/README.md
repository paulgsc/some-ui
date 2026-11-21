# Thumbnail prototypes (THUMB, #3361)

Scratch for the owner to judge; this folder never merges. The build (EPISODES3 on #3030: a
`thumbnail` composition in `packages/video-render` that home renders and Studio shows) comes
after the owner picks a direction.

Run from the repo root: `NODE_PATH=$(npm root -g) node_modules/.bin/tsx prototypes/thumbnails/generate.ts`.
It draws four directions × six genres × two titles (a real or plausible one, and a long one) at
1280×720, a 320×180 copy of each, and one contact sheet per direction (`out/sheet-*.png`), and
writes `out/hashes.txt`. A second run prints whether every PNG's hash matched the first.

What it reuses: the cast (`packages/some-styles/src/brand/cast.ts`) and the mark (`mark.ts`)
as they are; GENRE_PAINT and the genre shapes from `genre-thumbs.tsx`, copied into `genres.ts`
(the build would move that one drawing into `some-styles` so Studio's row and the thumbnail
share it). Two fonts, Barlow Condensed 800/600 and JetBrains Mono 600, come from the repo's
pinned `@fontsource` 5.3.0 packages, embedded as data URLs; no system font is reached. For that
reason the `?` and `{ }` in the interview and Rust shapes, which `genre-thumbs.tsx` draws as
text in Georgia and `ui-monospace`, are drawn as paths here. The cast's square key-light glow
is left out, since it reads as a box on a thumbnail's ground.

**Who appears is the honest signal in every direction.** The mochi (the owner) appears only
when the episode holds the owner's own voice; a tin bird is each synthetic (Kokoro) voice.
Which genres hold the owner's voice is assumed here (cards, interview and Rust essays do; the
call, Playoff Delta and the report are all synthetic). The build would read it from the
episode's speakers, not from the genre.

Titles are fitted by stepping the size down 2px from a maximum until they fit their box, never
below a minimum. No title in the set hit the minimum.

## The four cases first (owner, Nov 21)

`out/four-<direction>.png` puts the four cases the owner judges by side by side, at full size
and at 320×180, with short titles and then long ones: the weekly call, an explainer (the cards
essay "NixOS: how this machine upgrades itself", EXPLAIN #2980's showcase), the weekly Rust
Rounds essay and the interview essay. The real episodes live on home, which this sandbox can't
reach, so every short title comes from the repo's own sample episode for that kind and the
long ones are built from that episode's words; each caption names its source (`CASES` in
`genres.ts`). The cast follows each sample: the call and the explainer are Kokoro throughout
(the cut list's voice is `read`), so only birds appear; the Rust essay (cast-v1: you and the
tutor) and the interview essay (you and the asker) show the mochi too.

## A · Stage left: the cast speaks, nothing else says so

The cast stands on the left over a soft hue glow, the genre's name and title on the right. The
synthetic voice shows only as the tin bird: no word says "synthetic". It is the quietest and
most uniform; at 320×180 the title stays readable and the birds are recognisable. Limit: a
viewer who doesn't know what the tin bird means is told nothing, so on its own it signals only
to someone who has learned the cast. The genre shows by hue alone.

## B · Centred cast, constant badge in words

The cast centred at the top, the title centred below, the genre's name and a hue rule at the
foot, and a pill in the top right that says in words who speaks: "Synthetic voice" or "My voice

- a synthetic voice". The most explicit signal, and the same words in the same place on every
  video. Limit: the badge sits where YouTube overlays nothing at full size, but at 320×180 its
  words are about 11px tall, readable but small; and in a feed of these the badge repeats on
  every tile. Hue only for the genre.

## C · Genre shape behind, tin bird with its words

The genre's shape from `genre-thumbs.tsx` sits top right, dimmed; the title on the left; along
the foot, the tin bird with "Voiced by a tin bird · synthetic", and the mochi with "and me" at
the right when the owner speaks. Both signals at once, with the genre told by hue and shape
(so it holds for colour-blind eyes). Limit: the busiest layout; the title gets the narrowest
box, so long titles drop to the smallest type of the four, and the foot's words are the
first thing lost at 320×180 (the bird stays).

## D · Title on top, a hue banner holds cast, shape and words

The title takes the top two-thirds at the largest size; a banner in the genre's hue carries the
cast, the genre's name, the voice words in lower case and the genre's shape as a small icon.
The genre reads at a glance from the banner's colour, and the title is the most legible at
320×180. Limit: the banner is a large block of colour, louder than the other three, and the
voice words in it are small; the cast overlaps the banner's top edge, which reads as a choice
at full size and as clutter at 320×180.

## C2 · the owner's pick: C's upper area over D's footer band

The owner (Nov 21, close paraphrase): keep C's balance, where the genre shape and the picture
lead, and give it D's footer, a clear band with a hard colour edge, so the eye wanders down to
it and reads plainly that the episode is voiced synthetically. The upper area is C's. The band
is 144px, 20% of the height, across the full width, and holds the birds, "SYNTHETIC VOICE" in
the title face with "voiced by a tin bird" (or "tin birds") under it, and, where the owner's
voice is in the episode, the mochi and "+ ME" at the right (tightened from C's "and me" so it
reads at 320×180). No genre name in the band, since the upper area already carries it. Two
band colours, each with a sheet of the four cases (`out/four-c2a-hue-band.png`,
`out/four-c2b-tin-band.png`):

- **C2a, the genre's hue**, as D does, with the ground's colour as its ink. The band ties to
  the genre, so the band changes colour from video to video and the signal is in its words.
- **C2b, one tin-steel band on every video** (`#c3ccd6`, ink `#1c232b`), the birds' own
  metal, a colour no genre takes and neither sky nor leaf (C410). The band itself becomes the
  synthetic-voice mark across a feed. Limit: on the sand-coloured cards essay ground it is
  the lowest-contrast edge of the set, though still a hard one.
