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
  refuses an essay with no intro, a scene with no chapter line or
  narration, a line the speech model can't say (empty, punctuation alone,
  or over 4,000 characters), and an essay whose words run past ten minutes.
  It also refuses a malformed cut list, a card with no stamp, a series
  version home doesn't hold, and anything that version lacks. Drawing
  refuses a line that doesn't fit a card or a character the font lacks.
- **Home** reads `paulgsc/testing`'s `cards/` folder hourly and keeps each
  new essay as first served. Its render worker has Kokoro, the speech model
  home runs, say each line with each word's timing, holds each card for as
  long as its words take, writes the words as captions at the foot of the
  frame, and renders the video. The same essay on the same image gives the
  same video.

## The shape of a spoken essay

The essay is a cut list: one JSON file, a list of scenes, each a card. A
spoken essay pins version 2 of the cheat-sheet series (version 1 essays are
silent, from before this routine; they still play, and are never rewritten).
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
     video's description.
   - The **narration** teaches what the card shows, and more: why, the
     order of things, the mistake you're likely to make, and how you'd know
     it worked. A command is said with when to run it and what you should
     see. The narrator says it.
3. **The close**, optionally the last scene, `{"role": "close", "said":
"…"}`. It says the one command or screen to start from next time, and
   where to look when it fails. Show the card that has that command.

Rules for every line, since you, months later, are the listener:

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
   each repository it explains read-only, and note each one's short commit.
3. **Write the cut list** in the cheat-sheet series, version 2, as
   `packages/video-render/src/sample/videos/*/cut-list.json` are. Read both,
   cards and words, before writing.
   - Every scene is a card picture (`{"kind": "card"}`) with its card as a
     burn-in: a `terminal`, `cheat-sheet`, `legend`, `rule` or `flow`, and
     a `spoken` field as above. Write `durationMs` as about how long its
     words take; the take sets the real length.
   - **Badges:** ■ `main` for what is on a default branch at the stamp's
     commit, ◧ `pr` for an open pull request, □ `next` for what is planned
     and not built, △ `gap` for a known gap, ✋ `you` for a step only the
     reader does. A claim you can't check gets no card, and isn't said.
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
   `pnpm --filter @some-ui/video-render render cards-check <paulgsc/testing>/cards`
   until it says ready. The newest essay must be spoken.
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

- **`cards-check` refuses the essay:** each line names the scene and why.
  "it has no intro" means the first scene's `spoken` isn't the intro;
  "it says nothing" means a scene has no `spoken`.
- **The render stops at a card:** a line doesn't fit the card, or the font
  lacks a character. Shorten the line on the card; what is said can stay.
- **The speaker answers an error:** check `curl <speaker>/health`; a line
  over 4,000 characters, or of punctuation alone, is refused before this.
- **Home lists it as failed in Studio › Renders:** the reason is there, in
  the same words as above.

## What it never does

- Upload, attach or send a video anywhere. Home renders your copy.
- Write or say a claim it didn't check against the stamp's commits, or a
  card with no stamp.
- Ask you to record your voice. Every line is said by home's speech model.
- Delete an essay from `cards/`. The folder keeps every essay until it grows
  enough to need the call's leave rule (C327).
