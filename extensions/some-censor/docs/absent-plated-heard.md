# Absent, plated, or heard

> What some-censor looks like on youtube.com. The doctrine it implements is
> [`quarantine-capsule.md`](./quarantine-capsule.md), results `QD11`–`QD17`;
> every rule below cites one, and a rule that cannot is decoration. Tracked as
> epic #1799. This document replaced the decay rings document, whose
> medallion grammar the owner rejected (see [Provenance](#provenance)).

## 1. The three states

Every video on www.youtube.com is in exactly one of three states. The state is
a pure function of evidence (the video's estimated age, its title's script, its
music signals) and two settings. No gesture changes it (`QD16`).

| The video is                                                           | On feeds and search                                                                           | On its watch page                                                                            | Its real thumbnail                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Current, or of unprovable age (`QM0`–`QM2`), and not in the lane       | **Absent**: no tile, no cover, no count (`QD11`)                                              | "Not here." and Back. No player, title, date, or video-derived tab title                     | Never                                                           |
| Old enough (`QM3`–`QM4`, boundary `B`)                                 | **Plated**: title, channel name and duration, on a plate, with a plated channel icon (`QD12`) | The plate is the poster until play. Up next is plated. No comments, no end-screen thumbnails | After a 3-second hold on the watch page, for that view (`QD13`) |
| Music whose title is in a script the owner listens to but doesn't read | **Whole**: as YouTube renders it, minus every crowd number and age (`QD14`, `QD15`)           | As YouTube renders it, minus the crowd. Autoplay continues only inside the lane              | Shown                                                           |

Live streams, premieres and Shorts are never plated and never in the lane: a
live object is present by definition, and a Short carries no date (`QD3`).

## 2. The terms

| Term            | Meaning                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Coupling**    | How much of the present a video can carry into the owner's head. The one thing being managed (`H2`). Age and opacity are two ways of measuring it.                         |
| **Distance**    | The first way coupling fades: the video is older than `B`.                                                                                                                 |
| **Opacity**     | The second way: the video is music, and its words are in a script the owner has said they listen to but don't read. Coupling is zero however recent it is (`QD15`, `QA5`). |
| **Absent**      | What a held video is. Not covered, not counted, not mentioned. The subtree leaves layout and the accessibility tree.                                                       |
| **Plate**       | The neutral template in a thumbnail's place. Built only from the video id and the duration. It is the card's finished state, not a cover waiting to be lifted.             |
| **Face**        | A video's real thumbnail. Never offered on a feed; reachable only by the hold on a watch page.                                                                             |
| **Lane**        | The set of videos admitted by opacity. Shown whole: the owner chose to see drama stills and show names ("seeing the drama is fine").                                       |
| **Crowd**       | Any number that measures other people, and any age. Never shown, in any state.                                                                                             |
| **Decide once** | The owner's judgement is exercised on two settings and nowhere else.                                                                                                       |
| **Quiet**       | The extension adds no copy, clock or count to youtube.com. The one exception is "Not here." and its Back button.                                                           |

## 3. The plate (`QD12`)

- **Fill.** A muted tone hashed from the video id: FNV-1a over the id's UTF-16
  code units, hue `h mod 360`, saturation 10–17%, lightness 17–22%, with a faint
  diagonal sheen. Stable per video, different from its neighbours, meaningless.
- **Inputs.** The video id and the duration. Nothing is ever read from the
  image.
- **Placement.** Over the thumbnail element only. The title, channel name and
  duration below it stay readable, and one click opens the watch page as on
  plain YouTube.
- **Channel icons.** A disc in a tone hashed from the channel id, carrying the
  first letter or digit of the channel name with punctuation removed
  (`《Lost Summer》` → `L`). It replaces the avatar image everywhere.
- **Surfaces.** Feed and search cards; hover previews (suppressed outright: a
  preview is a moving thumbnail); up next and the sidebar; end screens and the
  autoplay card; playlist and mix mosaics; channel page grids, banner and
  avatar; the notifications menu; every channel icon.

## 4. The face (`QD13`)

- A grey, dashed control in the watch page's description: "Hold to show the
  original thumbnail".
- Held continuously for **3 seconds** (pointer, or Space/Enter held), it
  replaces the poster plate with the real thumbnail. Releasing early cancels.
- It lasts for that view. Navigation forgets it, and nothing is persisted.
- No progress colour, reward animation or memory of having done it. Anything
  more and it becomes the ladder again.

## 5. The crowd (`QD14`)

Removed on every surface, the lane included:

| Number                       | Where                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| View counts                  | Card metadata rows, search results, the watch page's info row   |
| Like counts                  | Beside the like button (the button stays)                       |
| Subscriber counts            | Under the channel name; channel pages                           |
| Comment counts               | With the comments section, which the watch page drops anyway    |
| "Watching now", live viewers | Watch page and cards                                            |
| Most replayed                | The heat graph over the seek bar                                |
| Badges                       | "#N on Trending", "New", the verified tick                      |
| Age                          | "6 years ago", "Streamed …", the upload date in the description |

## 6. The lane (`QD15`)

Admitted whole only when all three hold:

1. **It's music.** On the watch page, YouTube's category is Music. On a card,
   a `… - Topic` channel or an official-artist badge. Over-holding is the safe
   direction (`QD3`).
2. **Its title is mostly in a script the owner marked.** Counted by Unicode
   script over the title's code points, ignoring Latin, digits and punctuation.
   Mechanical: no judgement about meaning (§8 of the doctrine).
3. **It's not live, a premiere, or a Short.**

The rule describes the owner as they are. It does not anticipate them learning
to read these scripts ("let's not optimize against some future me").

## 7. Decide once (`QD16`)

The popup holds the only choices:

- **Show videos older than:** 6 months, 1 year (default), 2 years.
- **Languages I listen to but don't read:** 한국어, 中文, 日本語.
- An on/off switch, and Diagnostics.

No counts, no history, no trusted channels, no "always show thumbnails"
switch, no plate picker. Changing the boundary is recorded quietly in
Diagnostics (the doctrine's §9 falsifier needs it) and never prompted about.

## 8. Never on youtube.com

Locks, countdowns, progress rails, reveal steps, hints ("Click to preview"),
confirmations, counts of what was held, ages, clocks ("In here it is …"),
explanatory copy, reward animation, colour that escalates with disclosure, and
the words _safe, unlock, reveal, preview, fresh, new, soon, yet, missed,
caught up, contained_.

## Provenance

Settled with the owner on 2026-10-15/16 in a Claude Code design session
(https://claude.ai/code/session_0192Sp5rhuKJg3bhwVXqvKiC). The prototype page,
private to the owner, is https://claude.ai/artifact/1Jb2fZtg7tEsqxxFFyZjaA.

**The review.** Four reviewers worked in isolation from one another:

- An **informed critic** read the doctrine, the decay rings document, the QC
  issues and the code.
- A **story-only designer** read only the doctrine.
- A **code-only reviewer** read only `src/`. It built the extension and
  screenshotted every state in Chromium.
- An **owner lens** read only the owner's other products.

They converged on one diagnosis: the decay rings work gave the _outside_ a full
grammar (how hot, how contained, how far), while the story kept describing an
_inside_ that had received only prohibitions. The code-only reviewer found the
shipped ladder reward-shaped: escalating accent colours, a filling rail, and
the product's most crafted animation at the moment of greatest exposure.

**The rounds.** Each round's owner answer, and what it removed:

| Round | Owner's answer                                                                       | Rejected                                                                                    |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1     | "After a bad session, it was that I saw things."                                     | Sealed tiles, aggregates ("32 contained"), rings by default, a visit with a budget and wrap |
| 1     | "In here it is 2025" "feels like something being solved … it doesn't feel authentic" | The horizon line, a lagged clock, "From 2019" stamps                                        |
| 1     | Card-by-card deciding is "a chore … not rewarding"                                   | The reveal ladder, Open/Keep/Pass                                                           |
| 1     | Music in Korean/Chinese is consumed "as an artifact"                                 | (adds the lane)                                                                             |
| 2     | Future language learning is a non sequitur; only youtube.com; the drama is fine      | A separate reading room, music.youtube.com, the lane's title filter and sound mark          |
| 2     | "Unless I choose to, I should never see the actual thumbnail"                        | Real thumbnails on admitted cards                                                           |
| 3     | Tone plate, 3-second hold                                                            | Title-card and blank plates                                                                 |
| 3     | Views, likes and metrics "add no value to my rock"; "plate the icon"                 | Every crowd number and age; channel photos                                                  |

**Residual accepted by the owner.** A plated card shows the channel's display
name as text. `H1` names a channel's current branding as a carrier, and `QD10`
held source identity for that reason. The visual branding (the avatar) is
plated; the name is shown.
