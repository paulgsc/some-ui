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

## Scope: the phone only

The drama is the phone's experience. The desktop session is not rebuilt to
render it: it keeps its own lesson and its own content format, it never reads
a scene tree, and nothing here is designed so that it could. A choice that is
right for a thumb on a phone needs no desktop equivalent.

In code, "phone" means topik's handheld surface. `chooseSurface` mounts it when
the applet's own box is under 768px wide or 480px tall, so it follows the box,
not the device: a phone browser on the Pages build gets it, so does a narrow
desktop pane, and the APK on a tablet does not. The drama keys on that split,
not on the APK audience (`hasAudience("apk")`), for three reasons. There is
then one phone lesson: the handheld renderer becomes the drama wherever it
mounts, and the lesson it replaces is deleted rather than kept alive for phone
browsers. Tests reach it: no vitest or Playwright suite renders the `mobile`
build profile, so an APK-only branch would be rendered by none. And the
drama's design is about the shape of the screen, which is what the split
measures. Moving it to the APK alone later changes which renderer mounts, not
the engine or the content.

What being phone-only buys in the design:

- **One beat at a time,** portrait first, with the 780×390 landscape in
  `apps/www/tests/ui-fit/harness.ts` as the shape it must also survive.
- **Choices under the thumb,** as a few large targets, never a dense list.
- **Short sittings.** A lesson is one route through one tree, resumable at
  the beat (amendment 4, below), because a phone session is picked up and put
  down.
- **Audio as a first-class channel,** since a phone is often used with sound.

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
them. Every design decision below is measured against this test first.

### What we claim, and what we do not

We never claim a learner has learned anything. The claim is weaker, and it is
the one the product rests on: someone who keeps coming back to a drama they
can only follow in Korean becomes more literate in Korean as a result. It is
not a guarantee for any one lesson. It is what emerges from continued, honest
time with the language. The learner is here to enjoy a drama, and literacy is
what they come away with.

The canon says the same thing, and says why the stronger claim is not
available: no single unit's outcomes can show that it taught anything
(Thm. 3.1), so the system claims only that persistence is how learning
happens, and what a unit owes the learner is a reason to come back
(Rem. 3.3). Coming back is part of the objective itself, not a product concern
beside it (Axiom 6.1, Rem. 6.1).

It is also stricter than "engaging content teaches", in two ways that are
design rules here:

- **The gain is conditional on honest practice.** The canon states this for
  the read-aloud exercise (Axiom 6.2), and amendment 5 states it for the
  drama. Honest practice here is following the drama in Korean. A learner who
  reads the English gloss of every line is enjoying a drama in English, and
  nothing emerges. So the drama stays in Hangul as far as the level allows:
  the gloss is a rung the learner reaches for on a line, never the default;
  narration, choice prompts and consequences are in Korean wherever the level
  can carry them; and English is the fallback, not the channel.
- **Engagement may not be bought with the gain,** by Rem. 6.7's argument. A
  change that makes the drama more pleasant by making it less Korean (glosses
  up front, English narration for flow) is not preferred on engagement alone,
  and has to be argued the way any change to the teaching is.

### What it is not

- **Not gamified engagement.** No streaks, no catalogue to complete, no "X of
  Y" as the reason to continue. If there is a game, it is the drama.
- **Not a lecture.** The lesson does not run on regardless of whether the
  learner kept up. What the learner understood or missed changes what happens
  next.

### An illustration

Seo-yeon is told what to buy before she meets her future mother-in-law. Later
she is at the shop, and the learner is asked what she should buy. If the
learner understood the advice, the scene goes on. If not, Seo-yeon buys the
wrong thing and gives it to the mother-in-law, and the learner sees what
happens: a scene, in Korean. Then the learner has to calm things down, which
takes the right apology at the right level of politeness to an elder. The
mistake does not end in a red X. It produces more drama, more Korean to read,
and a second, harder item.

This illustrates the shape (a choice inside the story, a consequence instead
of a correction, a repair), not an item to build. "What should she buy?" is
itself the kind of question the canon rules out (a learner who recognises one
noun answers it, Prop. 4.2), and so it would not be asked. Questions that do
pass the rules, and keep the same shape, are plentiful: which reply would
offend her, what Seo-yeon is really saying, what she should say back.

### Why the phone lesson drifted

