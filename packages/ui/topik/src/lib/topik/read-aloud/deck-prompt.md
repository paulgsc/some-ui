# Read-Aloud Deck Generator

You are generating a **read-aloud deck** for a Korean reading drill on a
phone. The learner sees a word or a sentence in Hangul, reads it aloud, then
hears it spoken, repeats it, and only then sees what it means. The deck is the
material: words, and graded sentences built from them. Return the deck as
JSON (see **Output**), and nothing else.

The drill does not quiz. It never asks what anything means; it shows the
meaning last. What it needs from you is Korean that is natural at its level,
words named consistently, and three facts about every written form that no
program can reliably work out on its own: which word it is, where its stem
ends, and how it is actually pronounced.

---

## The deck

A deck names its **words** once and lists its **lines**. Every line names
every word it uses, in reading order, as that word is written in the line.

```ts
{
  schemaVersion: 1
  id: string // kebab-case ASCII, e.g. "everyday-2"
  title: string // short, human-readable
  words: Array<{
    id: string // kebab-case ASCII, stable, e.g. "deurida"
    lemma: string // the dictionary form, in Hangul: 드리다
    gloss: string // the dictionary form's meaning, as short as it honestly is
  }>
  lines: Array<{
    id: string // kebab-case ASCII, unique in the deck
    level: 1 | 2 | 3
    korean: string // the sentence, with its punctuation
    english: string // a natural translation, not word by word
    words: Array<{
      wordId: string // a word id from `words`
      surface: string // the form exactly as written in `korean`: 드릴까요
      stemEnd: number // how many syllables of `surface` belong to the stem
      pronunciation?: string // only when it differs from `surface`
      sense?: string // what this form means here, when the gloss is not enough
    }>
  }>
}
```

## The rules

**Ids are identity.** A word's `id` is chosen once and never derived from how
it is displayed. Use its romanised dictionary form (`deurida`, `saram`), and
add a disambiguating suffix for homonyms (`bae-pear`, `bae-ship`). Two
different words never share an id, and one word never has two.

**Words are dictionary forms.** 드릴까요, 드려요 and 드리고 are all the word
`deurida` (드리다). Particles and endings are not words in the deck: 커피를 is
the word `keopi`, written with 를. A number written as one run of syllables
(사천오백) is one word.

**Every word in a line is listed, in order.** List each word the line uses,
in the order it is read. A `surface` must appear in `korean` exactly as
written, after the previous one. Particles attached to a word stay in its
`surface` (커피를, not 커피).

**`stemEnd` marks where the stem ends.** Count the syllables of `surface`
that carry the word itself; the rest is its ending. 드릴까요 is 드릴 + 까요,
so `stemEnd` is 2. 커피를 is 커피 + 를: 2. When the stem and an ending merge
into one syllable, that syllable counts as stem: 마셔요 (마시 + 어요) is 마셔 +
요, so 2; 할게요 (하 + ㄹ게요) is 할 + 게요, so 1; 감사합니다 (감사하 + ㅂ니다) is
감사합 + 니다, so 3. A form with no ending (사람, 아메리카노), or whose ending
has merged entirely into the stem (포장해), has `stemEnd` equal to its
syllable count.

**`pronunciation` is given only when the sound differs from the spelling, and
has exactly as many syllables as `surface`.** Write it in Hangul, syllable for
syllable. Pronounce the form **as it is said in this line**: 거예요 after 볼 is
꺼예요, and on its own is not. The standard changes to look for:

| Change                                | Written     | Said       |
| ------------------------------------- | ----------- | ---------- |
| Final consonant carried to next vowel | 주말에      | 주마레     |
| Nasalisation before ㄴ/ㅁ             | 감사합니다  | 감사함니다 |
| Tensing                               | 식당은      | 식땅은     |
| Tensing after the -ㄹ modifier        | (볼) 거예요 | 꺼예요     |
| Palatalisation                        | 같이        | 가치       |
| ㅎ merging with a consonant           | 따뜻한      | 따뜨탄     |
| Silent ㅎ before a vowel              | 많아요      | 마나요     |
| 져/쪄/쳐 said as 저/쩌/처             | 추워져서    | 추워저서   |
| Compound tensing (사이시옷 sound)     | 점심시간    | 점심씨간   |

Leave `pronunciation` out when nothing changes. Do not use it for loanword
spelling or for your own accent.

**Levels set length and grammar, not topic.**

| Level | Sentence length       | Grammar                                                            |
| ----- | --------------------- | ------------------------------------------------------------------ |
| 1     | about 5–15 syllables  | polite -아요/-어요, -세요, -(으)ㄹ게요, basic particles            |
| 2     | about 10–25 syllables | clause linking (-아서, -고, -(으)니까), -(으)ㄹ 거예요, past tense |
| 3     | about 20–40 syllables | several clauses, modifiers (-는, -(으)ㄴ), -아지다, -게 되다       |

Use vocabulary a learner at the level is expected to meet. Keep the grammar
around a new word easier than the word itself.

**`sense` is for inflected meaning.** The word's `gloss` is its dictionary
meaning (주다: give). When a form means something the gloss does not say
(주세요: please give me), give `sense`. Keep both short.

## Before you answer

Check each line against these, and fix it rather than explaining:

1. Every `surface` appears in `korean`, in order.
2. Every `wordId` is in `words`, and every word is used by some line.
3. `stemEnd` is between 1 and the syllable count of `surface`.
4. Every `pronunciation` has the same number of syllables as its `surface`,
   and differs from it.
5. Levels match the length and grammar table.

The app checks these too. A line, word or occurrence that fails is dropped,
and a pronunciation that does not line up is ignored, so an error costs
material, not the deck.

## Output

One JSON object, the deck, in a single ```json block. No prose before or
after it, no comments, no trailing commas.

## A worked line

```json
{
  "id": "cafe-price",
  "level": 1,
  "korean": "사천오백 원입니다.",
  "english": "That's 4,500 won.",
  "words": [
    {
      "wordId": "sacheon-obaek",
      "surface": "사천오백",
      "stemEnd": 4,
      "pronunciation": "사처노백"
    },
    {
      "wordId": "won",
      "surface": "원입니다",
      "stemEnd": 1,
      "pronunciation": "워님니다",
      "sense": "it's … won"
    }
  ]
}
```

The bundled starter deck (`src/lib/topik/read-aloud/starter`) is a complete,
checked example of the whole format.
