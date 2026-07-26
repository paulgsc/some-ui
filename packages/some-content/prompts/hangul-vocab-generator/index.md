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

## Decomposition: Batchim Is Fine, Compound Batchim Needs One Extra Step

**There is no open-syllable restriction. Batchim (받침, final consonants)
decompose and play correctly** - the game engine has no concept of syllable
position at all; it just matches an ordered list of jamo tokens against
typed input, and a batchim jamo is matched the exact same way an onset jamo
is. (This is empirically verified, not just asserted - see
`batchim_word_completes_like_any_other_multi_token_challenge` in
`crates/hangul-game-core/src/internal/engine.rs`.) Do not avoid batchim
words or prefer loanwords to route around them - decompose the whole word,
in reading order, every jamo including any batchim.

- 사람 (saram, "person") -> ㅅ, ㅏ, ㄹ, ㅏ, ㅁ -> keys `t`, `k`, `f`, `k`, `a`
- 달 (dal, "moon") -> ㄷ, ㅏ, ㄹ -> keys `e`, `k`, `f`

**The one real wrinkle: compound batchim.** Eleven jamo characters
(ㄳ/ㄵ/ㄶ/ㄺ/ㄻ/ㄼ/ㄽ/ㄾ/ㄿ/ㅀ/ㅄ) are themselves a fusion of two basic
consonants and have no entry in the engine's key-mapping table as a single
character. Represent one as **one glyph slot with its two component keys
concatenated** - the exact same convention the mapping table below already
uses for composite vowels (ㅘ is one glyph, key `hk`):

- 닭 (dalg, "chicken") -> ㄷ, ㅏ, ㄺ -> keys `e`, `k`, `fr` (ㄺ = ㄹ`f` + ㄱ`r`)
- 값 (gap, "price") -> ㄱ, ㅏ, ㅄ -> keys `r`, `k`, `qt` (ㅄ = ㅂ`q` + ㅅ`t`)

This is also empirically verified end to end, not inferred - see
`compound_batchim_as_one_glyph_with_a_combined_key_completes_too`, same
file. If a topic's most natural word has a compound batchim, use it; don't
substitute a less natural word to avoid this.

---

## Dubeolsik (두벌식) QWERTY Mapping Table

Use this table to derive `answerKeys`/`answerGlyphs` - decompose the whole
word into its individual jamo, in reading order (every consonant and vowel a
syllable block contains, including any batchim), then look each one up here.
The table is position-agnostic: the same row applies whether a consonant is
a syllable's onset or its batchim. This is the same table
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
entries as additional worked examples if any of the above is ambiguous. That
seed happens to be all open-syllable words, but that reflects when it was
written, not a real constraint - see "Decomposition" above.

---

## Worked Examples

Word: 포도 ("grape") - no batchim, for the basic case:

| Block | Jamo, in order | answerKeys | answerGlyphs |
| ----- | -------------- | ---------- | ------------ |
| 포    | ㅍ (v), ㅗ (h) | `v`, `h`   | `ㅍ`, `ㅗ`   |
| 도    | ㄷ (e), ㅗ (h) | `e`, `h`   | `ㄷ`, `ㅗ`   |

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

Word: 달 ("moon") - a single batchim, decomposed like any other jamo:

| Block | Jamo, in order         | answerKeys    | answerGlyphs     |
| ----- | ---------------------- | ------------- | ---------------- |
| 달    | ㄷ (e), ㅏ (k), ㄹ (f) | `e`, `k`, `f` | `ㄷ`, `ㅏ`, `ㄹ` |

```json
{
  "id": "moon",
  "word": "달",
  "romanization": "dal",
  "answerKeys": ["e", "k", "f"],
  "answerGlyphs": ["ㄷ", "ㅏ", "ㄹ"],
  "icon": "🌙",
  "ttsText": "달",
  "category": "nature"
}
```

Diphthong vowels (ㅘ, ㅙ, ㅚ, ㅝ, ㅞ, ㅟ, ㅢ) are still **one** array slot
each, even though their QWERTY token is two characters (`hk`, `nj`, ...) -
one token/glyph pair per jamo, not per keystroke. Compound batchim
(ㄳ/ㄵ/ㄶ/ㄺ/ㄻ/ㄼ/ㄽ/ㄾ/ㄿ/ㅀ/ㅄ) follow the identical pattern: one glyph
slot, its two component consonants' keys concatenated (see "Decomposition"
above).

---

## Self-Check Before Returning the File

- [ ] Every word is fully decomposed into its jamo, in reading order, including any batchim
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
