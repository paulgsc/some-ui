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
**what the lesson is for**. The story supplies the reason to come back
(Rem. 3.3); the canon supplies the rigor the story insists on.

Most of the architecture below is derivable from results the canon already
has. Some of it is not, and per the canon's amendment protocol those
amendments land with, or before, the first source change that relies on them
(not with this document, which changes no source).

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

**Needs an amendment (to land with M1, below)**

1. **A consequence as a value of `p_reveal`** (Def. 4.2). After a miss, what
   is shown is the scene the chosen candidate leads to, with the authored
   `why` available after it. It is a new value of an existing dimension, which
   Theorem 4.1 says is cheap.
2. **A unit is a bounded tree, not a sequence.** Corollary 4.4 brings a missed
   check back once after the last line. In a drama unit, a missed choice
   instead leads to its consequence scene, whose own choice is the repair
   item: what comes back after a miss is authored into that subtree, bounded
   by the tree's depth. A choice the learner's route never reaches was never
   presented, so it is not an outcome of any kind, and in particular not a
   miss.
3. **A choice is about its scene, not one line.** Corollaries 4.4 and 4.5
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
4. **The budget is one lesson, and the resume point is a route.** The
   handheld capability set's budget (Def. 9.3), one conversation in
   Cor. 4.4, becomes one lesson: one route through one tree, at most three
   scenes. The resume point replaces Cor. 4.4 (iii)'s conversation index and
   message id with the route (the option ids chosen from the root), the
   current beat's id, and the option first chosen at each choice reached. It
   is resolved by identity and discarded to the root when it no longer
   resolves (Thm. 1.1). Nothing crosses lessons (see "One lesson stands
   alone").
5. **Honest exposure teaches, for the drama.** Axiom 6.2 is stated for the
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
                         │  tiles, reports      │   │  fall back to text    │
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
place. Only checks with candidates can be choices (today `pick-valid` and
`odd-one-out`, each with exactly one keyed candidate); a `build` check has
none, so it cannot be a choice and the tree prompt does not author it.
Candidates carry no id today (`ProbeOption` in `entity/topik-types.ts` is
positional), so M2 adds one
(Thm. 1.1).

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
renderer's feeling vocabulary, and it is a palette, not a catalogue: like a
colour theme, it says how a scene may look and sound, never what happens in
it, and no feeling names a scene, a trope or a character. The schema, the bounds,
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
prompt, the level and an optional scene idea are enough. The digest of recent
evaluation reports the prompt already carries (Cor. 8.2) stays, since it is
about how lessons fit, not what happened in them. The app keeps nothing
between lessons beyond what the handheld surface already keeps (the reports
and the shelf). The standing cast in today's generator prompt can stay as a
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

| Port   | Today                                                 | Later                                              | Falls back to   |
| ------ | ----------------------------------------------------- | -------------------------------------------------- | --------------- |
| Voice  | The session's chosen Korean voice (`@some-ui/speech`) | A voice per character, from the cast               | Text only       |
| Art    | None: options are text                                | Generated icons, portraits, backdrops in one style | Text labels     |
| Motion | None                                                  | A character speaking a beat, as video              | Portrait, voice |
| Script | One self-contained scene tree per lesson              | A coherent series with a standing cast             | (authoring)     |

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

- **A tree prompt beside the conversation prompt.** Today one prompt
  (`generation/lesson-prompt.md`) feeds both the learner's paste-in loop and
  the operator's weekly batch, which the LAN lesson CRM (`@some-ui/lesson-crm`)
  builds, checks and saves. The conversation prompt stays, because the
  desktop session's batch still needs it. A second prompt writes one scene
  tree, keeping every probe rule the first has, and stays standalone: no
  other lesson goes into it. Its vocabulary differs: the conversation prompt
  calls a conversation a "beat", and here a beat is a line or a narration.
- **Two audits, by owner.** The story audit checks shape: two to four options
  per choice, no choice at the maximum depth, ids unique across the tree,
  every speaker and `pov` in the cast, every option leading to a scene, every
  scene naming a feeling. The teaching audit is the existing probe audit, plus
  a match between each choice's options and its check's candidates. A choice
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
repeated. One feeling per scene for now; layering several is a later design.

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
hue, relative to the session theme the person chose (`@some-ui/styles`: light,
dark, rose-night, harvest-sky, peachy-blossom), so every feeling lives inside
every session theme rather than beside it. A feeling never overrides a session
role; it sets only its own private tokens.

- **Ground:** the session background mixed in oklab toward the hue, 18% + 14%·|v|
  (24% + 14%·|v| on a dark theme). A reveal (|v| < 0.2 and a ≥ 0.8) swaps ground
  and ink.
- **Ink and muted text:** the session's own, their chroma turned to the hue.
- **Accent** (symbol, lettering, texture): the hue at lightness 0.52 on a light
  theme or 0.80 on a dark one, chroma 0.06 + 0.12·|v|.
- **Contrast floor:** muted text clears 4.5:1 and marks 3:1 on the ground; a
  colour that falls short steps its lightness away from the ground until it
  does. Body ink is the session's and clears it already.
- **Edge:** 2 + 2·a px of ink; jagged when v ≤ −0.6 and a ≥ 0.8, rounded 20·v px
  when v ≥ 0.4.
- **Texture:** the feeling's kind, in the accent at 10–18% alpha, denser as a
  rises.
- **Motion:** the feeling's kind, played once, 950 − 450·a ms at amplitude
  0.35 + 0.65·a, and not at all under `prefers-reduced-motion`.
- **Caption lettering:** the hue as fill, a dark ink stroke, the session ground
  as its halo.
- **Sound:** a synthesized tone, register 196·2^a Hz, rising in a major triad
  when v > 0.3, falling a semitone when v < −0.3, otherwise the dun-dun of a
  reveal; then the cry, voiced at rate 0.9 + 0.2·a and pitch 1 + 0.12·v. No
  asset files.

The accent colour of the lesson itself (buttons, the choice panel) is the
session theme's primary; the drama brings no brand colour of its own.

### Where the anchor goes

- **A cover beat opens every scene,** in the feeling's theme: its caption, its
  symbol and its lettering, entering with its motion. With sound on, the cover
  plays the tone and then the cry.
- **Every panel of the scene wears the feeling's theme** (ground, texture,
  edge) and carries its symbol beside the speaker.
