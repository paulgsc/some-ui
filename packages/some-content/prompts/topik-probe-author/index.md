# Topik Probe Author

Prompt template for adding **morphism probes** to one existing topik lesson
file: an array of `ConversationBatch`, the shape `TopikFileSchema`
(`packages/ui/topik/src/lib/topik/entity/topik-types.ts`) validates. The output
is the same file with a `probes` array on each conversation, and nothing
else changed. Probes are the only checks the handheld (phone) lesson asks. A
conversation without them plays as listening alone (canon Cor. 4.5), so an
unprobed file is a lesson that never checks anything on a phone.

The pedagogy is fixed by the adaptive-learning canon
(`docs/canon/adaptive-learning-canon.typ`, v1.4, §4). Read Definitions 4.6
and 4.7, Proposition 4.2 and Remark 4.7 before generating. This prompt
restates them only as far as authoring needs.

---

## The governing rule: never ask what a line means

**A probe never asks for a translation.** "What does this mean?" is a
_first-order_ item (Def. 4.7), and Proposition 4.2 shows why it measures the
wrong thing. Its options differ in content words, so a learner who recognises
one noun picks the answer without parsing the predicate, its tense, its
politeness level or its polarity. The shipped item that proved it:

> 가사가 예뻐요: "The lyrics are pretty" / "The singer is pretty" / "The song
> is pretty" / "The melody is pretty". Recognising 가사 is enough; 예뻐요 is
> never read.

A probe asks instead whether a **relation** holds between the line and a
candidate, or asks the learner to build the candidate that stands in one.

- **Second order (structure):** is this the past tense, the negation, the
  question form, a paraphrase?
- **Third order (use):** is this a fitting reply, is it rude here, when would
  someone say it, why this politeness level?

### The one-noun test (required)

For every probe, ask: **could a learner who recognised only one content word
of the line answer it?** If yes, the probe is first-order in disguise. Do not
emit it. A structural probe passes this test by holding the content words
fixed across its candidates and varying only what the relation acts on:

```text
source      카드로 할게요.
past        카드로 했어요.        ← only the ending moves
negation    카드로 안 할게요.
question    카드로 할게요?        ← the invalid one: -ㄹ게요 has no question form
```

and never by swapping 카드 for 현금 while also changing the tense.

A third-order probe's candidates differ in content words by nature: replies
are different sentences. There the test reads: could the learner pick the
answer by matching one word of the line (an interrogative such as 어디 or 뭐
counts as a word) to one word of a candidate? Each wrong reply should need
the line's _function_ understood to reject it, not a keyword.

### A prompt names the task, never the line's meaning

The line's English is hidden until every probe on it is answered (canon
Cor. 4.4). A `prompt` that restates the line gives that English away before
the learner has earned it.

- Write "Turn this into a negative request", not "Ask them NOT to pack it".
- Write "Which reply fits?", not "The server asks what you'd like. Which reply
  fits?"
- Naming the speaker or the setting (the cashier, the server) is fine, since
  it is context rather than meaning.

---

## Usage Example Header

```
Lesson: [the lesson key - the file's name without .json]
Level: [beginner | intermediate | advanced - the manifest's difficulty]
Learner: [optional - grammar the learner is known to have, or to be missing]
T: [Apply Topik Probe Author v1.0]
```

