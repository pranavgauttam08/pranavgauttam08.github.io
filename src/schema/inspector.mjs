// The /schema/ page: every page's graph, drawn and tabulated, generated at build time.

import { esc } from '../lib/html.mjs';
import { renderBreadcrumbs } from '../templates/layout.mjs';
import { renderGraphSvg, extractEdges } from './diagram.mjs';
import { renderEntityTable } from './figure.mjs';

export function renderInspector({ page, pages, graphs, site }) {
  const sections = pages
    .filter((p) => graphs.has(p.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((p, index) => {
      const nodes = graphs.get(p.path);
      const types = nodes.map((n) => [].concat(n['@type']).join(' / ')).join(', ');
      return `<section class="inspect" aria-labelledby="inspect-${index}">
<h2 id="inspect-${index}"><a href="${esc(p.path)}">${esc(p.crumb)}</a></h2>
<p class="meta">${nodes.length} nodes and ${extractEdges(nodes).length} links: ${esc(types)}.</p>
<figure class="graph">
<div class="graph-scroll" tabindex="0" role="region" aria-label="Entity graph, scrolls sideways on small screens">${renderGraphSvg(nodes, { idPrefix: `inspect-${index}` })}</div>
</figure>
<details>
<summary>Read this graph as a table</summary>
${renderEntityTable(nodes)}
</details>
</section>`;
    })
    .join('\n');

  return `${renderBreadcrumbs(page, site)}
<header class="page-head">
<h1>${esc(page.heading)}</h1>
<p class="lede">${esc(page.lede)}</p>
</header>
<div class="prose">
${page.bodyHtml}
</div>
${sections}`;
}
