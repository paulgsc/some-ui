// Poppler's `pdftotext` (or PDFTOTEXT_BIN), shared by the ATS and layout
// checks. `pdf` is a path, or the PDF's bytes, which go in on stdin (RP1).
import { execFileSync } from "node:child_process"

const extractor = process.env.PDFTOTEXT_BIN ?? "pdftotext"

export function pdftotext(flags, pdf, check) {
  const fromPath = typeof pdf === "string"
  try {
    return execFileSync(extractor, [...flags, fromPath ? pdf : "-", "-"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      ...(fromPath ? {} : { input: pdf }),
    })
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `The ${check} check requires \`pdftotext\` (Poppler). It is provided ` +
          "by the repo's nix shells; outside nix, install poppler-utils or " +
          "set PDFTOTEXT_BIN to a compatible executable.",
        { cause: error }
      )
    }
    throw error
  }
}
