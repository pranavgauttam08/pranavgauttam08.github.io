// schema-report.json: a machine-readable record of what the build emitted. The
// validator cross-checks it against the HTML that actually shipped.

import { extractEdges } from './diagram.mjs';

export function buildReport(site, pages, graphs) {
  const entries = pages
    .filter((p) => graphs.has(p.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((p) => {
      const nodes = graphs.get(p.path);
      return {
        path: p.path,
        url: p.url,
        title: p.title,
        types: nodes.map((n) => [].concat(n['@type']).join('+')),
        nodeCount: nodes.length,
        linkCount: extractEdges(nodes).length,
        ids: nodes.map((n) => n['@id']),
      };
    });

  return {
    site: site.siteUrl,
    totals: {
      pages: entries.length,
      nodes: entries.reduce((sum, e) => sum + e.nodeCount, 0),
      links: entries.reduce((sum, e) => sum + e.linkCount, 0),
    },
    pages: entries,
    graphs: Object.fromEntries([...graphs].sort(([a], [b]) => a.localeCompare(b))),
  };
}
