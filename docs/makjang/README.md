# Makjang: a drama you study inside

This document is the user story the phone Korean lesson answers to, and the
architecture that follows from it. It is written before the code it governs. A
change to `packages/ui/topik`'s handheld surface or to `@some-ui/makjang` should
be traceable to a section here, as it already must be to the
[adaptive-learning canon](../canon/adaptive-learning-canon.typ).

It is not a claim about what the app will look like in a year. It fixes the
parts that should not have to change as models, voices and image and video
generation get cheaper, so that each improvement is an addition rather than a
rewrite.

## Scope: the mobile app only

The drama is the mobile app's experience, and only the mobile app's. The web
app and the mobile app are different experiences, not one experience
transposed to two platforms: neither is meant to mirror the other, from the UI
and UX down to the content format. So nothing here is designed so that the
desktop session can render it, the episode format is not something the desktop
must read, and a choice that is right for a thumb on a phone does not need a
desktop equivalent.

In code, "mobile" today means topik's handheld surface (`chooseSurface`: under
768px wide or 480px tall), which follows the window, not the device: a phone
browser on the Pages build gets it, and the APK on a tablet does not. Whether
the drama should key on the window or on the APK audience
(`hasAudience("apk")`) is an open question below. Until it is settled, the
drama lives in the handheld renderer and the window split stays as it is.

What being phone-only buys in the design:

- **One beat per screen,** portrait first, with the 780×390 landscape in
  `apps/www/tests/ui-fit/harness.ts` as the shape it must also survive.
- **Choices under the thumb,** as a small set of large targets (pictures where
  the item allows them), never a dense list.
- **Short sittings.** An episode fits the handheld budget of one unit,
  resumable at beat granularity (Cor. 4.4), because a phone session is picked
  up and put down.
- **Audio as a first-class channel,** since a phone is often used with sound,
  and the cast's voices are where the media layer grows first.

## The user story

The learner is a K-drama (and C-drama) fan who has gone a bit jaded: they have
watched the tropes so many times that new dramas no longer land. They cannot
make their own drama. But they can step into one that is built out of the
moments they are nostalgic for: the chaebol mother-in-law, the fiancée from a
modest family, the rival with honeyed politeness, the gift that goes wrong. And
the only way through that drama is to understand its Korean.

Two things are true at once, and neither is allowed to win:

- **The drama is real.** Lines are worth reading because they let the learner
  revisit what they love about the genre. Something happens, it has
  consequences, and the reason to come back is what happens next.
- **The pedagogy is strict.** Every point at which the drama asks the learner
  to act is a properly designed comprehension item, held to the canon's
  standard (§4: no first-order checks, authored validity, grammar
  commensurate with the level).

### What it is not

- **Not gamified engagement.** No streaks, no catalogue to complete, no "X of
  Y" as the reason to continue. If there is a game, it is the drama.
- **Not a lecture.** The lesson does not run on regardless of whether the
  learner kept up. What the learner understood or missed changes what happens
  next.

### The example that defines it

Seo-yeon is told what to buy before she meets her future mother-in-law. Later
she is at the shop, and the learner is asked what she should buy, with the
options shown as pictures. If the learner understood the advice, the scene
goes on. If not, Seo-yeon buys the wrong thing and gives it to the mother-in-law,
and the learner sees what happens: a scene, in Korean. Then the learner has to
calm things down, which takes the right apology at the right level of
politeness to an elder. The mistake does not end in a red X. It produces more
drama, more Korean to read, and a second, harder item.

### Why the current phone lesson drifted

