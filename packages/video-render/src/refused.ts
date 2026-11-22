/** Stops a command, saying why; `runCommand` (`./node`) prints it and sets the exit code. */
export class Refused extends Error {}

export function fail(lines: ReadonlyArray<string>): never {
  throw new Refused(lines.join("\n"))
}