followed by the lesson file's JSON. The generator returns the whole file,
JSON only, in one ` ```json ` block. It is saved over the original and
checked by a command, not read as prose.

Keep the input's formatting, and give the new `probes` arrays 2-space
indentation. The importer decides whether a lesson changed by its exact
bytes, so a file that is only reformatted is announced to learners as new
material.

---

## What you may and may not change

- **Add** a `probes` array to each conversation. Replace an existing one only
  when asked to.
- **Never change** `messages`, `questions`, conversation `id`s or their order.
  `questions` are the desktop quiz. Message `id`s are what probes and saved
  resume points anchor to (canon Thm. 1.1).
- **Probe ids are identity.** A learner's saved result is keyed by a probe's
  `id` together with a fingerprint of what it asks and what counts as right,
  within its conversation. So:
  - rewording a `why`, `label` or `explanation` keeps results;
  - changing candidates, validity, `target` or `acceptedAnswers` resets them,
    which is intended;
  - reusing an id for a different probe is never allowed.

---

## The relations

`relation` is one of `MORPHISM_RELATIONS`. The chip the learner sees is the
relation's label, unless `label` overrides it.

| relation     | chip         | order | a candidate is valid when...                                           |
| ------------ | ------------ | ----- | ---------------------------------------------------------------------- |
| `past`       | Past tense   | 2     | it is the line, in the past                                            |
| `future`     | Future       | 2     | it is the line, about the future (-ㄹ 거예요, -겠-)                    |
| `negation`   | Negation     | 2     | it negates the line, with the negation this sentence type takes        |
| `question`   | Question     | 2     | it is the line's question form, and that form exists                   |
| `paraphrase` | Same meaning | 2     | it says the same thing with different words or grammar                 |
| `register`   | Politeness   | 3     | it is the line at another politeness level, or explains the level used |
| `reply`      | Reply        | 3     | it is something the other speaker could felicitously say back          |
| `situation`  | Situation    | 3     | it describes when, where or to whom the line would be said             |
| `gloss`      | Meaning      | -     | it is what the line means                                              |

`situation` and `gloss` candidates are English prose, and so are
explanations of a form: set `"lang": "en"` on each. Every other candidate is
a Korean utterance.

`gloss` is allowed only as a **distractor or supporting candidate** inside a
structural probe. It is never the answer. A probe whose answer is a gloss is
first-order, and the checker rejects it.

**A probe's `order` is its answer's relation's order:**

- odd-one-out: the relation of the one invalid candidate;
- pick-valid: the relation of the one valid candidate;
- build: its `relation`.

---

## The three kinds

### `odd-one-out`: "Which is NOT a valid transformation?"

- 3–4 candidates, **exactly one invalid**.
- Each candidate claims a different relation where possible. The learner is
  judging a family of transformations at once, and the feedback teaches all
  of them.
- **The invalid one must be a real confusion**, not gibberish: the mistake a
  learner at this level actually makes. For example:

  - 안 on a request (안 주세요 for 주지 마세요);
  - a question form that does not exist (할게요?);
  - the wrong honorific direction;
  - a past tense built on the wrong stem.

  An invalid candidate that is simply ungrammatical noise tests nothing.

- Korean candidates are shown with their differences from the source
  highlighted, so hold the content words fixed. That is where the diff reads
  best, and it is what the one-noun test asks.
- Supporting candidates may use forms the conversation doesn't, such as -시겠어요? against a -세요 request, if a learner at this level can judge
  them. The _answer_ must concern grammar the line itself uses.

### `pick-valid`: "Which one fits?"

- 2–4 candidates, **exactly one `valid: true`**.
- **`valid` is the answer key.** In an odd-one-out it says whether the
  transformation holds. In a pick-valid it marks _the one candidate the prompt
  asks for_.
  - Prefer prompts that ask for the felicitous candidate ("Which reply
    fits?"). There the key and the relation agree.
  - A prompt may ask for the infelicitous one ("Which reply would be rude to
    the cashier?"). Then `valid: true` marks the rude candidate, and
    `relation` still names what every candidate is (`reply`).
  - Either way, each candidate's `why` states the pragmatic reason.
- Wrong candidates in a pick-valid each need a different reason to be wrong:
  the wrong speaker, the wrong moment, the wrong politeness level.
- This is where third-order probes live:
  - "Which reply fits?"
  - "Which reply would be rude to the cashier?"
  - "Why does the server say 드시고 and not 먹고?"
- A `situation` probe asks when the line would be said. Its candidates are
  settings in English: "a clerk, as a customer walks in"; "a guest, leaving
  a friend's home".

### `build`: "Make it negative" / "Say you already did"

- The learner assembles `target` from tiles (canon Def. 4.5).
- **Tiling:**
  - a multi-word target is tiled by word;
  - a single word is tiled by syllable and needs at least 2 Hangul syllables;
  - the board shows the target's tiles plus up to 3 of your distractors,
    8 tiles at most;
  - a target over 8 tiles on its own is left out on a phone. Keep targets
    short.
- `target` is written without final punctuation. List punctuated or spaced
  variants in `acceptedAnswers` (`"카드로 했어요."`).
- `distractors` are the confusions, authored: 안 and 못 against 마세요, 할게요
  against 했어요. Words from the source line make good distractors. Pieces of
  the target never do, because they are silently dropped.
- `target` must differ from `source`. If `source` contains the target, the
  source line is hidden and the `prompt` has to stand on its own.
- Always give `explanation`: one line on the rule the build exercises.
- A build's `relation` is structural (`past`, `future`, `negation`,
  `question`, `paraphrase`) or `register` ("make it more polite"). A reply or
  a situation is chosen, not built, and a gloss is never asked.

---

## Field rules

- **`id`:** kebab-case and unique within the file. Prefix it with `c` and the
  conversation's numeric `id` (`c3-reply`, `c3-build-past`) so ids from
  different conversations can't collide. The lesson itself only needs ids to
  be unique within a conversation, and that is what the checker enforces.
- **`anchorMessageId`:** always set it, to the `id` of the line the probe is
  about. The probe is asked right after that line. An unknown id silently
  moves it to the end of the conversation.
- **`source`:** omit it to test the whole anchor line. Set it to probe one
  clause of a longer line, e.g. `"카드로 할게요."` out of
  `"카드로 할게요. 감사합니다."`.
- **`prompt`:** one short sentence, in English, addressed to the learner.
- **`why`:** required on **every** candidate, valid or not, in one line.
  - After answering, the learner sees every candidate with its verdict and
    its `why`; a blank one is a blank line of feedback.
  - Say the rule, not "this is wrong".
  - Keep it under ~110 characters: it is read on a phone.
- **`explanation`:** optional for choice probes, expected for builds.

---

## Coverage

- **1–3 probes per conversation.** Probe the lines that carry structure worth
  judging: a request, a promise, an honorific, a tense, a negation, a reply
  that depends on who is speaking. Do not probe every line.
- Mix kinds within a lesson. Where the dialogue allows, each conversation
  gets at least one third-order probe.
- Two probes on the same line are fine. The line's English stays hidden until
  both are answered.
- Match the level. At `beginner`, stay with the -요 and -습니다 endings,
  안 and -지 마세요, the -았/었- past, -ㄹ게요 and -ㄹ까요, and the everyday
  honorific verbs. Do not probe grammar the conversation itself does not
  use.

---

## Schema (`packages/ui/topik/src/lib/topik/entity/topik-types.ts`: read it at generation time; this is a snapshot)

```ts
type ProbeOption = {
  text: string // a Korean utterance, or English prose with lang: "en"
  relation: MorphismRelation
  label?: string // overrides the chip ("More polite")
  valid: boolean
  why: string
  lang?: "ko" | "en" // default "ko"
}

