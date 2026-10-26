// Serialise a graph into the <script> tag that ships in the page head.

export const SCHEMA_CONTEXT = 'https://schema.org';

/** The JSON document (as a string) for a graph. */
export function serialiseGraph(nodes) {
  return JSON.stringify({ '@context': SCHEMA_CONTEXT, '@graph': nodes }, null, 2)
    // "<" is escaped so a stray "</script>" in a value can never end the block early.
    .replace(/</g, '\\u003c');
}

export function renderJsonLdScript(nodes) {
  return `<script type="application/ld+json">\n${serialiseGraph(nodes)}\n</script>`;
}