The lesson generator already wrote a makjang family romcom with a standing
cast (`packages/ui/topik/src/lib/topik/generation/lesson-prompt.md`, "The
setting"). Until MKJ-S5 the phone played it as a conversation lesson, which
threw the drama away. The desktop still plays that format:

| What the drama has           | What the conversation format keeps                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| A cast of named characters   | `role: "user" \| "assistant"` per line; "a third character can be talked about but not heard" |
| Who is speaking              | "The lesson never shows speaker names"                                                        |
| Choices with consequences    | A fixed plan: line, its checks, misses once at the end, a wrap card                           |
| A reason to see what is next | "Conversation 3 of 8", "Material complete", a first-listen tally                              |
| A wrong answer as an event   | One line of `why` text under the option (`ProbeOption.why`)                                   |

The Duolingo feel and the lecture feel are both symptoms of that loss. Neither
was fixed by tuning the lesson. Both went away on the phone when the drama
became the structure.

## How this relates to the canon

The canon governs **how the lesson may claim anything about learning**: which
items are admissible, what is credited, what persists. This story governs
**what the lesson is for**. The story supplies the reason to come back
(Rem. 3.3); the canon supplies the rigor the story insists on.

Most of the architecture below is derivable from results the canon already
has. Some of it is not, and per the canon's amendment protocol those
amendments land with, or before, the first source change that relies on them
(not with this document, which changes no source). They landed with M1 as
canon v1.13 (MKJ-S1): Remark 4.11, Corollary 4.7, Remarks 4.12 and 4.13,
Axiom 6.3, and Remark 9.2 for the feeling anchor.

**Derivable today**

- Lines and narration with the audio, Hangul, gloss ladder (Cor. 4.4).
- Choices as morphism probes of order two or three (Def. 4.6, Def. 4.7,
  Rem. 4.8, Cor. 4.5). A choice is a probe and nothing new: a question that
  would break an existing rule (first-order, Prop. 4.2, among them) is simply
  not asked, and the existing audit drops it (Rem. 4.7, Thm. 8.2).
- Scenes, branches and consequences as authored content, produced at
  authoring time and graded by lookup (Prop. 8.1, Rem. 4.7, Def. 8.3).
- Voice, art and video as what a renderer can present, its capability set
  (Def. 9.3), sharing every other object (Thm. 9.1, Prop. 9.3). A lesson
  with no asset for a port falls back to text at that port and changes no
  other object; a missing model changes the supply of content and nothing else (Thm. 8.2). That is
  the formal version of "don't block on the technology".

**Amendments (canon v1.13)**

1. **A consequence as a value of `p_reveal`** (Def. 4.2; Rem. 4.11). After a miss, what
   is shown is the scene the chosen candidate leads to, with the authored
   `why` available after it. It is a new value of an existing dimension, which
   Theorem 4.1 says is cheap.
2. **A unit is a bounded tree, not a sequence** (Cor. 4.7). Corollary 4.4 brings a missed
   check back once after the last line. In a drama unit, a missed choice
   instead leads to its consequence scene, whose own choice is the repair
   item: what comes back after a miss is authored into that subtree, bounded
   by the tree's depth. A choice the learner's route never reaches was never
   presented, so it is not an outcome of any kind, and in particular not a
   miss.
3. **A choice is about its scene, not one line** (Rem. 4.12). Corollaries 4.4 and 4.5
   present a check right after the line it anchors to, and withhold that
   line's gloss until the check is answered. A choice is asked at the end of
   its scene and may turn on any line the route has shown, including lines
   whose gloss the learner has already reached. Its valuation is declared:
   `p_hint` is on demand over the route so far (every line's gloss stays one
   rung away, as the ladder allows). Candidates carry no English gloss, and
   each candidate's `why` stays hidden until the choice is answered, as
   Cor. 4.4 withholds the anchor line's gloss: an English rendering of each
   candidate would spell out the transformation the item tests, which is
   Prop. 4.2's confound by another road. That a line's
   gloss may be reached before the choice is recorded, as Cor. 4.5 (ii)
   records the gloss candidate, so that the day `p_credited` moves
   (Rem. 4.5) it is a known interaction rather than a discovered one.
4. **The budget is one lesson, and the resume point is a route** (Rem. 4.13). The
   handheld capability set's budget (Def. 9.3), one conversation in
   Cor. 4.4, becomes one lesson: one route through one tree, at most three
   scenes. The resume point replaces Cor. 4.4 (iii)'s conversation index and
   message id with the route (the option ids chosen from the root), where
   the learner is in the scene (a beat's id, its open choice, or the end),
   and the option first chosen at each choice reached. It
   is resolved by identity and discarded to the root when it no longer
   resolves (Thm. 1.1). Nothing crosses lessons (see "One lesson stands
   alone").
5. **Honest exposure teaches, for the drama** (Axiom 6.3). Axiom 6.2 is stated for the
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
 │  audits,      │                    │  (2–4 options, ≤ max depth)  │
 │  asset jobs   │                    └──────────────┬───────────────┘
 └───────────────┘                                   │
                                     ┌───────────────▼───────────────┐
                                     │ 2. Engine (pure, lib/)        │
                                     │  state union + step(),        │
                                     │  no media, no pedagogy        │
                                     └───────┬───────────────┬───────┘
                                  checks     │               │ effects
                         ┌───────────────────▼──┐   ┌────────▼──────────────┐
                         │ Teaching (topik)     │   │ 3. Media (ports)      │
                         │  probes, hint ladder,│   │  voice, art, motion;  │
                         │  audit, reports      │   │  fall back to text    │
                         └──────────────────────┘   └───────────────────────┘
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
Lesson    = { id, level, pov: CharacterId, cast: Character[], root: Scene }
Character = { id, name, standing, registers, voice?, look? }
Scene     = { id, place, feeling, beats: (Line | Narration)[], choice? }
Line      = { id, speaker: CharacterId, text, gloss, direction? }
Narration = { id, text, gloss }
Choice    = { id, prompt, check: Check, options: Option[2..4] }  // none at MAX_DEPTH
Option    = { id, art?, child: Scene }  // id = a candidate's id in the check
```

`text` is in the language being learned and `gloss` in the learner's; neither
the schema nor the engine knows which languages those are. `Check` is the
teaching layer's item, a type parameter to makjang, which carries it without
reading it. An option holds no words of its own: what the learner reads is
the check's candidate with the same id, so a candidate's text lives in one
place. A check is a `pick-valid` or an `odd-one-out`, each with exactly one
keyed candidate. A candidate carries an `id` (Thm. 1.1), required by the
teaching audit of every choice in a tree.

- **Depth** is the number of choices between the root and a scene.
  `MAX_DEPTH = 2`: a scene at depth 2 has no choice; it is a leaf, and the
  story resolves there. A scene above it may also be a leaf. Depth is what
  bounds the repair: there is no loop to retry in, only a subtree that ends.
- **Fan-out** is two to four options (`MAX_BRANCHES = 4`). One option is not
  a choice, and four is about what a phone screen shows as large thumb
  targets.
- **Which option is the answer is the check's to say, not the option's.**
  Each option is one of the check's candidates, and the check's answer key decides which one the item wants (in an odd-one-out it
  is the invalid one). The option the key names leads the story on. Every
  other option's child is its consequence: the mother-in-law receiving the
  wrong gift, in Korean. A consequence's own choice, if it has one, is the
  repair (calm her down), usually harder and usually third-order, since
  politeness toward an elder is what it tests.
- **The route is the memory.** Because the shape is a tree, every scene knows
  exactly what led to it: its ancestors. A consequence scene does not need a
  flag saying "she bought the flowers", because it only exists on the route
  where she did. No flags and no joins are needed while branches never
  converge.
- **The size is bounded by the two constants.** A full tree has
  `(4^(D+1) − 1) / 3` scenes, so at most 21. The learner sees one route: three
  scenes and two choices. The generator writes every scene in one reply, so
  the depth is a cost decision as much as a story one, and no separate cap is
  needed.
- **Cast, inline.** A lesson declares its own characters: an id, a name, how
  they stand to the others (`standing`, described text), which register they
  use to whom and receive (`registers`, per pair), and medium-free
  descriptions of voice and look, which the media layer turns into renditions
  when it can. Lines name a speaker by cast id, never `user`/`assistant`, and
  `pov` names the character the learner follows.
- **Beats.** A _line_ has a speaker, its text, its gloss and an optional stage
  direction (how it is said). A _narration_ is a short action or description
  so the learner knows where they are. An option may carry a short art
  description, which the media layer renders when it can and otherwise
  ignores.
- **Feeling.** Every scene names the one feeling it is wrapped in, as a key
  from the renderer's vocabulary (see "The webtoon: one feeling per scene").
  Makjang carries it as a string without reading it, as it carries `art`: the
  story audit checks that it is there, and topik checks that the renderer has
  it. A tree that fails either is rejected at load like any other malformed
  tree, so no scene renders without its anchor.

**The code knows the shape, never a scene.** Every scene, character, line and
choice comes from generation. Nothing in `@some-ui/makjang` or topik names a
particular scene, trope, character or item, and no catalogue of cases (scene
types, gift kinds, icon sets) is enumerated anywhere. The one closed set is the
renderer's feeling vocabulary, with its eight symbols, and it is a palette, not
a catalogue: like a colour theme, it says how a scene may look and sound, never
what happens in it, and no feeling or symbol names a scene, a trope or a
character. The schema, the bounds,
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
premise are the default. But the first iteration must not close it off, which
constrains it now:

- **The cast is a list of any size,** and how characters stand to each other
  is described text, not a fixed set of roles. There is no `motherInLaw` or
  `rival` field. The one structural fact is which character the learner
  follows (`pov`).
- **Register is per pair of characters,** read from the cast, not implied by a
  role.
- **The premise is a parameter of the prompt,** a default a learner could
  replace, not text the app depends on. The makjang family romcom is the
  default genre, not an assumption.
- **No audit checks anything genre-specific.** The story audit checks shape,
  the teaching audit checks items, and neither knows what the drama is about.

#### One lesson stands alone

Every lesson is self-contained, the way a lesson generated from one prompt is
today. It does not know about any other lesson, any other scene tree, or any
recurring cast, and the generator is given no story from earlier lessons: the
prompt, the level and an optional scene idea are enough. The one thing that
crosses lessons is the last session's record (see "The last session, and its
review"): the last drama's scenes, first tries and review, which steer how
the next drama fits, never what happens in it. The app keeps nothing else
between lessons beyond the shelf. The standing cast in today's generator
prompt can stay as a
default to draw from, as long as no lesson relies on another.

Longitudinal structure (a standing ensemble, a series, the mother-in-law
remembering last week) is a later goal with its own design: a shared cast, and
branches that converge, which bring back the joins and flags the tree does
without. Nothing here waits for it.

The handheld surface plays scene trees only. Conversation files stay the
desktop session's format. A conversation unit the learner pasted lasts the
session (Rem. 7.4) and is gone with it; one kept on their account shelf no
longer reads as a lesson on the phone, and the shelf already shows such an
entry as unreadable, for the learner to remove.

### 2. Engine: what happens next

One state union and a pure `step(state, event) → { state, effects }` in
`lib/`, tested in `node`, as `docs/monorepo-boundaries.md` ("the component is
not the coordinator") requires and as topik's `core/` already models.

- **State:** the route (the option ids chosen from the root, which locates
  the current scene), the current beat by id, and the option first chosen at
  each choice reached, keyed by the choice's id.
- **Events:** advance, go back a beat, choose an option, restart, resume.
  Going back stops at the start of the current scene and never crosses a
  choice: crossing one would let the learner choose again, which is a retry,
  and the check's valuation forbids retries (Cor. 4.4). Restart is a replay
  of the whole lesson, which Cor. 8.2 expects, not a retry: it returns to the
  root, the first choices stay as they were, and a choice made again on the
  replay records nothing new.
- **Recursion is in the content, not the engine.** Entering a child scene is
  pushing an option id onto the route. The engine is the same at every depth
  and never needs to know how deep the tree is.
- **Effects:** "voice this line as this character", "show this scene's
  place", "persist the resume point". The engine names _what_ should be
  presented, never _how_.

How much of a line is showing (the audio, Hangul, gloss ladder) is teaching,
and the rung reached becomes part of an observation's valuation (Cor. 4.4).
It lives in topik's teaching state in `core/`, beside the engine's state,
never in the renderer (Prop. 9.2).

Three rules keep the engine sound:

- **The engine knows no media.** It does not import speech, art or video, and
  it never branches on whether a voice or picture exists. The media layer
  reads effects and renders what it can.
- **The engine knows no pedagogy.** To the engine, a choice is options, each
  leading to a child scene, and a check it carries without reading. Which
  option is the answer, and whether the item is any good, are the teaching
  layer's.
- **The route never changes the record.** A choice's outcome is the option
  first chosen there, kept across restarts, whatever route the drama then
  takes. The consequence is presentation (`p_reveal`), not evidence, and a
  learner who reached a scene by a repair branch is not recorded differently
  for the items there. Choices on routes not taken are not recorded at all.

### 3. Media: renditions over ports

Each way of presenting a beat is a port, and what the ports can present is the
renderer's capability set (Def. 9.3); every port falls back to text.
Renditions are assets made at authoring time from what the content describes
(a character's voice and look, an option's art description) and keyed by the
story's ids, never generated by a model while a learner waits (Prop. 8.1,
Def. 8.2, Axiom 8.1).

| Port   | Today                                                    | Later                                              | Falls back to   |
| ------ | -------------------------------------------------------- | -------------------------------------------------- | --------------- |
| Voice  | The session's chosen Korean voice (`@some-ui/speech`)    | A voice per character, from the cast               | Text only       |
| Sound  | A scene's feeling: its tone, then its cry, with sound on | The cry at the feeling's own rate and pitch        | The caption     |
| Art    | None: options are text                                   | Generated icons, portraits, backdrops in one style | Text labels     |
| Motion | None                                                     | A character speaking a beat, as video              | Portrait, voice |
| Script | One self-contained scene tree per lesson                 | A coherent series with a standing cast             | (authoring)     |

**A voice per character needs a speech API change.** topik speaks through a
`Speaker` handle (`packages/speech/src/lib/speaker`), which deliberately
cannot name a voice: the speech session owns the voice the person chose in
Settings, because topik once overrode it on every line. Per-character voices
therefore need a change to `@some-ui/speech`'s API, and a decision on how a
character's voice relates to the one chosen in Settings. Until then every
character speaks in the chosen voice, and characters are told apart on screen.

**Media is not pedagogically neutral.** A picture glosses a noun. A frown on a
video face is a hint on a register item. By Prop. 9.4's argument, each new
rendition kind changes the valuation the renderer delivers, so it lands with a
line in the canon saying what it reveals and why that is acceptable, option
art included when it is added. That is the one place where "add it when the
technology is ready" needs a review step and not just an asset.

### 4. Authoring: how lessons get made

The pipeline the canon already declares, extended rather than replaced:
source idea, then a model, then JSON, then a deterministic audit, then review,
then served content (Rem. 8.1, Cor. 8.3), with the learner's own model as an
option (Def. 8.3).

- **A tree prompt beside the conversation prompt.** The conversation prompt
  (`generation/lesson-prompt.md`) writes the desktop session's weekly batch,
  which the LAN lesson CRM (`@some-ui/lesson-crm`) builds, checks and saves.
  The tree prompt writes one
  scene tree, holding every choice to the probe rules, and stays standalone:
  no other lesson goes into it. Its vocabulary differs: the conversation
  prompt calls a conversation a "beat", and here a beat is a line or a
  narration.
- **Two audits, by owner.** The story audit checks shape: two to four options
  per choice, no choice at the maximum depth, ids unique across the tree,
  every speaker and `pov` in the cast, every option leading to a scene, every
  scene naming a feeling. The teaching audit holds each choice's check to the
  probe rules (`core/tree-audit`), and matches its options to the check's
  candidates. A choice
  it rejects is not asked: its scene becomes a leaf and the subtree under it is
  dropped, the tree's version of Remark 4.7's "dropped at load". Topik also
  rejects a tree whose scene names a feeling the renderer does not have.
- **Asset jobs** are a separate authoring step (cast voices, option art,
  later portraits and video), so a lesson can ship with no assets at all and
  gain them later without its story changing.

## The webtoon: one feeling per scene

The phone renders a lesson as a vertical webtoon: one panel per beat, speech
bubbles, narration in caption boxes, sound-effect lettering. On its own that
reads as a conversation in panels. What makes it a drama is that every scene is
wrapped in one feeling, and the feeling is anchored the way a show's sting is:
the same kit, every time it recurs, so the fifth time the reader meets it they
feel it before they read a word. A kit is a convention (a variety-show caption,
a sweat drop, a slammed panel), not a joke, which is why it survives being
repeated.

### The vocabulary

Eight feelings, each placed on the valence × arousal plane (v from unpleasant
−1 to pleasant 1, a from calm −1 to agitated 1). The caption, the voiced cry
and the sound-effect lettering are fixed per feeling, never generated, so the
anchor is identical wherever it recurs.

| Key       | Feeling | v     | a     | Hue | Texture | Motion  | Caption (예능 자막) | Cry           | Lettering |
| --------- | ------- | ----- | ----- | --- | ------- | ------- | ------------------- | ------------- | --------- |
| `tension` | 긴장    | −0.35 | 0.45  | 260 | lines   | settle  | 숨 막히는 긴장감    | 흠…           | 꿀꺽      |
| `rivalry` | 기싸움  | −0.45 | 0.70  | 300 | stripes | flicker | 기싸움 시작         | 호오?         | 파직      |
| `chill`   | 싸늘    | −0.60 | −0.45 | 235 | dots    | frost   | 갑분싸              | 헐.           | 휘잉      |
| `cringe`  | 민망    | −0.30 | 0.30  | 350 | tone    | shake   | 동공지진            | 아이고…       | 삐질      |
| `fury`    | 분노    | −0.85 | 0.95  | 28  | burst   | slam    | 분노 폭발           | 허, 참!       | 쾅        |
| `twist`   | 반전    | 0     | 0.90  | 95  | burst   | punch   | 충격 반전           | 헉!           | 두둥      |
| `flutter` | 설렘    | 0.70  | 0.55  | 345 | petals  | float   | 심쿵                | 어머나~       | 두근      |
| `warmth`  | 훈훈    | 0.75  | −0.35 | 75  | none    | glow    | 훈훈한 마무리       | 휴, 다행이다. | 휴        |

Each feeling also has one symbol, a small inline icon: tension lines,
a lightning bolt, cold wind, sweat drops, an anger vein, shock lines,
sparkles, rising steam. Adding a feeling is placing a new point and writing its
words; everything else follows from the rules below. 짠함 (bittersweet, about
v −0.3, a −0.65) is the next open place on the plane.

### Derived, never chosen

A feeling's colours, edges, timing and sound are derived from its point and
hue, relative to the session theme the person chose (`SESSION_THEMES` in
`@some-ui/styles`), so every feeling lives inside every session theme rather
than beside it. A feeling never overrides a session role; it sets only its own
private tokens, and the drama brings no colour of its own: its buttons and its
choice panel are the session's.

- **Ground:** the session background mixed in oklab toward a tint of the hue
  (lightness 0.86 − 0.08·max(a, 0) on a light theme, 0.42 on a dark one;
  chroma 0.04 + 0.12·|v|), by 18% + 14%·|v| (24% + 14%·|v| on a dark theme). A
  reveal (|v| < 0.2 and a ≥ 0.8) swaps ground and ink: its ground is the
  session's ink mixed 8% toward lightness 0.5 at chroma 0.1 in the hue, its
  ink is the session's ground, its muted text is that ground mixed 28% toward
  the session's ink, and its accent takes the other mode's lightness.
- **Ink and muted text:** the session's own, each mixed halfway toward the same
  lightness at chroma 0.09 in the hue.
- **Accent** (symbol, lettering, texture): the hue at lightness 0.52 on a light
  theme or 0.80 on a dark one, chroma 0.06 + 0.12·|v|.
- **Contrast floor:** body ink and muted text clear 4.5:1 on the ground and
  on the ground under a texture stroke, and marks 3:1 on the ground; a colour
  that falls short steps its lightness away from the ground until it does.
- **Edge:** 2 + 2·max(a, 0) px of ink; jagged when v ≤ −0.6 and a ≥ 0.8, rounded 20·v px
  when v ≥ 0.4.
- **Texture:** the feeling's kind, in the accent at 10–18% alpha, denser as a
  rises.
- **Motion:** the feeling's kind, played once, 950 − 450·max(a, 0) ms at
  amplitude 0.35 + 0.65·max(a, 0), and not at all under `prefers-reduced-motion`.
- **Caption lettering:** the hue as fill, a dark ink stroke, the session ground
  as its halo.
- **Sound:** a synthesized tone, register 196·2^max(a, 0) Hz, rising in a major triad
  when v ≥ 0.3, falling a semitone when v ≤ −0.3 (with a noise crash when
  a ≥ 0.8 too), otherwise the dun-dun of a reveal, an octave and more below
  the register; then the cry, voiced at rate 0.9 + 0.2·a and pitch
  1 + 0.12·v. No asset files. The cry's prosody waits on the same
  `@some-ui/speech` change as per-character voices: a `Speaker` takes no
  pitch, and its `playbackRate` replaces the rate the person chose rather
  than scaling it, so the cry is voiced at the session's own.

In code, `@some-ui/styles` derives (`src/theme/feeling.ts`, registered as the
`feeling` scope) and the result reaches CSS generated, not inline:
`themes/feeling.css` (`pnpm --filter @some-ui/styles generate:feelings`)
holds every feeling on every session theme as literal `--feeling-*` tokens
under that theme's root classes, since the contrast floor's stepping has no
CSS expression and topik need not know which session theme is active. A
panel wears a feeling as a boundary, `feeling feeling-<key>`, which carries
the tokens and a jagged edge's outline, around a `feeling-panel` element that
paints them; the cover's boundary adds `feeling-motion`.

### Where the anchor goes

- **A cover beat opens every scene,** in the feeling's theme: its caption, its
  symbol and its lettering, entering with its motion. With sound on, the cover
  plays the tone and then the cry.
- **Every panel of the scene wears the feeling's theme** (ground, texture,
  edge) and carries its symbol beside the speaker.
- **A leaf closes on an ending panel** in the same theme.
- **Never on a choice.** The choice panel and the learner's chosen line stay in
  the session theme. A child scene's feeling first shows on the cover after the
  chosen line, so it adds nothing about the choice just answered that the
  child scene itself does not show.

**What the anchor reveals.** The anchor is a rendition kind in Prop. 9.4's
sense. A scene's feeling is on screen while that scene's own choice is open
(the root's before anything is answered), so it can change the choice's
`p_hint`: it names the scene's mood, the same for every candidate, which the
scene's Korean already carries, and so it can stand in for reading the scene.
Its canon line, stating that valuation and why it is acceptable, is
Remark 9.2 (v1.13), filed ahead of the renderer.

- **Hangul first.** The caption is Korean, with its gloss one tap away; the cry
  is heard, in Korean.
- **Sound only after a tap.** It is off until the learner turns it on, plays
  once per scene, and never speaks over a line. Its toggle sits in the
  handheld's header, remembered per device; when a sting plays is
  `core/drama-runtime`'s, and how is `adapter/sound-port`'s, over
  `@some-ui/styles`' `feelingTone`.

## The last session, and its review

A **session** is a drama played to an ending. The phone keeps one record of
it, the last, and that record writes the "last drama" part of the next prompt
the learner copies. At the ending the learner is offered a review of the
drama. It is optional, it steers what comes next, and nothing scores it. It
replaces the conversation lesson's survey (MKJ-S5) and the store that held
it.

### Where comprehension lives: nowhere the app keeps

The review only helps pick the next drama (#1723, option (a)). No answer is a
claim about the learner, and nothing infers a level from one.

- **First tries give the average guidance.** The material's shape is fixed,
  so how a learner did on its choices supports inferences about which drama
  fits them, on average. The app draws no such inference itself. It hands the
  first tries to the learner's model as text, and that model draws it.
- **The review overrides the average.** It is weighted strongly, but never
  completely. A drama that fits the level the learner performs at can still be
  wrong for this person. Some learners follow 10–20% of the Korean and happily
  come back, and others are uncomfortable below 90%. "I barely understood a
  sentence, but it was fun" is a valid answer, and so are "that was annoying"
  and "too simple".
- **There is no level and no score.** The only metric is implicit: the
  learner comes back, finishes dramas and asks for the next one.

### What it asks, and how it renders

Three questions. Each is answered with one tap, and any of them can be
skipped:

| Question (Hangul; English one tap away) | Answers                                                                        | What it steers                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 재미있었어요? Did you enjoy it?         | 재미있었어요 · 그저 그랬어요 · 별로였어요 (loved it · it was OK · not for me)  | Engagement: more of this, or change it                          |
| 다음엔 한국어가… Next time, the Korean… | 더 쉬웠으면 · 딱 좋아요 · 더 어려워도 돼요 (easier · about right · stretch me) | How much the learner is comfortable following, within the level |
| 더 보고 싶은 장면 More of this scene    | One chip per scene reached: its place, and its feeling's name                  | The scene, feeling or trope to amplify                          |

A free-text line comes last: 다음엔 어떤 드라마? (what next: a genre, a
trope, a character). It is capped at 200 characters.

**Every question works for a learner who did not follow the plot.** None of
them asks what happened. The second asks how comfortable the learner is, not
how much they understood, so "about right" at 10% is a complete answer. The
scene chips name what the learner saw on each cover (the place and the
feeling's name), not what was said.

**How it renders:**

- It lives on the phone, in the session theme (MK6: the review quotes no
  chosen line, and no item is open). Answers sit under the thumb as large
  targets.
- The questions are Hangul, and one "Show English" toggle at the panel's
  foot shows their English. Each answer is a Korean word with its English
  always shown small beneath it (a scene chip shows its feeling's Korean
  name instead). The answers are not items, so their English costs no teaching, and a
  level-1 learner must be able to answer.
- It is framed as no exercise: no "N of M", no "correct", nothing the
  `EXERCISE_FRAMING` test catches.

### What persists, and where

There is one record on the device, under `topik:last-drama`. It holds:

- **When** the drama ended, or the review last changed.
- **The drama:** its id, a hash of its content (a model picks the id, so two
  dramas, or a served one and its reload, can share one), its level, and its
  place (the root scene's `place`, the drama's title).
- **The scenes reached:** every scene any play of this drama reached, with
  its place and its feeling, in the tree's order.
- **The first tries:** for each choice reached, the choice's Korean, the
  candidate first chosen, and whether that candidate answered it
  (`isCorrectChoice`). The text rides along, since the drama will be gone
  when the next prompt is read.
- **The review**, if any was given.

Its rules:

- **Written at an ending.** It is written each time the drama reaches an
  ending, and replaces the record of any other drama. A replay of the same
  drama (the same id and content) keeps what the record held (the scenes, the
  first tries, the review) and adds what this play reached, so a first try
  is never replaced by a later one, even when the play's own state lost it.
  The review is taken only at an ending.
- **Brief** (Rem. 7.4): it is one record, and it expires after 30 days. Its
  free text is deleted once a prompt has carried it, as a report's is. It
  never leaves the device (Rem. 7.3), and losing it costs the next prompt its
  "last drama" section and nothing else, so a failed write is swallowed, and
  the record before it is removed, since it is another play's.
- **The level the learner holds** is the record's level until the learner
  chooses another, else 1. It replaces `heldLevel`'s reading of the last
  report. The review never moves it.
- **The prompt's history.** The tree prompt's `Survey` becomes `Last drama`.
  It carries the record as plain text: the title, the scenes reached and
  their feelings, each first try, and the review. Its section in `tree-prompt.md`
  tells the model to weigh the review over the first tries, and never to
  read either as a level.
- **The survey's key** (`topik:lesson-surveys`) joins the handheld's
  retired keys (`RETIRED_KEYS`), deleted when it opens, since nothing reads
  it now or would let it expire.

### When it is asked

- **At the ending, after 작가의 말.** It is a collapsed panel at the foot of
  the strip ("어땠어요? How was it?"), and a tap opens it.
- **It never gates anything.** "Play it again" and "Back to lessons" stay in
  the dock, enabled and unchanged.
- **Each tap saves at once.** There is no submit, so leaving at any point
  keeps what was given.
- **On a replay** of the same drama, the panel shows the answers already
  given, to change or leave. A second tap on an answer takes it back.
- **If it is skipped,** the first tries alone steer the next prompt.

### Its canon line

Remark 4.14 (v1.14), which amends Remark 4.13's "nothing crosses units",
with a §10 row for MKJ-S6 and MKJ-S7.

## Where it lives

- **`@some-ui/makjang`** (new, framework-agnostic: no React): the story schema,
  the story audit and the engine, and from M2 the media port types. It
  imports nothing from topik, which the package boundary enforces; an import
  restriction on its engine module keeps media out of the engine.
- **`@some-ui/styles`** owns the feeling themes as presentation: the
  vocabulary's points, hues, textures and motions, the derivation and its
  contrast floor. Topik owns their words
  (captions, cries, lettering) and symbols, keyed by the same feeling keys.
- **`@some-ui/topik`** keeps the teaching: probes, the hint ladder, the
  teaching audit, the evaluation report, and the handheld renderer, which
  becomes a renderer of the engine. Topik depends on makjang, never the
  reverse. Only topik's handheld path (its renderer and its teaching audit)
  and the lesson CRM, which checks and saves the operator's batch of trees,
  import makjang. The desktop session (`DesktopSession`, the session
  machine) does not, and is not changed by any increment here.

Each story lands with a live consumer (epic #1708), so makjang is never a
vestige (`CLAUDE.md`, "Vestiges"): MKJ-S1 lands the workspace with the lesson
CRM, a LAN deployable, building the tree prompt and checking a pasted tree
with both audits; later stories add the phone's renderer, sound and feed.

## Increments

Neither needs a better model than exists today.

- **M1: the drama as data.** The canon amendments above. `@some-ui/makjang`
  with the scene-tree schema, the story audit and the engine, tested in `node`
  on minimal synthetic fixtures (a root, one split, a leaf at maximum depth),
  never on a curated scene. No UI change.
- **M2: the phone lesson plays scene trees.**
  - It renders as a vertical webtoon: panels, speech bubbles, sound-effect
    lettering. Each scene carries one feeling, anchored as "The webtoon: one
    feeling per scene" records. The tree prompt lists the vocabulary's keys.
  - Content: the tree prompt, beside the conversation prompt. The learner's
    paste-in loop (Cor. 8.2) accepts trees through the two audits. A
    phone-only feed holds the operator's first reviewed batch of trees
    (Cor. 8.3), which the lesson CRM builds from the tree prompt and checks
    with both audits. Candidates gain ids. Today both renderers read one batch through the same
    repositories (`study-session`), so the feed is added beside the desktop's
    conversation batch rather than converting it, and neither renderer reads
    the other's. The CRM saves a checked tree, pruned as it plays, under the
    curriculum activity `makjang`. The server lists one activity per
    manifest, `topik`'s unless `?activity=` names another
    (paulgsc/server#417). Only the handheld reads the `makjang` one
    (`adapter/tree-feed`), and home sync carries it to the phone's mirror
    under the same activity. The learner shelf keeps a pasted tree as it
    keeps a conversation lesson.
  - The teaching audit's pruning, in topik. The media port types. Speaker
    names, choices as large text targets, consequence and repair scenes.
  - The handheld's conversation path goes: `core/lesson-track` and its tests
    are removed, and with MKJ-S6 the conversation file's probes, their audit
    and the helpers only they used. The wrap card loses "Conversation N of M" and the tally
    as its headline, and ends a lesson on how the scene resolved instead:
    the leaf's last beat, its ending panel, then the author's notes
    (작가의 말), each choice the route made with the line chosen and its
    `why`, in the session theme. The conversation lesson's survey leaves the
    phone with it (MKJ-S5, owner's call); the reports it wrote are read until
    they expire.
  - It is verified on pasted and served trees, and done when it passes the
    test above: on screen the learner follows characters through a scene,
    and no screen is framed as an exercise ("Check", "Question N", "N of M").
- **MKJ-S7: the last session, and its review.** The phone keeps the last
  drama played to an ending, and offers a review at the ending; both steer
  the next prompt (see "The last session, and its review"). The survey's
  store goes.
- **Later.** Media capabilities (per-character voices, generated art in a
  fixed style, portraits, video beats) each add assets and a renderer
  capability, plus a canon line, and change neither the story schema nor the
  engine. Longitudinal structure (a standing cast, series, memory across
  lessons) and a learner-defined genre do change the schema, and get their
  own design, as does layering several feelings in one scene.

## Invariants

Declared in the house shape (`CLAUDE.md`, "Gray-area invariants"). Each of
MK1–MK6 is enforced, and each says what a reviewer still checks: the part no
lint, type or test can see; MK7 is a reviewer's alone. MK1–MK4 held when
declared with M1: the engine imports only the schema, the package has no
dependencies, and the tests named below pass. MK5–MK7 held when declared with
MKJ-S2: all 40 session theme and feeling pairs clear the floor, the MK6 test
passes on every route of the tree prompt's worked example, and the anchor and
the voice are the renderer's only rendition kinds, each with its canon line.
The module doc comments of `story-audit.ts`, `engine.ts`, `media.ts`, topik's
`core/tree-audit` and `core/drama`, and `@some-ui/styles`' `feeling.ts` carry
the one-line summaries.

> **MK1: The engine imports no media and no topik.**
>
> - _Claim:_ `packages/makjang/src/engine.ts` imports only `@makjang/schema`,
>   and `@some-ui/makjang` has no runtime or peer dependency and no workspace
>   devDependency but `@some-ui/tsconfig` and `@some-ui/vite-config`.
> - _Falsified by_ a hunk that adds any other import to `engine.ts`; that adds
>   such a dependency to `packages/makjang/package.json`; that removes,
>   narrows or re-scopes the `src/engine.ts` block of
>   `packages/makjang/eslint.config.js`; that moves or renames `engine.ts` out
>   of that block's `files`; or that deletes or weakens
>   `packages/makjang/src/__tests__/package-shape.test.ts`, or deletes,
>   renames or moves it or `eslint.config.js`, which a pure rename shows with
>   no hunk at all.
> - _Scope:_ `packages/makjang`.
> - _Why not wholly enforced:_ the imports are lint (`no-restricted-imports`
>   on the engine, which restates the `../` ban) and the dependencies are a
>   test that reads the manifest. No check sees its own configuration being
>   edited away, which is why the falsifier names those files.
>
> **MK2: Every tree the engine walks is within its bounds.**
>
> - _Claim:_ every tree passed to `start`, `step` or `resume` is the `lesson`
>   of an `ok: true` `auditStory` result (or a pruning of one by
>   `auditTeaching`), and `auditStory` rejects a choice at `MAX_DEPTH`, a
>   choice outside `MIN_BRANCHES` to `MAX_BRANCHES` options, an id used
>   twice, a speaker, `pov` or register key outside the cast, an option
>   without a scene, a scene without beats, and a scene without a feeling.
> - _Falsified by_ a hunk that passes the engine a tree built any other way;
>   that changes `MAX_DEPTH`, `MIN_BRANCHES` or `MAX_BRANCHES` without
>   "1. Story" above changing with it; that removes or weakens one of those
>   checks in `packages/makjang/src/story-audit.ts` (a bound loosened by one
>   counts), or deletes or weakens its test in
>   `src/__tests__/story-audit.test.ts`; or that deletes, renames or moves
>   either file, which a pure rename shows with no hunk at all.
> - _Scope:_ `packages/makjang` and every caller of its engine.
> - _Why not wholly enforced:_ the audit runs on every tree and is tested,
>   but `Lesson<Check>` is a plain type anyone can construct, so whether a
>   caller's tree came through the audit is data flow at the call site, which
>   no type or lint rule sees.
>
> **MK3: A choice's outcome is its first choice, and an unreached choice has
> none.**
>
> - _Claim:_ in `packages/makjang/src/engine.ts`, `step` adds an entry to
>   `DramaState.first` only on a `choose` at an open choice that has none,
>   for that choice and the option chosen, and otherwise passes it on
>   unchanged: `restart` keeps it, and `advance` and `back` leave it. The one
>   other place `first` is built is `resume`, which takes a stored one whole
>   or not at all: it keeps every entry of a point that `firstResolves`
>   accepts and discards the point to the opening otherwise.
> - _Falsified by_ a hunk to `engine.ts` that writes `first` anywhere else,
>   overwrites or drops an entry, or drops `first` on `restart`; that makes
>   `resume` keep part of a stored `first`, or weakens `firstResolves`; that
>   deletes or weakens the MK3 property in
>   `packages/makjang/src/__tests__/engine.test.ts` (its loop over every
>   scene's route, its oracle, or its event set); or that deletes, renames or
>   moves `engine.ts` or that test file, which a pure rename shows with no
>   hunk at all.
> - _Scope:_ `packages/makjang/src/engine.ts`.
> - _Why not wholly enforced:_ the property runs random events after reaching
>   every route of a synthetic tree and fails on any violation. What it cannot
>   check is itself, so a reviewer checks the falsifier's second half.
>
> **MK4: Every choice that is asked passes the teaching audit.**
>
> - _Claim:_ a tree's choices reach a learner, or the lesson CRM's verdict,
>   only as a `checked` `TreeIntake` from `intakeTree` holds them, where every
>   choice `auditTeaching` reported an error on is pruned to a leaf.
> - _Falsified by_ a hunk that plays or shows a tree's choices from anything
>   but that `lesson`; that makes `auditTeaching` return a choice it reported
>   an error on; that deletes or weakens the pruning tests in
>   `packages/ui/topik/src/lib/topik/core/tree-audit/index.test.ts`; or that
>   deletes, renames or moves `core/tree-audit` or
>   `generation/tree-intake`, which a pure rename shows with no hunk at all.
> - _Scope:_ `packages/ui/topik` and `packages/ui/lesson-crm`.
> - _Why not wholly enforced:_ the pruning is tested
>   (`core/tree-audit/index.test.ts`), but which value a renderer reads is
>   data flow. The phone's renderer reads a pasted or kept tree only through
>   `adapter/pasted-lesson`, which runs `intakeTree` again on the way out of
>   storage, and a served one only through `adapter/tree-feed`, which runs it
>   on the way in from the feed.
>
> **MK5: Every feeling clears the contrast floor on every session theme.**
>
> - _Claim:_ for every theme in `SESSION_THEMES` and every key in
>   `FEELING_KEYS`, with the session's roles resolved from
>   `tokens/base.css` and `themes/*.css` (`session-roles.ts`),
>   `feelingColors` gives body ink and muted text at least 4.5:1 on the
>   feeling's ground and on that ground under a texture stroke, and the
>   accent at least 3:1 on the ground, and `themes/feeling.css` is
>   exactly what `feelingStylesheet` writes from them, declaring no custom
>   property outside `--feeling-*`.
> - _Falsified by_ a hunk that lowers `CONTRAST_FLOOR` or weakens `clear` in
>   `packages/some-styles/src/theme/feeling.ts`; that changes
>   `themes/feeling.css` in a diff that changes none of `feeling.ts`,
>   `session-roles.ts`, `tokens/base.css` or a session theme's
>   `themes/<id>.css`; that deletes or weakens a test in
>   `src/theme/__tests__/feeling.test.ts` (the loop over every session
>   theme and feeling, the swatch cross-check of the resolver, the drift
>   check, or the `--feeling-*` check); that paints text or a mark inside a
>   feeling panel (`packages/ui/topik`'s `webtoon-panel`) in a colour other
>   than the panel's own (`--feeling-ink`, `feeling-muted`,
>   `feeling-accent`), such as a `text-muted-foreground` utility; or that
>   deletes, renames or moves `feeling.ts`, `session-roles.ts`, the test or
>   `themes/feeling.css`, which a pure rename shows with no hunk at all.
> - _Scope:_ `packages/some-styles`' feeling themes, and the feeling panels
>   in `packages/ui/topik/src/components/topik/handheld/webtoon-panel`.
> - _Why not wholly enforced:_ the floor is a test over the session themes'
>   real values, so retuning a theme re-runs it. The stroke is composited as
>   the browser paints it, in sRGB, at the texture's alpha. What it cannot see is a
>   panel drawing its text in some other colour over the ground: which class
>   a JSX element carries inside which ancestor is markup no lint rule here
>   relates, and jsdom computes no colours.
>
> **MK6: No feeling anchor sits on a choice or a chosen line.**
>
> - _Claim:_ in `packages/ui/topik`, `panelsOf` (`core/drama`) gives a
>   feeling only to cover, line, narration and ending panels, and
>   `webtoon-panel` draws a feeling's theme, symbol or words only for those,
>   so the choice panel, the chosen line, the author's notes that quote the
>   chosen lines, the drama review (`drama-review`, which names a scene's
>   feeling in words but wears none) and the dock's options stay in the
>   session theme, and a child scene's feeling first shows on the cover
>   after the chosen line.
> - _Falsified by_ a hunk that gives the `chosen`, `choice` or `notes` arm of
>   `Panel` a feeling, or puts the chosen line after the cover in `panelsOf`;
>   that draws `Themed`, `FeelingSymbol`, `FEELING_WORDS` or a feeling class
>   in the `chosen`, `choice` or `notes` case of `webtoon-panel`, in
>   `drama-lesson`'s dock or in the `ladder-dock` it uses; that draws
>   `Themed`, `FeelingSymbol` or a feeling class in `drama-review`; that
>   deletes or weakens the MK6 test in
>   `components/topik/handheld/drama-lesson/index.test.tsx` (its loop over
>   every scene's route, or its selectors); or that deletes, renames or moves
>   `core/drama`, `webtoon-panel`, `drama-lesson`, `drama-review` or
>   `ladder-dock`, which a pure rename shows with no hunk at all.
> - _Scope:_ `packages/ui/topik`'s drama renderer.
> - _Why not wholly enforced:_ the test renders every route of a tree and
>   fails on an anchor inside or around a choice or a chosen line. What it
>   cannot check is itself, so a reviewer checks the falsifier's last half.
>
> **MK7: A new rendition kind lands with its valuation.**
>
> - _Claim:_ every rendition kind a drama renderer presents (today the
>   feeling anchor, Rem. 9.2, whose kit includes the sound port's tone and
>   cry, and the voice, which is Cor. 4.4's audio rung) has a line in the
>   canon saying what it reveals and why that is acceptable (Prop. 9.4).
> - _Falsified by_ a hunk that adds a port to `MediaPorts`
>   (`packages/makjang/src/media.ts`), or a new kind of element to the
>   anchor or the panels (option art, a portrait, a face on video), that no
>   canon line names and says what it reveals, whether added in the same
>   change or already in the canon; or a
>   hunk to `docs/canon/adaptive-learning-canon.typ` that deletes, moves or
>   rewords Remark 9.2 or Corollary 4.4's audio rung so that it no longer
>   says what the anchor (its tone and cry included) or the voice reveals,
>   or why that is acceptable, or renames or moves that file.
> - _Scope:_ `packages/makjang/src/media.ts` and `packages/ui/topik`'s drama
>   renderer.
> - _Why not enforced:_ whether a picture or a face reveals the answer needs
>   a person. That a port or an element was added is visible in the hunk.