- **A leaf closes on an ending panel** in the same theme.
- **Never on a choice.** The choice panel and the learner's chosen line stay in
  the session theme. A child scene's feeling first shows on the cover after the
  chosen line, so it is part of the consequence, revealed after the item is
  answered, and says nothing about any item still open (canon Prop. 9.4; it is
  a value of `p_reveal`, amendment 1). On a repair scene it signals the earlier
  miss, which the consequence scene has already shown.
- **Hangul first.** The caption is Korean, with its gloss one tap away; the cry
  is heard, in Korean.
- **Sound only after a tap.** It is off until the learner turns it on, plays
  once per scene, and never speaks over a line.

The prototypes these were settled on live in the user's design canvas
("Makjang phone prototypes"). They are reference, not source: the renderer is
built from this section.

## Where it lives

- **`@some-ui/makjang`** (new, framework-agnostic: no React): the story schema,
  the story audit and the engine, and from M2 the media port types. It
  imports nothing from topik, which the package boundary enforces; an import
  restriction on its engine module keeps media out of the engine.
- **`@some-ui/styles`** owns the feeling themes as presentation: the
  vocabulary's points, hues, textures and motions, the derivation and its
  contrast floor, tested against every session theme. Topik owns their words
  (captions, cries, lettering) and symbols, keyed by the same feeling keys.
- **`@some-ui/topik`** keeps the teaching: probes, the hint ladder, tiles, the
  teaching audit, the evaluation report, and the handheld renderer, which
  becomes a renderer of the engine. Topik depends on makjang, never the
  reverse. Only topik's handheld path (its renderer and its teaching audit)
  and the lesson CRM, which checks and saves the operator's batch of trees,
  import makjang. The desktop session (`DesktopSession`, the session
  machine) does not, and is not changed by any increment here.

M1 and M2 land in one pull request: a workspace nothing depends on is a
vestige from its first day (`CLAUDE.md`, "Vestiges").

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
    the other's.
  - The teaching audit's pruning, in topik. The media port types. Speaker
    names, choices as large text targets, consequence and repair scenes.
  - The handheld's conversation path goes: `core/lesson-track` and its tests
    are removed, after the helpers `core/probe-audit` and
    `core/lesson-survey` import from it (`anchorOf`, `isDeliverable`,
    `probeFingerprint`) move to `core/probe` or go with the code that no
    longer needs them. The wrap card loses "Conversation N of M" and the tally
    as its headline, and ends a lesson on how the scene resolved instead.
  - It is verified on pasted and served trees, and done when it passes the
    test above: on screen the learner follows characters through a scene,
    and no screen is framed as an exercise ("Check", "Question N", "N of M").
- **Later.** Media capabilities (per-character voices, generated art in a
  fixed style, portraits, video beats) each add assets and a renderer
  capability, plus a canon line, and change neither the story schema nor the
  engine. Longitudinal structure (a standing cast, series, memory across
  lessons) and a learner-defined genre do change the schema, and get their
  own design.

## Invariants to declare with M1

Design commitments, not yet invariants: there is no code for them to be true
of. They are declared in the house shape (`CLAUDE.md`, "Gray-area invariants")
in the change that adds the code, and enforced where they can be.

- **The engine imports no media and no topik.** Mechanical: the package
  boundary and an import restriction on the engine module.
- **Every tree is within its bounds.** Mechanical: the story audit, on every
  served or pasted lesson.
- **Every choice that is asked passes the teaching audit.** Mechanical, with a
  rejected choice pruned to a leaf.
- **A choice's outcome is its first choice, whatever follows, and an
  unreached choice has none.** Mechanical: a property test over every route
  of synthetic trees.
- **Every feeling theme clears the contrast floor on every session theme**
  (with M2). Mechanical: a test over the session themes × the vocabulary.
- **No feeling anchor sits on a choice or a chosen line** (with M2).
  Mechanical: a
  renderer test over every route of a synthetic tree.
- **A new rendition kind lands with its valuation.** Not mechanical: whether a
  picture or a face reveals the answer needs a person. Falsified by a change
  that adds a rendition kind to a renderer's capability set with no canon line
  saying what it reveals.
