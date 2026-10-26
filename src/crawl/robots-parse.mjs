// A small robots.txt parser following the Robots Exclusion Protocol (RFC 9309) closely enough to
// answer one question: may this user-agent token fetch this path?

/** @returns {{ groups: { agents: string[], rules: { type: 'allow'|'disallow', path: string }[] }[], sitemaps: string[] }} */
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (current) current.rules.push({ type: key, path: value });
      lastWasAgent = false;
    } else if (key === 'sitemap') {
      sitemaps.push(value);
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

/**
 * The most specific matching group applies (exact token, else `*`). Within it the longest
 * matching rule wins, and Allow beats Disallow when they are equally specific.
 */
export function canFetch(parsed, token, urlPath = '/') {
  const wanted = token.toLowerCase();
  const group =
    parsed.groups.find((g) => g.agents.includes(wanted)) ?? parsed.groups.find((g) => g.agents.includes('*'));
  if (!group) return true;

  let best = { length: -1, allow: true };
  for (const rule of group.rules) {
    if (rule.path === '' || !urlPath.startsWith(rule.path)) continue;
    const allow = rule.type === 'allow';
    if (rule.path.length > best.length || (rule.path.length === best.length && allow)) {
      best = { length: rule.path.length, allow };
    }
  }
  return best.allow;
}
