# @some-ui/captions

Our own subtitles for the weekly NFL shorts (GWB11, #2085): our theme, our
font, our effects, burned into the video rather than left to YouTube's caption
track, which draws uploaded subtitles its own way. Web only
(`someUi.audience: "web"`); `apps/www` serves its preview at `/captions`
through the web surface's door.

A plain `.srt` still goes up beside each short, for search and for anyone who
turns captions on. A viewer who does sees both.

## What it is

`frameAt(captions, theme, t)` gives the frame at time `t`: which caption is
up, the word being said, and how far each word has popped in. The preview page
and the renderer that records a short (GWB10) both call it, so the preview is
what the video shows. Each module's header says why it is the way it is:

- `src/lib/timing.ts`: timed words to captions.
- `src/lib/lines.ts`: breaking a caption into at most two lines.
- `src/lib/layout.ts`: where a caption sits, clear of YouTube's controls.
- `src/lib/theme.ts`: the looks (Gridiron, Broadcast, Chalk) and their font.
- `src/lib/frame.ts`: the frame at a time.
- `src/lib/srt.ts`: the plain `.srt` file.
- `src/lib/sample.ts`: sample lines with made-up timings.
- `src/lib/words.ts`: the preview page's words.
- `src/lib/clock.ts`, `src/runtime/clock.ts`, `src/hooks/use-caption-clock.ts`:
  the preview's play, pause and scrub.
- `src/components/stage`: draws one frame.
- `src/components/preview`: the preview page.

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
