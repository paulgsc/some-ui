# A cards essay's routine

## What this is, and why you'd reach for it

A cards essay is a short spoken video that teaches one workflow you set up
and then stopped thinking about: how a machine upgrades itself, how a
scratchpad opens and closes. It is a podcast you can watch. A voice opens
by saying why you would be here and what you'll be able to do by the end,
then walks through the workflow one card at a time, and closes by saying
what to do next. Each card is a picture of one part of the workflow: a
flow of steps, a sheet of commands, a terminal, a legend. Every claim on a
card carries a badge saying how far to trust it, and every card is stamped
with the commits it was checked against.

It is written for you, months from now, with none of today's context: you
come back to a workflow, the details are gone, and you want to be using it
again in ten minutes rather than re-reading code. Write every word for that
listener.

A session (Claude, scheduled or asked) writes the essay. Home, the server
on your own network, says every line with its own speech model and renders
the video. You watch it in Studio › Renders on your phone.

By the end of this routine, a session has written one essay, heard it
rendered once, and published it where home picks it up.

## Who does what

- **The session** chooses the subject, the cards and their order, checks
  every claim against the repositories at a commit, and writes every word
  that is said. That judgement can't be written as code.
- **Code** refuses what can't be drawn or said. `render cards-check` (below)
  refuses an essay with no intro, a scene with no narration, a scene
  with no chapter line before any chapter has opened, a line the speech model can't say (empty, punctuation alone,
  or over 4,000 characters), and an essay whose words run past ten minutes.
  It also refuses a malformed cut list, a card with no stamp, a series
  version home doesn't hold, and anything that version lacks. Given a clone
  of each repository the stamp pins, it holds every line's sources to the
  stamp's commit (below, "An essay is an authority"). Drawing
  refuses a line that doesn't fit a card or a character the font lacks.
- **Home** reads `paulgsc/testing`'s `cards/` folder hourly and keeps each
  new essay as first served. Its render worker has Kokoro, the speech model
  home runs, say each line with each word's timing, holds each card for as
  long as its words take, writes the words as captions in the lower third
  of the frame, below the card, and renders the video. The same essay on the same image gives the
  same video.

## The shape of a spoken essay

The essay is a cut list: one JSON file, a list of scenes, each a card or a
screen of the app (step 3). A
spoken essay pins version 6 of the cheat-sheet series: version 5 with what
every video carries, whatever it is about (#3476, `src/bookends.ts`), the
brand's intro and outro and a music bed under the voice, which home makes
itself. `render cards-check` refuses an essay being published in an older
version, or one that turns the bed off (`"music": "off"`): only a series
opts out of one, as policy in `bookends.ts`, never an essay. Version 3
plays spoken cards, version 4 also moves each voice on at each chapter, so
the narrator of one card is not the narrator of the next (C840), and version
5 adds a chart card, `bars`. Versions 2 and 3 keep one narrator for every
card, and version 1 essays are silent, from before this routine; each still
plays as it did, and is never rewritten.
Each scene says something, in a `spoken` field:

1. **The intro**, the first scene, `{"role": "intro", "said": "…"}`. It
   says what this workflow does for you, when you'd reach for it, and what
   you'll be able to do by the end. Then it says what the essay is as of
   (the day, and which repositories it was checked against), and that later
   commits may have moved things. Give it a card to show while it is said:
   the overview card works.
2. **A scene per card**, `{"role": "scene", "chapter": "…", "narration":
"…"}`.
   - The **chapter line** orients: "Chapter two. By hand, for when you can't
     wait for the night." It says where we are in the workflow and why this
     step matters. The host says it, and it becomes a chapter in the
     video's description. A chapter may span several cards: give the line
     to its first scene only, and the rest go on in it, said by the
     narrator alone and marked once (C1027).
   - The **narration** teaches what the card shows, and more: why, the
     order of things, the mistake you're likely to make, and how you'd know
     it worked. A command is said with when to run it and what you should
     see. The narrator says it.
3. **The close**, optionally the last scene, `{"role": "close", "said":
"…"}`. It says the one command or screen to start from next time, and
   where to look when it fails. Show the card that has that command.

## An essay is an authority

You, months later, can't check what an essay says without the context it
saves you from rebuilding, so you believe it. A wrong line does harm. So
every line is written from the code at the stamp's commits, and names it:

- **Cite each scene's narration.** Give its `spoken` a `sources` list: each
  `{"repo": "<owner>/<repo>", "path": "<file>", "lines": [<first>, <last>],
"quote": "<a phrase from it>"}`, with `lines`, `quote` or both. The repository
  is one the stamp pins, and the file is read at the stamp's commit. Cite
  what the sentence rests on: the line that says the unit runs as root, not
  the whole module. An intro or a close that says what a command does cites
  it the same way.
- **Quote rather than count** where you can: a phrase of at least eight
  characters, which survives a line added above it, and `cards-stale` (below) then reports only a real change.
- **Say what applies on home.** Where the owner's own setup differs from the
  general case, say what happens on home, and cite where home's setup says
  so. For example, "then run nixos-rebuild switch" is right in general, and
  on home the dotfiles' nightly auto-upgrade applies the configuration:
  say that, citing the dotfiles.
- `cards-check` refuses a source that isn't at the stamp's commit: a file
  that isn't there, lines past its end, or a quote not in them. It notes a
  scene whose narration cites nothing, and an essay from before this rule
  keeps its notes, since an essay already served is never rewritten.
- **Finding a stale essay:** `pnpm --filter @some-ui/video-render render
cards-stale <essay file> --repo <owner/repo>=<clone> …` follows each
  source to its clone's `HEAD` (or to `--at <owner/repo>=<commit>`, one per
  repository) and lists every line whose file is gone or no longer says
  what it cited, even where the passage only moved. It exits 1 when it
  lists one, or when a source couldn't be followed. A listed line is the
  reason for a new essay on the same subject.

