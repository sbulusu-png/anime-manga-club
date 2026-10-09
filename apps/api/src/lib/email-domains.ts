/**
 * Reserved for documentation and tests (RFC 2606), so it can never belong to a real
 * person. Allowed outside production only, for test accounts.
 */
export const TEST_EMAIL_DOMAIN = "example.com";

/**
 * True when the address is at one of `domains` or a subdomain of one
 * ("a@uni.edu", "a@students.uni.edu"), but not a lookalike ("a@notuni.edu").
 */
export function isAllowedEmail(email: string, domains: readonly string[]): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/** "uni.edu or uni.ac.in", for messages. Test-only domains aren't advertised. */
export function describeDomains(domains: readonly string[]): string {
  const shown = domains.filter((d) => d !== TEST_EMAIL_DOMAIN);
  if (shown.length <= 1) return shown[0] ?? "";
  return `${shown.slice(0, -1).join(", ")} or ${shown.at(-1) ?? ""}`;
}

export function emailNotAllowedMessage(domains: readonly string[]): string {
  const shown = describeDomains(domains);
  return `That's not a valid email for the club. Use your university email${shown ? ` (ending in ${shown})` : ""}.`;
}
