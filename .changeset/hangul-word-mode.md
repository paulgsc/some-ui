---
"@some-ui/honeycomb": minor
---

Add multimodal word testing to the Hangul honeycomb game (epic #420): two new modes, `"vocabulary"` and `"vocabulary-endless"`, spawn multi-jamo word challenges cued by an icon (and, on struggle, TTS + romanization) instead of only a single jamo. Existing `"completion"`/`"endless"` single-jamo play is unaffected.

- A word challenge reserves multiple hex cells at once, each a masked placeholder until its jamo is typed in order, sharing one countdown.
- Backspace now corrects the in-progress key before it locks in.
- A masked-word feedback overlay tracks progress through the current word, with a "Celebrate" reveal on completion.
- A new corner-anchored Prompt/Concept Station overlay shows the active word's icon, escalating to TTS playback and a romanization caption the longer a player struggles.
- A 20-word seed vocabulary (`@honeycomb/data`) ships with the package - open-syllable words only, icon + TTS stimuli, no bundled images.
