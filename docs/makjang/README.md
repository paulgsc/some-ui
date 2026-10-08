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
desktop session can render it, the scene-tree format is not something the desktop
must read, and a choice that is right for a thumb on a phone does not need a
desktop equivalent.

In code, "mobile" today means topik's handheld surface (`chooseSurface`: under
768px wide or 480px tall), which follows the window, not the device: a phone
browser on the Pages build gets it, and the APK on a tablet does not. The
drama keys on that split, not on the APK audience (`hasAudience("apk")`),
decided 2026-10-08 for three reasons. There is then one phone lesson: the
handheld renderer becomes the drama wherever it mounts, and the lesson it
replaces is deleted rather than kept alive for phone browsers. Tests reach
it: no vitest or Playwright suite renders the `mobile` build profile, so an
APK-only branch would be rendered by none. And the drama's design (one beat
per screen, choices under the thumb) is about the shape of the screen, which
is what the split measures. Moving it to the APK alone later changes which
renderer mounts, not the engine or the content.

What being phone-only buys in the design:

- **One beat per screen,** portrait first, with the 780×390 landscape in
  `apps/www/tests/ui-fit/harness.ts` as the shape it must also survive.
- **Choices under the thumb,** as a small set of large targets (pictures where
  the item allows them), never a dense list.
- **Short sittings.** A lesson fits the handheld budget of one unit,
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

### The test the app fails today

Time spent in the app is time spent consuming a drama. In the first iteration
that drama is text and speech, and later it can be voices, art and video, but
at every stage it is a drama: a learner who puts the phone down should be able
to say what happened in the scene, not which exercise they just did. The
teaching happens inside that, at the moments the story asks something of
them.

The phone lesson fails this today. Its screens are exercises with a
conversation attached: unnamed lines, checks between them, a tally at the end.
Every design decision below is measured against this test first.

### What we claim, and what we do not

We never claim a learner has learned anything. The claim is weaker, and it is
the one the product rests on: someone who keeps coming back to a drama they
can only follow in Korean becomes more literate in Korean as a result. It is
not a guarantee for any one lesson. It is what emerges from continued, honest
time with the language. The learner is here to enjoy a drama, and literacy is
what they come away with.

The canon says the same thing, and says why the stronger claim is not
available:

- No single unit's outcomes can show that it taught anything (Thm. 3.1), so
  the system claims only that persistence is how learning happens, and what a
  unit owes the learner is a reason to come back (Rem. 3.3).
- Coming back is part of the objective itself, not a product concern beside
  it (Axiom 6.1, Rem. 6.1).
- For the read-aloud exercise the canon already states this as an assumption,
  not a result: honest repetition teaches, with a gain that shrinks as words
  near mastery (Axiom 6.2).

It is also stricter than "engaging content teaches", in two ways that are
design rules here:

- **The gain is conditional on honest practice** (Axiom 6.2). For a drama,
  honest practice is following it in Korean. A learner who reads the English
  gloss of every line is enjoying a drama in English, and nothing emerges. So
  the drama stays in Hangul as far as the level allows: the gloss is a rung
  the learner reaches for on a line, never the default; narration, choice
  prompts and consequences are in Korean wherever the level can carry them;
  and English is the fallback, not the channel.
- **Engagement may not be bought with the gain** (Rem. 6.7). A change that
  makes the drama more pleasant by making it less Korean (glosses up front,
  English narration for flow) is not preferred on engagement alone, and has to
  be argued the way any change to the teaching is.

### What it is not

- **Not gamified engagement.** No streaks, no catalogue to complete, no "X of
  Y" as the reason to continue. If there is a game, it is the drama.
- **Not a lecture.** The lesson does not run on regardless of whether the
  learner kept up. What the learner understood or missed changes what happens
  next.

### An illustration

