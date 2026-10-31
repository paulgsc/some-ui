/**
 * Lowercase hex SHA-256 of `data`, text as its UTF-8 bytes: home's content
 * hash (`file_host`) and the hash a Studio take is shared under.
 */
export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    typeof data === "string" ? new TextEncoder().encode(data) : data
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}
