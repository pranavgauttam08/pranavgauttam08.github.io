// Pull the JSON-LD out of built HTML, the way a crawler would.

const BLOCK = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function extractJsonLdBlocks(html) {
  const blocks = [];
  for (const match of html.matchAll(BLOCK)) blocks.push(match[1].trim());
  return blocks;
}

/**
 * @returns {{ docs: object[], errors: string[] }} parsed documents, and a message for each block that is not valid JSON
 */
export function parseJsonLdBlocks(blocks) {
  const docs = [];
  const errors = [];
  blocks.forEach((block, index) => {
    try {
      docs.push(JSON.parse(block));
    } catch (error) {
      errors.push(`Block ${index + 1} is not valid JSON: ${error.message}`);
    }
  });
  return { docs, errors };
}

/** All nodes across every parsed document (a page should have one document, but be tolerant). */
export function nodesOf(docs) {
  return docs.flatMap((doc) => (Array.isArray(doc?.['@graph']) ? doc['@graph'] : []));
}