## Rules for every line

Since you, months later, are the listener:

- Say what a thing is before you name it: "the dotfiles repository, which
  holds this machine's whole configuration", never a bare repository name,
  issue number, ID or internal term.
- Say symbols as words, the way you'd read them aloud: "dot config",
  "backslash r", "dash dash refresh". Leave out commit hashes; the stamp on
  each card carries them. Captions show the words as said.
- Keep a chapter line to one short sentence. Keep the whole essay under
  about eight minutes (a scene's narration is usually 80 to 150 words).
  Past ten minutes `cards-check` refuses it: split the subject into two
  essays.

## Steps

1. **Start from `main`** of `paulgsc/some-ui` and of `paulgsc/testing`, and
   install some-ui: `pnpm install --frozen-lockfile`.
2. **Read the subject** at the commits the essay will be stamped with. Clone
   each repository it explains read-only, with enough history to hold that
   commit, and note each one's short commit. Keep the clones for step 7.
3. **Write the cut list** in the cheat-sheet series, version 6, as
   `packages/video-render/src/sample/videos/*/cut-list.json` are. Read both,
   cards and words, before writing.
   - **Show what we own** (#3476, SHOW1). When a chapter speaks of a screen
     of ours (the APK, the web app, Studio), show it in that chapter, as a
     `screen` (a snip, zoomed to its parts with `at`, or a clip frame), not
     a card that describes it. Almost everything we own is in the
     repositories, so a picture of it can be made: ask for the snips you
     need (`docs/snips.md`). Public pages are only for subjects off our
     surfaces. `render cards-check` refuses a chapter of the newest day's
     essays whose scene places something on our app ("on the phone", "in
     the web app", "in Studio", "the phone shows") or cites a file that
     draws one (a `.tsx` under `apps/www/src` or `packages/ui/*/src`) and
     shows no snip or clip frame (`src/shown.ts`). It reads those phrases,
     not meaning: a line that describes our app in other words is still
     yours to show, and one that uses a phrase for something else is
     rephrased.
   - A scene shows a card picture (`{"kind": "card"}`) with its card as a
     burn-in: a `terminal`, `cheat-sheet`, `legend`, `rule`, `flow` or
     `bars`, and a `spoken` field as above. A `bars` card is a chart of
     measured numbers: its values go in the card, and their source in the
     stamp, so a number on screen can be traced as a claim can. Write `durationMs` as about how long its
     words take; the take sets the real length.
   - Or it shows a screen of the app that home keeps, `{"kind": "screen"}`:
     a snip or a clip frame (`docs/snips.md`). Its `spoken` role is
     `scene`, like a card's; a spoken card (`role: "spoken"`) is drawn by
     its own stage and shows no screen.
   - Or it plays a walk through the app in motion, each step's screen and
     each tap, `{"kind": "screen", "of": {"from": "walks", "run": "<run>",
"app": "<app>", "steps": [<first>, <last>]}}`: a walk Snips Capture made
     (`docs/snips.md`, "How walks reach home"), named by its run, which home
     fetches as it fetches pages. Use one where the essay says what a person
     does in the app, rather than describing it.
   - Or it shows a public page, photographed logged out, when the subject
     lives off our surfaces (a pull request's checks, a run's log page, a
     page of docs): `{"kind": "screen", "of": {"from": "pages", …}}`. Take
     the pages by dispatching `Public Pages Capture` in paulgsc/some-ui with
     the list `record:pages` reads (`docs/snips.md`, "How public pages reach
     home"), and name each by the address, `capturedAt`, file and `run` its
     run's summary gives. Home fetches that run's bundle, which lives one
     day. Don't put the pictures in paulgsc/testing, whose guard refuses
     them. Say in the narration what the page showed as of
     when it was taken, since the page itself moves on.
   - **Badges:** ■ `main` for what is on a default branch at the stamp's
     commit, ◧ `pr` for an open pull request, □ `next` for what is planned
     and not built, △ `gap` for a known gap, ✋ `you` for a step only the
     reader does. A claim you can't check gets no card, and isn't said.
   - **Sources:** each scene's narration cites the code it describes
     (above, "An essay is an authority").
   - **Stamp:** `{"sources": ["<owner>/<repo>@<short sha>", …], "date":
"<YYYY-MM-DD>"}`, the commits you read and the day you checked them.
     Say no "now": the stamp dates what is said too.
4. **Name it** `<slug>-<date>.json`, the slug a few plain lowercase words
   joined by `-` and the date the stamp's. The same subject checked again on
   a later day is a new essay, so an old one is never rewritten.
5. **Hear it once**, rendered, to find what the frame or the speaker
   refuses. Start a speaker: home's image, run locally,
   `docker run -d -p 8880:8880 pgathondu/kokoro@<digest>` (the digest is
   `kokoro` in paulgsc/server's `deploy/home/release.json`); wait until
   `curl localhost:8880/health` answers. Then
   `pnpm --filter www build`, and
   `pnpm --filter www record:cards --cut-list-file <key>.json --voices kokoro --speaker http://127.0.0.1:8880 --out <scratchpad>`.
   It prints `recorded <file>` for each line said, then `assembling`, then
   `wrote …/cards.mp4`. Without Docker, `--voices none` still draws every
   card and holds each for its words' reading time, silent. Fix every
   refusal and render again; each line already said is kept, so a retry
   only says what changed. Keep the video in the scratchpad: home makes your
   copy.
6. **Add it to `paulgsc/testing`:** the file as `cards/<key>.json`, and its
   key in `cards/index.json`
   (`{"schema": "some-ui.cards-index/1", "essays": [{"key": …}, …]}`), in
   order of the stamps' days, newest first. Never edit or remove an essay
   already there, since home keeps each as first served.
7. **Check the folder:**
   `pnpm --filter @some-ui/video-render render cards-check <paulgsc/testing>/cards --repo <owner/repo>=<clone> …`,
   a `--repo` for each repository your essay cites, until it says ready.
   The newest essay must be spoken, and every source the newest day's
   essays name must be read at its stamp: a clone they need and isn't
   given, or one too shallow to hold the commit, refuses them. Every note about your essay is a scene to
   cite before you publish; notes about older essays stay.
8. **Open a pull request** in `paulgsc/testing`. Before pushing, run
   `python3 scripts/guard.py --staged` there until it says ready. Title it
   `data(cards): <the essay's title>`. Its body names the key, the stamp's
   sources, and every claim marked `pr`, `next` or `gap`. Merge it once
   step 5 rendered it and `cards-check` says the folder is ready: the
   repository has no CI, so those two are its gate.
9. **Say where it plays and end:** home renders it within the hour after the
   merge, and you watch it in Studio › Renders. End with a summary: the
   key, what the essay teaches, the commits it was checked against, and
   anything you left out because it couldn't be checked. Note the run in
   the Residual Ledger's `log`.

## When it fails

- **`cards-check` says ready, and the render refuses a card:** the
  render checks what `cards-check` can't. `cards-check` checks the folder
  and the cut list: its scenes, what is said, and the series. A card's own
  params (a badge's state, a row's fields, whether a line fits) are checked
  by `@some-ui/burn-ins`, which depends on this package, so `cards-check`
  can't ask it. Step 5's render is where those are checked, and an essay
  merges only once both pass.
- **`cards-check` refuses the essay:** each line names the scene and why.
  "it has no intro" means the first scene's `spoken` isn't the intro;
  "it says nothing" means a scene has no `spoken`.
- **`cards-check` refuses a source:** the line names the scene, the file
  and what it didn't find at the stamp's commit. Read the file there and
  fix the source, or the sentence if the code says otherwise. "the clone
  given doesn't hold that commit" means the clone is too shallow: fetch more
  of its history.
- **The render stops at a card:** a line doesn't fit the card, or the font
  lacks a character. Shorten the line on the card; what is said can stay.
- **The speaker answers an error:** check `curl <speaker>/health`; a line
  over 4,000 characters, or of punctuation alone, is refused before this.
- **Home lists it as failed in Studio › Renders:** the reason is there, in
  the same words as above.

## What it never does

- Upload, attach or send a video anywhere. Home renders your copy.
- Write or say a claim it didn't check against the stamp's commits, or a
  card with no stamp. A scene's narration names the code it rests on.
- Ask you to record your voice. Every line is said by home's speech model.
- Delete an essay from `cards/`. The folder keeps every essay until it grows
  enough to need the call's leave rule (C327).
