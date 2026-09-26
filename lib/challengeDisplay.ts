/** Display title with optional leading emoji. */
export function challengeHeading(c: {
  emoji?: string | null;
  title: string;
}): string {
  const emoji = c.emoji?.trim();
  return emoji ? `${emoji} ${c.title}` : c.title;
}
