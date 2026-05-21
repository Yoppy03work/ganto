/**
 * Parse @mentions from free text and resolve them to project members.
 *
 * Matching is intentionally forgiving since we don't have a structured mention
 * picker yet: an `@token` matches a member when the token (lowercased) equals
 * or prefixes either:
 *   - the member's display name with spaces removed ("Alice Smith" → "alicesmith")
 *   - the member's email local part ("alice@x.com" → "alice")
 *
 * Pure function — no DB. Returns the unique set of matched user ids.
 */
export type MentionableMember = {
  userId: string;
  name: string;
  email: string;
};

export function parseMentions(
  body: string,
  members: MentionableMember[]
): string[] {
  // Grab @tokens: letters, digits, dot, underscore, hyphen.
  const tokens = Array.from(body.matchAll(/@([a-zA-Z0-9._-]{2,40})/g)).map((m) =>
    m[1].toLowerCase()
  );
  if (tokens.length === 0) return [];

  const matched = new Set<string>();
  for (const token of tokens) {
    for (const m of members) {
      const nameKey = m.name.toLowerCase().replace(/\s+/g, "");
      const emailLocal = m.email.toLowerCase().split("@")[0] ?? "";
      if (
        nameKey === token ||
        nameKey.startsWith(token) ||
        emailLocal === token
      ) {
        matched.add(m.userId);
      }
    }
  }
  return Array.from(matched);
}
