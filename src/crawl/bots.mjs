// The crawlers this site makes an explicit decision about. Names and behaviour change,
// so treat vendor documentation as the source of truth and update this list with it:
//   OpenAI:  https://platform.openai.com/docs/bots
//   Google:  https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers

export const PURPOSES = {
  engine: {
    title: 'Classic search engines',
    summary: 'Crawl and index pages for ordinary search results.',
  },
  search: {
    title: 'AI search and retrieval crawlers',
    summary: 'Index pages so an AI assistant can find and cite them in answers.',
  },
  'user-fetch': {
    title: 'User-triggered fetchers',
    summary: 'Fetch one page at the moment a person asks an assistant about it.',
  },
  training: {
    title: 'Model-training crawlers',
    summary: 'Collect content to train models. Blocking these does not remove a site from AI search.',
  },
};

/**
 * `robotsOnly` tokens are robots.txt controls that never appear as a user agent in server logs.
 */
export const BOTS = [
  { token: 'Googlebot', operator: 'Google', purpose: 'engine' },
  { token: 'Bingbot', operator: 'Microsoft', purpose: 'engine' },
  { token: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search' },
  { token: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search' },
  { token: 'PerplexityBot', operator: 'Perplexity', purpose: 'search' },
  { token: 'ChatGPT-User', operator: 'OpenAI', purpose: 'user-fetch' },
  { token: 'Claude-User', operator: 'Anthropic', purpose: 'user-fetch' },
  { token: 'Perplexity-User', operator: 'Perplexity', purpose: 'user-fetch' },
  { token: 'GPTBot', operator: 'OpenAI', purpose: 'training' },
  { token: 'ClaudeBot', operator: 'Anthropic', purpose: 'training' },
  { token: 'CCBot', operator: 'Common Crawl', purpose: 'training' },
  { token: 'Google-Extended', operator: 'Google', purpose: 'training', robotsOnly: true },
  { token: 'Applebot-Extended', operator: 'Apple', purpose: 'training', robotsOnly: true },
];

export const botsByPurpose = (purpose) => BOTS.filter((bot) => bot.purpose === purpose);

/** Find the bot whose token appears in a user-agent string (case-insensitive). */
export function classifyUserAgent(userAgent) {
  const ua = String(userAgent).toLowerCase();
  // Longest token first so "Claude-SearchBot" is not mistaken for a shorter prefix.
  const sorted = [...BOTS].filter((b) => !b.robotsOnly).sort((a, b) => b.token.length - a.token.length);
  return sorted.find((bot) => ua.includes(bot.token.toLowerCase())) ?? null;
}

/** A user agent that carries the bot's token. It cannot reproduce IP-based verification. */
export function simulatedUserAgent(bot) {
  return `Mozilla/5.0 (compatible; ${bot.token}/1.0; +https://example.invalid/bot-check)`;
}
