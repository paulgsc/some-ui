export const getAcronymFromString = (str: string): string =>
  (str.trim().match(/\b(\w)/g) ?? [""]).join("").toUpperCase()
