# @some-ui/captions

Our own subtitles for the weekly NFL shorts (GWB11, #2085): our theme, our
font, our effects, burned into the video rather than left to YouTube's caption
track, which draws uploaded subtitles its own way. Web only
(`someUi.audience: "web"`); `apps/www` serves its preview at `/captions`
through the web surface's door.

A plain `.srt` still goes up beside each short, for search and for anyone who
turns captions on. A viewer who does sees both.

## What it is

One pure function draws the subtitles: `frameAt(captions, theme, t)` gives the
frame at time `t` (which caption is up, the word being said, and how far each
word has popped in). The preview page and the renderer that records a short
(GWB10, on the home box) both call it, so the preview is what the video shows.

- **Words to captions** (`src/lib/timing.ts`). The input is the speaker's
  lines, each a list of words with start and end times in milliseconds. A
  caption is a run of words from one line, broken on a pause over 450 ms, at
  3.2 s, or when the words no longer fit in two lines. It stays up half a
  second past its last word, never past the next caption.
- **Line breaking** (`src/lib/lines.ts`). At most two lines, split where the
  longer line is shortest. Width is a character count: each character is one
  theme number wide (`charWidthEm`, an upper bound of the font's average
  advance), so a break is the same in node, on the page and in the renderer,
  and a line the model accepts never overflows.
- **Safe area** (`src/lib/layout.ts`). In a 1080x1920 short, YouTube's own
  buttons cover the right 15% and its title and channel the bottom 20%; the
  top 8% has its search and menu, and 6% on the left is a margin. Captions sit
  inside what is left, 48 px above its bottom edge, and a word too long for a
  line shrinks the type rather than leave it.
- **Themes** (`src/lib/theme.ts`). Font, size, colours (text, highlight,
  outline), outline width and a background plate; effects are the word-by-word
  highlight and the pop-in duration. Three to start: Gridiron, Broadcast and
  Chalk. Every one is set in Barlow Condensed (SIL Open Font License 1.1, free
  to embed in video); the host page loads its 600 and 800 weights.
- **The subtitle file** (`src/lib/srt.ts`). `toSrt(captions)` writes SubRip:
  one numbered entry per caption, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, its lines
  as drawn and its words as said.
- **Drawing** (`src/components/stage`). `CaptionStage` draws one frame in a
  9:16 box sized in container units, so a 400 px preview and a 1080x1920
  recording match. It only reads the frame; it keeps no time.
- **The preview's clock** (`src/lib/clock.ts`, `src/runtime/clock.ts`,
  `src/hooks/use-caption-clock.ts`). Play, pause and scrub are a pure state
  machine; a small runtime drives it on animation frames and is the only thing
  that reads the time.

The page's words live in one table, `src/lib/words.ts`, tested to say what
the subtitles look like and never how they are made.

## Sample data

`src/lib/sample.ts` holds four lines about a 49ers third-and-long, with made-up
timings (longer words take longer). They are for tuning a look, not a
measurement of speech.

## Word timings

Real shorts need each word's start and end. Today the VOICE2 transcriber in
paulgsc/server (`file_host/src/transcribe`) keeps only the text of a voice
note. whisper.cpp, which it runs, can also give a time for every token; the
transcriber would have to ask for them, join tokens into words and keep them
beside the text. That is a server change and waits on the owner's word:

> Should the voice-note transcriber on home also keep when each word was said
> (whisper.cpp's per-word times), so the shorts' subtitles can follow your
> voice word by word? Nothing changes on the server until you say yes.

Until then, this package runs only on the sample.

## Next

- **The renderer** (GWB10): records the preview stage at 1080x1920 frame by
  frame from `frameAt`, after the page's fonts have loaded.
- **Real lines**: word timings from the transcriber, corrected in review
  (GWB13).