Seo-yeon is told what to buy before she meets her future mother-in-law. Later
she is at the shop, and the learner is asked what she should buy, with the
options shown as pictures. If the learner understood the advice, the scene
goes on. If not, Seo-yeon buys the wrong thing and gives it to the mother-in-law,
and the learner sees what happens: a scene, in Korean. Then the learner has to
calm things down, which takes the right apology at the right level of
politeness to an elder. The mistake does not end in a red X. It produces more
drama, more Korean to read, and a second, harder item.

This illustrates the shape (a choice inside the story, a consequence instead
of a correction, a repair), not an item to build. "What should she buy?" is
itself the kind of question the canon rules out (a learner who recognises one
noun answers it, Prop. 4.2), and so it would not be asked. Questions that do
pass the rules, and keep the same shape, are plentiful: which reply would
offend her, what Seo-yeon is really saying, what she should say back.

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
- Choices as morphism probes of order two or three (Def. 4.6, Def. 4.7,
  Rem. 4.8, Cor. 4.5). A choice is a probe and nothing new: a question that
  would break an existing rule (first-order, Prop. 4.2, among them) is simply
  not asked, and the existing audit drops it (Rem. 4.7, Thm. 8.2).
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
2. **A unit is a bounded tree, not a sequence.** Corollary 4.4's "a check
   follows the line it is about" stands, but "a missed check comes back once
   after the last line" is replaced in a drama unit by "a missed choice leads
   to its consequence scene, whose own choice is the repair item". What comes
   back after a miss is authored into that subtree, bounded by the tree's
   depth. A node the learner's route never visits was never presented, so it
   is not an outcome of any kind, and in particular not a miss.
