# Topik Lesson Generator

The prompt itself lives in the app: `@some-ui/topik`,
[`src/lib/topik/generation/lesson-prompt.md`](../../../ui/topik/src/lib/topik/generation/lesson-prompt.md).
The phone lesson assembles it with the learner's level, scene and survey
digest, and checks the lesson pasted back. It lives there, not here, because
the app provides the grammar a learner prompts their own model with (canon
Rem. 4.8 and the v1.7 loop). This file keeps only what is for developers.

## Using it outside the app

- Copy `lesson-prompt.md`, append a request block:

  ```
  ## This request

  Level: 2
  Scene: the fiancée meets his mother
  Conversations: 3
  ```

  and give it to any model.

- Check the lesson it returns before using it:

  ```sh
  pnpm check:topik-probes path/to/lesson.json
  ```

  This runs the same checker the app runs on a pasted lesson
  (`core/probe-audit`). It reports each probe that would be dropped,
  anchored to the wrong line, or left out on a phone. At runtime those
  failures are silent.

## Trials

The probe rules were trialled three times by agents that saw only the
prompt. Each produced a lesson that passed the checker on the first run, and
each review was folded into the prompt. The trials are recorded in this
file's git history.