type ProbeBase = {
  id: string
  order: 2 | 3
  anchorMessageId?: string // always set it
  source?: string // defaults to the anchor line's Korean
  prompt: string
  explanation?: string
}

type Probe =
  | (ProbeBase & { kind: "odd-one-out"; options: ProbeOption[] }) // ≥3, exactly one invalid
  | (ProbeBase & { kind: "pick-valid"; options: ProbeOption[] }) // ≥2, exactly one valid
  | (ProbeBase & {
      kind: "build"
      relation: MorphismRelation
      target: string
      acceptedAnswers?: string[]
      distractors?: string[]
    })
```

A probe that breaks this schema is **dropped at load without an error**, so
the file still loads and simply asks less. The checker below is what catches
it.

---

## Worked example

From `packages/ui/topik/src/components/topik/handheld/handheld-lesson/fixture.ts`,
which holds one probe of every kind.

```json
{
  "id": "c1-request-forms",
  "kind": "odd-one-out",
  "order": 2,
  "anchorMessageId": "c1-m2",
  "prompt": "Which is NOT a valid transformation of this request?",
  "options": [
    {
      "text": "아이스 아메리카노 한 잔 부탁해요.",
      "relation": "paraphrase",
      "valid": true,
      "why": "부탁해요 (I ask it of you) is another polite way to request."
    },
    {
      "text": "아이스 아메리카노 한 잔 주시겠어요?",
      "relation": "register",
      "label": "More polite",
      "valid": true,
      "why": "-시겠어요? softens the request into a deferential question."
    },
    {
      "text": "아이스 아메리카노 한 잔 안 주세요.",
      "relation": "negation",
      "valid": false,
      "why": "안 cannot negate a request. Asking someone not to do something takes -지 마세요: 주지 마세요."
    },
    {
      "text": "아이스 아메리카노 한 잔 주실 수 있어요?",
      "relation": "question",
      "valid": true,
      "why": "-(으)ㄹ 수 있어요? asks whether they can - a request put as a question."
    }
  ]
}
```

The invalid candidate is order 2 (negation), so the probe is order 2. The
register candidate is valid and only supports it. Every candidate keeps
아이스 아메리카노 한 잔, so no noun gives the answer away.

---

## Rejected examples, with reasons

**Rejected #1: a translation question in a probe's clothing.**

```json
{
  "kind": "pick-valid",
  "prompt": "What does 가사가 예뻐요 mean?",
  "options": [
    { "text": "The lyrics are pretty", "relation": "gloss", "valid": true },
    { "text": "The singer is pretty", "relation": "gloss", "valid": false }
  ]
}
```

Its answer is a gloss, which makes it first-order and fails the one-noun
test (Prop. 4.2). A probe on this line holds 가사 and varies 예뻐요 instead:
예뻤어요 (past), 안 예뻐요 (negation), 예쁘세요 (politeness).

**Rejected #2: a "past tense" that changes the content words too.**

```json
{ "text": "현금으로 드렸습니다.", "relation": "past", "valid": true }
```

This is a past tense of _a different sentence_: card became cash, 하다 became
드리다, and the politeness level moved as well. The learner can't tell which
change the relation made, and the diff is too large to show. Write 카드로
했어요.

**Rejected #3: an invalid candidate that is merely broken.**

```json
{ "text": "카드로 할했요.", "relation": "past", "valid": false }
```

No learner writes this, so rejecting it teaches nothing. The invalid
candidate has to be the plausible mistake: 카드로 할게요? as a question, whose
`why` says that -ㄹ게요 has no question form.

**Rejected #4: a build with nothing to build.**

```json
{ "kind": "build", "relation": "negation", "target": "안" }
```

One syllable cannot be tiled, so the probe is left out on a phone. A negation
build targets the whole negated predicate (포장하지 마세요), with 안 and 못 as
distractors.

---

## Self-check list

`[checkable]` items are enforced by `pnpm check:topik-probes <file>`, which
runs the lesson's own functions over the file. Run it; do not tick these by
eye. `[judgment]` items are for the reviewer.

- [checkable] Every probe passes the schema, so none is dropped at load.
- [checkable] Every `anchorMessageId` names a line of its own conversation.
- [checkable] Ids are unique within each conversation.
- [checkable] No probe's answer is a `gloss`.
- [checkable] `order` matches the answer's relation.
- [checkable] Every candidate has a non-blank `why`, and no candidate repeats.
- [checkable] Structural Korean candidates stay close enough to the source for
  their diff to show (similarity ≥ 0.45). The checker warns when one rewrites
  more than its relation acts on.
- [checkable] Every build target tiles into 2–8 pieces and differs from its
  source. No distractor is a piece of the target.
- [checkable] Every conversation has at least one probe (a warning, not an
  error, when a conversation genuinely has nothing to probe).
- [judgment] Every probe passes the one-noun test.
- [judgment] No `prompt` restates the line's meaning.
- [judgment] Every `valid` flag is actually true of the Korean. This is the
  whole of grading (Rem. 4.7): a wrong flag is taught as right.
- [judgment] Each invalid candidate is a real learner confusion, and its `why`
  names the rule.
- [judgment] Wrong replies are wrong for different reasons.
- [judgment] The grammar probed is grammar the conversation uses, at the
  lesson's level.

---

## After Generating

1. **Save** the file over `packages/some-content/public/topiks/<lesson>.json`.
   That directory is the lesson corpus's authoring copy: gitignored, local,
   and created by hand if it isn't there. It is not served; it is the
   importer's input, and its `manifest.json` has to list the lesson (an
   existing lesson already is).
2. **Check** it, and fix every error before going on:

   ```sh
   pnpm check:topik-probes packages/some-content/public/topiks/<lesson>.json
   ```

3. **Review** the `[judgment]` items above. The checker proves the file is
   delivered as written, not that the Korean is right. Reject a plausible but
   wrong probe rather than import it.
4. **Import** it into `file_host`, dry run first:

   ```sh
   # from a paulgsc/server checkout
   DATABASE_URL=sqlite:///path/to/file_host.db \
     cargo run -q --bin import-curriculum -- \
     /path/to/some-ui/packages/some-content/public/topiks --dry-run
   ```

   Then run it again without `--dry-run`. The importer reads the directory's
   `manifest.json` and one `<key>.json` per lesson. It is idempotent and
   decides "changed" by content hash, so a lesson that gained probes is
   imported as changed content, and the study nudge announces it as new
   material.

5. On a phone-sized window, open the lesson and answer one probe of each
   kind. The feedback screen lists every candidate with its `why`, which is
   the fastest way to see a wrong flag.

---

## Versioning

**`v1.0`.** First version, written against canon v1.4 (Def. 4.6, 4.7,
Prop. 4.2, Rem. 4.7, Cor. 4.5) and the probe schema `@some-ui/topik` shipped in
#1546. It adds probes to existing lessons and does not generate
conversations.
