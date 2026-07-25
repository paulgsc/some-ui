# Hangul Vocab Generator

Prompt template for generating a `HangulHexGrid` challenge-seed file: a
TOPIK 1/2-level vocabulary set on one topic (numbers, calendar, household
items, colors, family, ...), used in place of the bundled demo seed when
running `apps/www` against `localhost` or Docker (see
`apps/www/src/lib/hangul-vocab`). Not used by the GitHub Pages build, which
always plays the bundled demo seed instead.

---

## Usage Example Header

```
Topic: [TOPIK 1/2 topic, e.g. "numbers", "calendar", "household items"]
Count: [how many words, e.g. 8]
T: [Apply Hangul Vocab Generator v1.0]
```

The generator then produces one JSON array following the schema and
constraints below, and nothing else - no prose, no markdown fences beyond
the single ```json block, no comments or trailing commas (this is parsed as
plain JSON, not JSON5).

---

## Output Destination

Write the result to:

```
packages/some-content/public/hangul/words/vocab.json
```

This path is gitignored (`packages/**/public` in the repo root's
`.gitignore`) - it is expected to be regenerated locally, never committed.
Overwrite the whole file each time; there is currently one active file, not
one per topic (see "Multiple topics" below).

---

## Schema

Each array element (a `WordEntry`) must match exactly:

```ts
{
  id: string          // stable slug, kebab-case ASCII, unique within the file
  word: string         // the Hangul word, e.g. "사과"
  romanization: string // revised romanization, e.g. "sagwa"
  answerKeys: string[]   // one dubeolsik QWERTY token per glyph, in order
  answerGlyphs: string[] // one jamo glyph per token, in order - same length as answerKeys
  icon: string         // a single Unicode emoji - no bundled image asset (provenance discipline, ADR 0001 §5)
  ttsText: string      // usually == word; spoken via the Web Speech API at runtime
  category: string     // free-form topic label, e.g. "numbers" - not a closed enum
}
```

The file itself is a JSON array of these, with **at least one entry**.

---

## Hard Constraint: Open-Syllable Words Only

**This is the constraint most likely to be violated, and a violation silently
produces an unplayable word - read this section before generating anything.**

The game engine (`Korean::key_for`,
`crates/hangul-game-core/src/internal/content_domain/korean.rs`) maps
**only** the 19 lead consonants and 21 vowels to QWERTY keys. It has **no
mapping for batchim (받침, final/trailing consonants)**. Every syllable
block in every word must therefore be exactly **lead consonant + vowel**,
nothing after the vowel.

- ✅ 사과 (ㅅ+ㅏ, ㄱ+ㅘ) - two blocks, each lead+vowel only
- ✅ 우유 (ㅇ+ㅜ, ㅇ+ㅠ)
- ❌ 사람 (ㅅ+ㅏ, ㄹ+ㅏ+**ㅁ**) - final ㅁ has no key mapping
- ❌ 하나**둘** (둘 = ㄷ+ㅜ+**ㄹ**) - final ㄹ has no key mapping

This rules out a large fraction of "natural" vocabulary in almost every
topic - e.g. most native-Korean counting words (둘, 셋, 넷, 다섯, ...) and
most Sino-Korean tens (십, 이십, 삼십, ...) have batchim and are **not**
usable as-is. Do not force a topic's canonical word list; select only the
subset of words for that topic that happen to be open-syllable, and prefer
loanwords/simpler forms where they help (e.g. 커피 for "coffee" over a
batchim-bearing native alternative). A shorter, fully-valid list is strictly
better than a longer list with unplayable entries.

If a topic genuinely has too few open-syllable words to reach the requested
count, generate fewer and say so in one line before the JSON block, rather
than including a batchim word to hit the count.

---

## Dubeolsik (두벌식) QWERTY Mapping Table

Use this table to derive `answerKeys`/`answerGlyphs` - decompose each
syllable block into its lead consonant and vowel, then look each up here, in
the order they appear in the word (consonant, then vowel, per block, left to
right through the whole word). This is the same table
`packages/ui/honeycomb/src/utils/hangul-keyboard-mapping` uses at runtime -
keep this list in sync with that file if it ever changes.

**Consonants (자음)**

| QWERTY | Hangul | Romanization |
| ------ | ------ | ------------ |
| r      | ㄱ     | g/k          |
| R      | ㄲ     | kk           |
| s      | ㄴ     | n            |
| e      | ㄷ     | d/t          |
| E      | ㄸ     | tt           |
| f      | ㄹ     | r/l          |
| a      | ㅁ     | m            |
| q      | ㅂ     | b/p          |
| Q      | ㅃ     | pp           |
| t      | ㅅ     | s            |
| T      | ㅆ     | ss           |
| d      | ㅇ     | ng           |
| w      | ㅈ     | j            |
| W      | ㅉ     | jj           |
| c      | ㅊ     | ch           |
| z      | ㅋ     | k            |
| x      | ㅌ     | t            |
| v      | ㅍ     | p            |
| g      | ㅎ     | h            |

**Vowels (모음)**

| QWERTY | Hangul | Romanization |
| ------ | ------ | ------------ |
| k      | ㅏ     | a            |
| o      | ㅐ     | ae           |
| i      | ㅑ     | ya           |
| O      | ㅒ     | yae          |
| j      | ㅓ     | eo           |
| p      | ㅔ     | e            |
| u      | ㅕ     | yeo          |
| P      | ㅖ     | ye           |
| h      | ㅗ     | o            |
| hk     | ㅘ     | wa           |
| ho     | ㅙ     | wae          |
| hl     | ㅚ     | oe           |
| y      | ㅛ     | yo           |
| n      | ㅜ     | u            |
| nj     | ㅝ     | wo           |
| np     | ㅞ     | we           |
| nl     | ㅟ     | wi           |
| b      | ㅠ     | yu           |
| m      | ㅡ     | eu           |
| ml     | ㅢ     | ui           |
| l      | ㅣ     | i            |

Every entry above is a real, verified `WordEntry` from the bundled demo
seed (`packages/ui/honeycomb/src/data/hangul-words.ts`) - use those 20
entries as additional worked examples if any of the above is ambiguous.

---

## Worked Example

Word: 포도 ("grape")

| Block | Lead consonant | Vowel  | answerKeys | answerGlyphs |
| ----- | -------------- | ------ | ---------- | ------------ |
| 포    | ㅍ (v)         | ㅗ (h) | `v`, `h`   | `ㅍ`, `ㅗ`   |
| 도    | ㄷ (e)         | ㅗ (h) | `e`, `h`   | `ㄷ`, `ㅗ`   |

```json
{
  "id": "grape",
  "word": "포도",
  "romanization": "podo",
  "answerKeys": ["v", "h", "e", "h"],
  "answerGlyphs": ["ㅍ", "ㅗ", "ㄷ", "ㅗ"],
  "icon": "🍇",
  "ttsText": "포도",
  "category": "food"
}
```

Diphthong vowels (ㅘ, ㅙ, ㅚ, ㅝ, ㅞ, ㅟ, ㅢ) are still **one** array slot
each, even though their QWERTY token is two characters (`hk`, `nj`, ...) -
one token/glyph pair per jamo, not per keystroke.

---

## Self-Check Before Returning the File

- [ ] Every syllable block in every word is lead-consonant + vowel only - no batchim, anywhere
- [ ] `answerKeys.length === answerGlyphs.length` for every entry
- [ ] Every `answerKeys`/`answerGlyphs` pair was derived from the mapping table above, block by block, left to right
- [ ] Every `id` is unique, kebab-case, ASCII
- [ ] Every `icon` is exactly one Unicode emoji, no bundled/attributed image
- [ ] `ttsText` is the Korean word (not romanization, not English)
- [ ] `category` is the topic string, e.g. `"numbers"`, not one of the demo set's `"food"/"animal"/"object"/"nature"` labels unless the topic actually is one of those
- [ ] Output is a bare JSON array - no comments, no trailing commas, no surrounding prose

---

## Multiple Topics (Forward-Looking, Not Today's Shape)

`useHangulVocab` already accepts a `topic` parameter and resolves it to
`/hangul/words/<topic>.json`, but every caller today omits it and gets the
default `vocab.json`. To generate a second topic without overwriting the
first, save it as `packages/some-content/public/hangul/words/<topic>.json`
instead (e.g. `numbers.json`) - the file will simply sit unused until a host
app actually threads a `topic` value through to `useHangulVocab`, which is
out of scope for this stub.

---

## After Generating

- **Docker** (`docker compose up www`): picked up automatically, nothing to
  run - `infra/compose/www.yml` volume-mounts
  `packages/some-content/public/hangul` straight through.
- **`vite dev` (no Docker)**: run `pnpm run content:link` once (from
  `apps/www`) to symlink `packages/some-content/public/hangul` into
  `apps/www/public/hangul`.
- Either way, a **full browser reload** (not just an in-app navigation) is
  needed to see a freshly (re)generated file - the query client caches a
  successful fetch for a while and won't refetch on remount.
- If nothing shows up, open devtools: a 404 falls back to the bundled demo
  seed silently (expected before you've generated anything); anything else
  logs a `[hangul-vocab]` console warning.