The lesson generator already writes a makjang family romcom with a standing
cast (`packages/ui/topik/src/lib/topik/generation/lesson-prompt.md`, "The
setting"). The app around it then throws the drama away:

| What the drama has           | What the lesson format keeps                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| A cast of named characters   | `role: "user" \| "assistant"` per line; "a third character can be talked about but not heard" |
| Who is speaking              | "The lesson never shows speaker names"                                                        |
| Choices with consequences    | A fixed plan: line, its checks, misses once at the end, a wrap card (`core/lesson-track`)     |
| A reason to see what is next | "Conversation 3 of 8", "Material complete", a first-listen tally (`handheld/wrap-card`)       |
| A wrong answer as an event   | One line of `why` text under the option (`ProbeOption.why`)                                   |

The Duolingo feel and the lecture feel are both symptoms of that loss. Neither
is fixed by tuning the lesson. Both go away when the drama is the structure.

## How this relates to the canon

The canon governs **how the lesson may claim anything about learning**: which
items are admissible, what is credited, what persists. This story governs
**what the lesson is for**. They do not compete. The story supplies the reason
to come back, which the canon already counts as a term in the objective and
not a decoration (Axiom 6.1, Rem. 9.1, Rem. 6.7). The canon supplies the rigor
the story insists on.

Most of the architecture below is derivable from results the canon already
has. Some of it is not, and per the canon's amendment protocol those
amendments land with, or before, the first source change that relies on them
(not with this document, which changes no source).

**Derivable today**

- Beats as lines with the audio, Hangul, gloss ladder (Cor. 4.4).
- Choices as morphism probes of order three: situation of use, felicitous
  reply, register (Def. 4.6, Def. 4.7, Rem. 4.8).
- Scenes, branches and consequences as authored content, produced at
  authoring time and graded by lookup (Prop. 8.1, Rem. 4.7, Def. 8.3).
- Voices, art and video as renderers with capability sets, which share every
  other object (Def. 9.1, Thm. 9.1, Def. 9.3, Prop. 9.3).
- A missing model or a missing asset reduces richness and changes no type
  (Thm. 8.1, Thm. 8.2), which is the formal version of "don't block on the
  technology".

**Needs an amendment (to land with M1, below)**

1. **A consequence as a value of `p_reveal`** (Def. 4.2). After a miss, what
   is shown is the scene the chosen candidate leads to, with the authored
   `why` available after it. It is a new value of an existing dimension, which
   Theorem 4.1 says is cheap.
2. **A unit is a graph, not a sequence.** Corollary 4.4's "a check follows the
   line it is about" stands, but "a missed check comes back once after the
   last line" is replaced in a drama unit by "a missed choice leads to its
   consequence and then to a repair item". The missed item keeps its identity
   (Thm. 1.1), so selection can bring it back in a later episode (Rem. 3.5).
3. **The situational probe, and the rule that keeps it second- or
   third-order.** "What should she buy?" with pictures is, on its face, the
   first-order item Prop. 4.2 forbids: recognising one noun picks the answer.
   It is admissible only when **every option is mentioned in the scene before
   the choice**, so that recognising a noun cannot separate them and only the
   structure around it (negation, reason, reported speech, who said what) can.
   This "mention-all" condition is mechanical, and belongs in the audit.
4. **Images on options are a modality change** (Prop. 9.4). A picture of red
   ginseng glosses the noun. Under the mention-all condition that is harmless,
   because the item tests the structure and not the noun, and the amendment
   should say so rather than leave it to be discovered.
5. **Story memory outside the belief envelope.** Flags a choice sets ("gave
   the flowers") are persisted like the resume point (Cor. 4.4 (iii)): not a
   competence claim, evictable (Thm. 7.2), and losing them costs continuity
   and nothing else.

## The architecture

Four layers, each of which can improve without the others changing.

```
  authoring time                          runtime
 ┌───────────────┐   reviewed JSON    ┌──────────────────────────────┐
 │ 4. Authoring  │ ─────────────────▶ │ 1. Story (content)           │
 │  generator,   │   + media assets   │  cast, episodes, scenes,     │
 │  audits,      │                    │  beats, choices, flags       │
 │  asset jobs   │                    └──────────────┬───────────────┘
 └───────────────┘                                   │
                                     ┌───────────────▼───────────────┐
                                     │ 2. Engine (pure, lib/)        │
                                     │  state union + step(),        │
                                     │  knows no media, no Korean    │
                                     └───────┬───────────────┬───────┘
                                  checks     │               │ effects
                         ┌───────────────────▼──┐   ┌────────▼──────────────┐
                         │ Teaching (topik)     │   │ 3. Media (ports)      │
                         │  probes, hint ladder,│   │  voice, art, motion;  │
                         │  tiles, reports      │   │  capability sets,     │
                         └──────────────────────┘   │  fallbacks            │
                                                    └───────────────────────┘
```

### 1. Story: the content model

The drama is data, authored ahead of time (Prop. 8.1). It has stable
identities throughout, because everything persisted is keyed by identity, never
by position (Thm. 1.1).

- **Cast.** A character has an id, a name in Korean and English, how they
  stand to the protagonist, and how they speak: which register they use to
  whom, and which they receive. It also carries medium-free descriptions of
  voice (age, temperament) and look, which the media layer turns into
  renditions when it can. The cast is shared across a series, which is what
  keeps forms of address consistent from week to week.
- **Series, episode, scene, beat.** A series is a cast and a premise. An
  episode is one sitting: the unit the session budget (Def. 4.4), the resume
  point and the evaluation report (Cor. 3.4) attach to. A scene is a place and
  a set of characters. A beat is the smallest step.
- **Beat kinds.**
  - _Line:_ a speaker (a cast id, not `user`/`assistant`), the Korean, its
    gloss, and an optional stage direction (how it is said).
  - _Narration:_ the setting or an action, short, so the learner knows where
    they are.
  - _Choice:_ the drama's question, asked inside the story ("She is at the
    shop. What does she buy?"). Each option has a label, an optional art key
    (`gift.red-ginseng`), whether the story treats it as the right one, and the
    beat it leads to. A right option continues. A wrong one leads to its
    consequence.
  - _Join:_ where branches rejoin.
- **Consequence and repair.** A wrong option's target is a short branch: the
  consequence (the scene that follows from it), then a repair choice (calm it
  down), which is itself an item, usually harder and usually third-order. Every
  branch either rejoins the spine or ends the scene. Repair is bounded: it does
  not loop until the learner gets it right.
- **Flags.** A choice may set a named flag, and a later beat may have a
  variant for a flag ("the mother-in-law remembers the flowers"). Flags are a
  finite, authored set per series. In the first version they are scoped to an
  episode. Series-wide memory is the same mechanism with a longer scope.

A legacy topik conversation is a degenerate episode: two unnamed speakers, a
straight line of beats, its probes as choices whose every option continues. So
content already served to the handheld surface keeps playing there during the
migration. The adapter runs one way only: the desktop session keeps its own
conversation format and never reads an episode.

### 2. Engine: what happens next

One state union and a pure `step(state, event) → { state, effects }` in
`lib/`, tested in `node`, as `docs/monorepo-boundaries.md` ("the component is
not the coordinator") requires and as topik's `core/` already models.

- **State:** the current beat, the line's reveal level, the flags, and the
  outcome of each choice keyed by its id.
- **Events:** reveal, advance, choose an option, replay a line, resume.
- **Effects:** "voice this line as this character", "show this scene's
  backdrop", "persist the resume point". The engine names _what_ should be
  presented, never _how_.

Three rules keep it sound:

- **The engine knows no media.** It does not import speech, art or video, and
  it never branches on whether a voice or picture exists. The media layer
  reads effects and renders what it can.
- **The engine knows no Korean.** Whether a choice is a good item is the
  teaching layer's concern. To the engine, a choice is options and targets,
  and a check payload it carries without reading.
- **The route never changes the record.** A choice's outcome is the first try,
  recorded by id, whatever route the drama then takes. The consequence is
  presentation (`p_reveal`), not evidence, and a learner who reached a scene by
  a repair branch is not recorded differently for the items there.

### 3. Media: renditions over ports

Each way of presenting a beat is a port with a capability set (Def. 9.3), and
every port has a fallback all the way down to text. Renditions are assets made
at authoring time and keyed by the story's ids (character, art key, beat),
never generated by a model while a learner waits (Thm. 8.1).

| Port   | Today                                                  | Later                                              | Falls back to   |
| ------ | ------------------------------------------------------ | -------------------------------------------------- | --------------- |
| Voice  | Device TTS, one voice per language (`@some-ui/speech`) | A voice per character, from the cast               | Text only       |
| Art    | Hand-made SVG icons for choice options                 | Generated icons, portraits, backdrops in one style | Text labels     |
| Motion | None                                                   | A character speaking a beat, as video              | Portrait, voice |
| Script | One generated episode at a time                        | A coherent series from a series-level prompt       | (authoring)     |

`@some-ui/speech` already separates the voice from the line (`TTSOptions.voice`
is used for previews only today), so a per-character voice is a mapping from a
cast id to a voice choice at the port, not a change to the engine.

**Media is not pedagogically neutral.** A picture glosses a noun. A frown on a
video face is a hint on a register item. Each new rendition kind changes the
valuation the renderer delivers (Prop. 9.4), so it lands with a line in the
canon saying what it reveals and why that is acceptable, as amendment 4 does
for option art. That is the one place where "add it when the technology is
ready" needs a review step and not just an asset.

### 4. Authoring: how episodes get made

The pipeline the canon already declares, extended rather than replaced:
source idea, then a model, then JSON, then a deterministic audit, then review,
then served content (Rem. 8.1, Cor. 8.3), with the learner's own model as an
option (Def. 8.3).

- **The generator prompt** grows from "conversations plus probes" to "an
  episode as a beat graph", keeping every probe rule it has now.
- **Two audits, by owner.** The story audit checks structure: every beat is
  reachable, every route ends, every wrong option has a consequence and a
  repair, every speaker is in the cast, every flag that is read is set
  somewhere. The teaching audit checks the items: the existing probe audit,
  plus the mention-all condition for situational choices.
- **Asset jobs** are a separate authoring step (cast voices, option icons,
  later portraits and video), so an episode can ship with no assets at all and
  gain them later without its story changing.

## Where it lives

- **`@some-ui/makjang`** (new, framework-agnostic: no React): the story schema,
  the story audit, the engine, and the media port types. It imports nothing
  from topik. The package boundary is the point: it makes "the drama knows no
  Korean pedagogy" a dependency rule the toolchain enforces, where a folder
  inside topik would make it a convention.
- **`@some-ui/topik`** keeps the teaching: probes, the hint ladder, tiles, the
  probe and mention-all audits, the evaluation report, and the handheld
  renderer, which becomes a renderer of the engine. Topik depends on makjang,
  never the reverse. Only the handheld renderer imports makjang. The desktop
  session (`DesktopSession`, the session machine) does not, and is not changed
  by any increment here.

This is the second `makjang` workspace. The first (removed in #1645) held
stream-overlay widgets and some SVG scenery, not a drama, and was removed as a
vestige because nothing live depended on it. This one is reached from its first
change, through topik's phone lesson. It does fail the hoisting doctrine's
fan-out test (one consumer, `docs/monorepo-boundaries.md`), and that is
accepted on purpose: the boundary exists to fix the direction of a dependency,
not to share code.

## Increments

Each one ships, and none needs a better model than exists today.

- **M1: the drama as data.** The canon amendments above. `@some-ui/makjang`
  with the story schema, the story audit and the engine, tested in `node`. The
  legacy-conversation adapter. One hand-written pilot episode: the gift for the
  mother-in-law, with its consequence and repair. No UI change yet.
- **M2: the phone lesson runs on the engine.** Speaker names, choices with
  hand-made SVG option art, consequence and repair scenes, a distinct device
  voice (or pitch) per character where the device allows it. `core/lesson-track`
  and its tests are removed once nothing uses them. The wrap card loses
  "Conversation N of M" and the tally as its headline, and ends an episode on
  what happens next instead.
- **M3: generated episodes.** The generator prompt writes beat graphs. The two
  audits gate them. The weekly batch (Cor. 8.3) serves episodes.
- **Later, one capability at a time:** series-wide flags, per-character cloud
  voices, generated art in a fixed style, portraits, video beats, whole-series
  scripts. Each adds assets and a renderer capability, plus its canon line, and
  changes neither the story schema nor the engine.

## Invariants to declare with M1

These are design commitments, not yet invariants: there is no code for them to
be true of. They should be declared in the house shape (`CLAUDE.md`, "Gray-area
invariants") in the change that adds the code, and enforced where they can be.

- **The engine imports no media and no topik.** Mechanical: an import
  restriction on `@some-ui/makjang`'s `lib/`.
- **Every route through an episode ends, and every wrong option has a
  consequence.** Mechanical: the story audit, run on every served episode.
- **Every situational option is mentioned before its choice.** Mechanical: the
  teaching audit.
- **A choice's outcome does not depend on the route taken afterwards.**
  Mechanical: an engine test over every route of the pilot episode.
- **A new rendition kind lands with its valuation.** Not mechanical: whether a
  picture or a face reveals the answer needs a person. Falsified by a change
  that adds a rendition kind to a renderer's capability set with no canon line
  saying what it reveals.

## Open questions

- **Series or vignettes.** One continuing drama with the standing cast, or
  standalone trope scenes (the airport goodbye, the envelope of money)? The
  model supports both. The first content and the generator prompt need one
  answer.
- **How long memory lasts.** Do flags stay within an episode, or does the
  mother-in-law remember next week? The mechanism is the same. The authoring
  burden and the audit are not.
- **Where the missed item comes back.** In the same episode after the repair,
  or in a later one through selection (Rem. 3.5)? The canon's repeat-on-error
  is the default until this is decided.
- **Window or APK.** Should the drama follow topik's window-size split (so a
  phone browser on the Pages build plays it too, and the APK on a tablet does
  not), or the APK audience (`hasAudience("apk")`, so only the installed app
  plays it, at any size)? Either works with this architecture: it decides
  which renderer mounts, not what the engine or the content looks like.
