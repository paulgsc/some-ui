# Absent, plated, or heard

> What some-censor looks like on youtube.com. The doctrine it implements is
> [`quarantine-capsule.md`](./quarantine-capsule.md), results `QD11`–`QD17`;
> every rule below cites one, and a rule that cannot is decoration. Tracked as
> epic #1799.

## 1. The three states

Every video on www.youtube.com is in exactly one of three states. The state is
a pure function of evidence (the video's estimated age, its music signals) and
two choices, the boundary and the mode. No gesture changes it (`QD16`).

| The video is                                                     | On feeds and search                                                                           | On its watch page                                                                                    | Its real thumbnail                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Current, or of unprovable age (`QM0`–`QM2`), and not in the lane | **Absent**: no tile, no cover, no count (`QD11`)                                              | "Not here." and Back. No player, title, date, or video-derived tab title (`QD17`)                    | Never                                                                             |
| Old enough (`QM3`–`QM4`, boundary `B`), and not in the lane      | **Plated**: title, channel name and duration, on a plate, with a plated channel icon (`QD12`) | The plate is the poster until play. Up next is plated. No comments (`QD14`) or end-screen thumbnails | After a 3-second hold on the watch page, for that view, except in Strict (`QD13`) |
| Music, and not live, a premiere or a Short                       | **Whole**: as YouTube renders it, minus every crowd number and age (`QD14`, `QD15`)           | As YouTube renders it, minus the crowd. Autoplay stops before a held video, or skips it (`QD11`)     | Shown                                                                             |

Live streams, premieres and Shorts are always held (`QD11`): a live object is
present by definition, and a Short carries no date (`QD3`).

## 2. The terms

| Term         | Meaning                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Coupling** | How much of the present a video can carry into the owner's head. The one thing being managed (`H2`). Age and opacity are two ways of measuring it. |
| **Distance** | The first way coupling fades: the video is older than `B`.                                                                                         |
| **Opacity**  | The second way: the video is music, whose words don't reach the owner. Coupling is zero however recent it is (`QD15`, `QA5`).                      |
| **Face**     | A video's real thumbnail. Never offered on a feed; reachable only by the hold on a watch page.                                                     |
| **Lane**     | The set of videos admitted by opacity. Shown whole: the owner chose to see drama stills and show names ("seeing the drama is fine").               |

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
  autoplay card; the header mosaic of a playlist page; channel page grids,
  banner and avatar; the notifications menu; every channel icon. A playlist or
  mix card on a feed proves no single date, so it is absent (`QD3`, `QD11`).

## 4. The face (`QD13`)

- A grey, dashed control in the watch page's description: "Hold to show the
  original thumbnail". It is one of `QD17`'s two exceptions.
- Held continuously for **3 seconds** (pointer, or Space/Enter held), it
  replaces the poster plate with the real thumbnail. Releasing early cancels.
- Strict offers no control, and choosing Strict takes a shown thumbnail
  away (§7, `QD13`). Open shows it at three seconds, still held, and the
  control then reads "Hide original"; a press and release puts the plate back.
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
| "Watching now", live viewers | Watch page and cards                                            |
| Most replayed                | The heat graph over the seek bar                                |
| Badges                       | "#N on Trending", "New", the verified tick                      |
| Comments and their counts    | The whole section, under every video                            |
| Age                          | "6 years ago", "Streamed …", the upload date in the description |

## 6. The lane (`QD15`)

Admitted whole when both hold:

1. **It's music.** Any one sign is enough: the title carries `OST` or `MV` as
   a word (as YouTube titles write them: `OST`, `Ost`, `MV`; never lower case,
   which is a word elsewhere), the channel is an artist's `… - Topic` channel,
   or it carries the official-artist badge. Mechanical: no judgement about
   meaning (§8 of the doctrine).
2. **It's not live, a premiere, or a Short.** Its date must prove a past
   upload; a date the estimator cannot read could be live, so it stays held
   (`QD3`).

The owner dropped the earlier rule, a title mostly in a script they listen to
but don't read, on 2026-10-17: the feed's music is already that subset. The
lane has no switch of its own (2026-10-18); Strict reads only the channel's
two signs, and keeps autoplay from a music video in the lane (2026-10-19,
§7). The watch page's category is not on the
rendered page, so the watch page uses the same three signs (`QD15`).

## 7. Decide once (`QD16`)

The choices, besides an on/off switch and Diagnostics:

- **Show videos older than:** 6 months, 1 year (default), 2 years.
- **A mode**, one of three fixed bundles, strictest first. The owner picks a
  mode, never a row of one:

  | Row                         | Strict               | Standard (default)           | Open                        |
  | --------------------------- | -------------------- | ---------------------------- | --------------------------- |
  | Music shown whole           | From artist channels | Those, or an OST or MV title | As Standard                 |
  | Autoplay from a music video | Into music only      | Into anything shown          | Into anything shown         |
  | Original thumbnail          | Never offered        | After a 3-second hold        | At 3 seconds, can be hidden |
  | Channel post images         | Hidden               | Hidden                       | Shown                       |
  | Cards still loading         | Not painted          | Blurred                      | Blurred                     |

- **When autoplay reaches a held video:** stop (default), or skip to the next
  video in Up next that isn't held.

Modes never move the boundary. No counts, no history, no trusted channels, no
languages setting (the owner dropped it on 2026-10-17: being music alone admits
a video to the lane), no "always show thumbnails" switch, no plate picker, and
no single switch inside a mode (#1966). Changing the boundary, the mode or
autoplay is recorded quietly for Diagnostics (the doctrine's §9 falsifier
needs it) and never prompted about.

_Status: holds (#1807, #1966)._ The settings are one `storage.local`
record, read by the content script at start and on every change, so an open
tab follows without a reload. Unreadable storage yields the defaults. Off is
plain YouTube: the content script stops and lifts the pre-mask, and a content
script that never runs leaves it on. The popup holds every choice; the
settings page shows the modes as cards and then the age and autoplay; the tab
and toolbar menu holds the switch, the mode and autoplay, never the age.
Diagnostics shows every change. Until the content script has read the mode,
which the stylesheet cannot do itself, an unread card is blurred under Strict
too.

## 8. Never on youtube.com

Locks, countdowns, progress rails, reveal steps, hints ("Click to preview"),
confirmations, counts of what was held, ages, clocks ("In here it is …"),
explanatory copy beyond `QD17`'s two exceptions, reward animation, colour that
escalates with disclosure, and
the words _safe, unlock, reveal, preview, fresh, new, soon, yet, missed,
caught up, contained_.

## Provenance

Settled with the owner on 2026-10-15/16 in a Claude Code design session
(https://claude.ai/code/session_0192Sp5rhuKJg3bhwVXqvKiC). The prototype page
is https://claude.ai/artifact/1Jb2fZtg7tEsqxxFFyZjaA. Both links open only for
the owner.

**The review.** Four reviewers worked in isolation from one another:

- An **informed critic** read the doctrine, the decay rings document (deleted
  in #1808; see git history), the QC issues and the code.
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

The residual risk the owner accepted, that a plated card shows the channel's
display name as text, is recorded under `QD10`.