3. **The resume point is a route.** Within a lesson, the route (the options
   chosen from the root) and a beat index replace Corollary 4.4 (iii)'s
   conversation index and message id. It is keyed by option ids, resolved by
   identity, and discarded to the root when it no longer resolves (Thm. 1.1).
   Nothing else is persisted, and nothing crosses lessons (see "One lesson
   stands alone").
4. **Honest exposure teaches, for the drama.** Axiom 6.2 is stated for the
   read-aloud rep. The drama needs the same assumption, stated for following
   a scene in Korean, with honest practice defined as reaching the gloss only
   when a line will not come otherwise. Like Axiom 6.2 it is an assumption,
   falsifiable and not observed, and it is what makes "literacy emerges" a
   claim the canon holds rather than a slogan.

## The architecture

Four layers, each of which can improve without the others changing.

```
  authoring time                          runtime
 ┌───────────────┐   reviewed JSON    ┌──────────────────────────────┐
 │ 4. Authoring  │ ─────────────────▶ │ 1. Story (content)           │
 │  generator,   │   + media assets   │  one lesson = one scene tree │
 │  audits,      │                    │  (≤4 options, ≤ max depth)   │
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

**A lesson is a scene, and a scene nests scenes.** A choice splits a scene into
child scenes, one per option, and each child is a scene in its own right that
may split again. The shape borrows from a quadtree: at most four children per
split, and a maximum depth past which a scene may not split and must resolve.

```
Lesson = { id, level, cast: Character[], root: Scene }
Scene  = { id, setting, beats: (Line | Narration)[], choice? }
Choice = { id, prompt, options: Option[1..4] }      // absent at max depth
Option = { id, label, art?, right: boolean, check?, child: Scene }
```

- **Depth** is the number of choices between the root and a scene. A scene at
  `MAX_DEPTH` has no choice: it is a leaf, and the story resolves there. A
  scene above it may also be a leaf. Depth is what bounds the repair: there is
  no loop to retry in, only a subtree that ends.
- **Fan-out** is at most `MAX_BRANCHES = 4`, which is also about what a phone
  screen shows as large thumb targets.
- **The right option's child continues the story. A wrong option's child is
  its consequence:** the mother-in-law receiving the wrong gift, in Korean. Its
  own choice, if it has one, is the repair (calm her down), usually harder and
  usually third-order, since politeness toward an elder is what it tests.
- **The route is the memory.** Because the shape is a tree, every scene knows
  exactly what led to it: its ancestors. A consequence scene does not need a
  flag saying "she bought the flowers", because it only exists on the route
  where she did. No flags and no joins are needed while branches never
  converge. Converging branches (and the flags they would need to remember what
  differs) belong to the longitudinal stage, not the MVP.
- **The size is bounded by both constants.** `MAX_DEPTH = 2` (decided
  2026-10-08). A full tree has `(4^(D+1) − 1) / 3` scenes, so at most 21. The
  learner sees one route: three scenes and two choices. The generator writes
  every scene in one reply, so the depth is a cost decision as much as a story
  one, and the two constants together bound it; no separate cap is needed.
  Both are constants in `@some-ui/makjang`.
- **Cast, inline.** A lesson declares its own characters: an id, a name in
  Korean and English, how they stand to the protagonist, which register they
  use to whom and receive, and medium-free descriptions of voice (age,
  temperament) and look, which the media layer turns into renditions when it
  can. Lines name a speaker by cast id, never `user`/`assistant`.
- **Beats.** A _line_ has a speaker, the Korean, its gloss and an optional
  stage direction (how it is said). A _narration_ is a short setting or action
  so the learner knows where they are. The choice is the drama's question,
  asked inside the story. An option may carry a short art description, which
  the media layer renders when it can and otherwise ignores.

**The code knows the shape, never a scene.** Every scene, character, line and
choice comes from generation. Nothing in `@some-ui/makjang` or topik names a
particular scene, trope, character or item, and no catalogue of cases (scene
types, gift kinds, icon sets) is enumerated anywhere. The schema, the bounds,
the audits and the engine are generic over whatever a generated tree
contains. The scenes in this document are illustrations of the shape.

#### Who defines the drama

Eventually, the learner does. They choose the genre, the kind of family
drama, and the ensemble they want, and they and their own language model
generate scenes from that, conforming to the schema. The canon already has
the mechanism: learner-side authoring (Def. 8.3), the clipboard loop the
handheld lesson ships today, where the application supplies the grammar and
checks what comes back. What we provide is the generic shape. Any particular
ensemble or genre is one instance of it.

That is not the first iteration, where the operator's prompt and its makjang
setting are the default. But the first iteration must not close it off, which
constrains it now:

- **The cast is a list of any size,** and how characters stand to each other
  is described text, not a fixed set of roles. There is no `motherInLaw` or
  `rival` field. The one structural fact is which character the learner
  follows (`pov`, a cast id).
- **Register is per pair of characters,** read from the cast, not implied by a
  role.
- **The setting is a parameter of the prompt,** a default a learner could
  replace, not text the app depends on. The makjang family romcom is the
  default genre, not an assumption.
- **No audit checks anything genre-specific.** The story audit checks shape,
  the teaching audit checks items, and neither knows what the drama is about.

#### One lesson stands alone

In the MVP every lesson is self-contained, the way a lesson generated from one
session prompt is today. It does not know about any other lesson, any other
scene tree, or any recurring cast, and the generator is given no story from
earlier lessons: the prompt, the level and an optional scene idea are enough.
The digest of recent evaluation reports the prompt already carries (Cor. 8.2)
stays, since it is about how lessons fit, not what happened in them. The app
keeps nothing between lessons beyond what the handheld surface already keeps
(the reports and the shelf). The standing cast in today's generator prompt can
stay as a default to draw from, as long as no lesson relies on another.

Longitudinal structure (a standing ensemble, a series, the mother-in-law
remembering last week) is a later goal, and the model leaves room for it: a
cast moves from inline to a shared reference, and a lesson becomes one node of a
larger tree. Nothing in the MVP waits for it.

A legacy topik conversation is a degenerate tree: two unnamed speakers, one
root scene with no choice, its probes kept as the line-anchored checks they are
today. So
content already served to the handheld surface keeps playing there during the
migration. The adapter runs one way only: the desktop session keeps its own
conversation format and never reads a scene tree.

### 2. Engine: what happens next

One state union and a pure `step(state, event) → { state, effects }` in
`lib/`, tested in `node`, as `docs/monorepo-boundaries.md` ("the component is
not the coordinator") requires and as topik's `core/` already models.

- **State:** the route (the option ids chosen from the root, which locates
  the current scene), the current beat by id, and the option first chosen at
  each choice reached, keyed by the choice's id. How much of a line is showing
  (the audio, Hangul, gloss ladder) is teaching, so topik's renderer keeps it
  beside the engine's state rather than inside it.
- **Events:** advance, go back a beat, choose an option, restart, resume.
- **Recursion is in the content, not the engine.** Entering a child scene is
  pushing an option id onto the route. The engine is the same at every depth
  and never needs to know how deep the tree is.
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
  a repair branch is not recorded differently for the items there. Choices on
  routes not taken are not recorded at all.

### 3. Media: renditions over ports

Each way of presenting a beat is a port with a capability set (Def. 9.3), and
every port has a fallback all the way down to text. Renditions are assets made
at authoring time from what the content describes (a character's voice and
look, an option's art description) and keyed by the story's ids,
never generated by a model while a learner waits (Thm. 8.1).

| Port   | Today                                                  | Later                                              | Falls back to   |
| ------ | ------------------------------------------------------ | -------------------------------------------------- | --------------- |
| Voice  | Device TTS, one voice per language (`@some-ui/speech`) | A voice per character, from the cast               | Text only       |
| Art    | None: options are text                                 | Generated icons, portraits, backdrops in one style | Text labels     |
| Motion | None                                                   | A character speaking a beat, as video              | Portrait, voice |
| Script | One self-contained scene tree per lesson               | A coherent series with a standing cast             | (authoring)     |

`@some-ui/speech` already separates the voice from the line (`TTSOptions.voice`
is used for previews only today), so a per-character voice is a mapping from a
cast id to a voice choice at the port, not a change to the engine.

**Media is not pedagogically neutral.** A picture glosses a noun. A frown on a
video face is a hint on a register item. Each new rendition kind changes the
valuation the renderer delivers (Prop. 9.4), so it lands with a line in the
canon saying what it reveals and why that is acceptable, option art included
when M2 adds it. That is the one place where "add it when the technology is
ready" needs a review step and not just an asset.

### 4. Authoring: how lessons get made

The pipeline the canon already declares, extended rather than replaced:
source idea, then a model, then JSON, then a deterministic audit, then review,
then served content (Rem. 8.1, Cor. 8.3), with the learner's own model as an
option (Def. 8.3).

- **The generator prompt** grows from "conversations plus probes" to "one
  scene tree", keeping every probe rule it has now. It stays a standalone
  prompt: no other lesson goes into it.
- **Two audits, by owner.** The story audit checks structure: fan-out at most
  four, no choice at or past the maximum depth, ids unique across the tree, every speaker in the cast, and exactly
  one right option per choice. The teaching audit is the existing probe
  audit. A choice it rejects is not asked: its scene becomes a leaf and the
  subtree under it is dropped, the tree's version of Remark 4.7's "dropped at
  load".
- **Asset jobs** are a separate authoring step (cast voices, option icons,
  later portraits and video), so a lesson can ship with no assets at all and
  gain them later without its story changing.

## Where it lives

- **`@some-ui/makjang`** (new, framework-agnostic: no React): the story schema,
  the story audit and the engine, and from M2 the media port types. It imports nothing
  from topik. The package boundary is the point: it makes "the drama knows no
  Korean pedagogy" a dependency rule the toolchain enforces, where a folder
  inside topik would make it a convention.
- **`@some-ui/topik`** keeps the teaching: probes, the hint ladder, tiles, the
  probe audit, the evaluation report, and the handheld
  renderer, which becomes a renderer of the engine. Topik depends on makjang,
  never the reverse. Only the handheld renderer imports makjang. The desktop
  session (`DesktopSession`, the session machine) does not, and is not changed
  by any increment here.

This is the second `makjang` workspace. The first (removed in #1645) held
stream-overlay widgets and some SVG scenery, not a drama, and was removed as a
vestige because nothing live depended on it. This one is reached through
topik's phone lesson from M2, so M1 and M2 land in one pull request: a
workspace merged before anything depends on it is a vestige from its first
day. It does fail the hoisting doctrine's
fan-out test (one consumer, `docs/monorepo-boundaries.md`), and that is
accepted on purpose: the boundary exists to fix the direction of a dependency,
not to share code.

## Increments

Each one ships, and none needs a better model than exists today.

- **M1: the drama as data.** The canon amendments above. `@some-ui/makjang`
  with the scene-tree schema, the story audit and the engine, tested in `node`.
  Tests run on
  generated trees and on minimal synthetic fixtures (a root, one split, a
  leaf at maximum depth), never on a curated scene. No UI change yet.
- **M2: the phone lesson runs on the engine.** It renders as a vertical
  webtoon (panels, speech bubbles, sound-effect lettering), the direction
  chosen from four phone prototypes on 2026-10-08. How each scene anchors a
  feeling within today's limits is still being designed, and settles before
  M2's renderer is built. The generator prompt writes one scene tree per
  reply, and the learner's paste-in loop (Cor. 8.2) accepts trees through the
  two audits, so M2 has real branched content from its first day rather than
  only synthetic fixtures. The legacy-conversation adapter and the teaching
  audit's pruning, in topik. The media port types. Speaker names, choices as
  large text targets, consequence and repair scenes, a distinct device
  voice (or pitch) per character where the device allows it. `core/lesson-track`
  and its tests are removed once nothing uses them. The wrap card loses
  "Conversation N of M" and the tally as its headline, and ends a lesson on how
  the scene resolved instead. M2 is done when it passes the test above: on
  screen the learner follows characters through a scene, and no screen is
  framed as an exercise ("Check", "Question N", "N of M").
- **M3: served scene trees.** The operator's weekly batch (Cor. 8.3) serves
  reviewed trees as a phone-only feed, beside the conversation batch the
  desktop session keeps reading. Today both renderers read one batch through
  the same repositories (`study-session`), so M3 adds a feed rather than
  converting the existing one, and neither renderer reads the other's.
- **Later, one capability at a time:** a learner-defined genre and ensemble
  in the prompt, a standing cast, series and memory across lessons, per-character cloud
  voices, generated art in a fixed style, portraits, video beats, whole-series
  scripts. Each adds assets and a renderer capability, plus its canon line, and
  changes neither the story schema nor the engine.

## Invariants to declare with M1

These are design commitments, not yet invariants: there is no code for them to
be true of. They should be declared in the house shape (`CLAUDE.md`, "Gray-area
invariants") in the change that adds the code, and enforced where they can be.

- **The engine imports no media and no topik.** Mechanical: an import
  restriction on `@some-ui/makjang`'s `lib/`.
- **Every scene tree is within its bounds.** At most four options per
  choice, no choice at the maximum depth. Mechanical:
  the story audit, run on every served or pasted lesson.
- **Every choice that is asked passes the probe audit.** Mechanical: the
  teaching audit, with a rejected choice pruned to a leaf.
- **A choice's outcome does not depend on the route taken afterwards, and
  an unvisited choice has none.** Mechanical: a property test over every route
  of generated and synthetic trees.
- **A new rendition kind lands with its valuation.** Not mechanical: whether a
  picture or a face reveals the answer needs a person. Falsified by a change
  that adds a rendition kind to a renderer's capability set with no canon line
  saying what it reveals.

## Open questions

None for M1. Depth (2) and where the drama mounts (the handheld window
split) were decided on 2026-10-08 and are recorded where they apply above.
