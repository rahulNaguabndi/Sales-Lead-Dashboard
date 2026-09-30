import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null | undefined;

/** Shared client, created once and only when a credential is configured. */
export function getAiClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  client = apiKey ? new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 }) : null;
  return client;
}

export function resetAiClient(): void {
  client = undefined;
}
