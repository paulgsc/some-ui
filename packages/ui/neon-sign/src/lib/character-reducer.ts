export type Character = {
  char: string
  x: number
  y: number
  speed: number
}

export const CHAR_SET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?"

const randomCharacter = (): string =>
  CHAR_SET[Math.floor(Math.random() * CHAR_SET.length)] ?? "A"

export const buildCharacters = (count: number): Array<Character> =>
  Array.from({ length: count }, () => ({
    char: randomCharacter(),
    x: Math.random() * 100,
    y: Math.random() * 100,
    speed: 0.1 + Math.random() * 0.3,
  }))

export type CharacterAction =
  | {
      type: "reset"
      count: number
    }
  | {
      type: "tick"
    }

export const characterReducer = (
  state: Array<Character>,
  action: CharacterAction
): Array<Character> => {
  const { type: t } = action
  switch (t) {
    case "reset": {
      return buildCharacters(action.count)
    }

    case "tick": {
      return state.map((character) =>
        character.y < 100
          ? {
              ...character,
              y: character.y + character.speed,
            }
          : {
              ...character,
              y: -5,
              x: Math.random() * 100,
              char: randomCharacter(),
            }
      )
    }

    /* eslint-disable switch-lint/require-fail-fast-default */
    default: {
      t satisfies never
      return state
    }
  }
}
