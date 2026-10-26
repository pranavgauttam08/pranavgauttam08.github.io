// HTML that surrounds the graph diagram: the home-page figure, the text alternative,
// and the "verify it yourself" links.

import { esc } from '../lib/html.mjs';
import { renderGraphSvg, entityRows } from './diagram.mjs';

export function renderEntityTable(nodes) {
  const rows = entityRows(nodes)
    .map(
      (row) =>
        `<tr><th scope="row">${esc(row.type)}</th><td><code>${esc(row.id)}</code></td><td>${
          row.links.length ? row.links.map(esc).join('<br>') : 'No outgoing links'
        }</td></tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Type</th><th scope="col">Identifier</th><th scope="col">Links to</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** The home-page hero figure. */
export function renderGraphFigure({ graph }) {
  return `<figure class="graph">
<div class="graph-scroll" tabindex="0" role="region" aria-label="Entity graph, scrolls sideways on small screens">
${renderGraphSvg(graph, { idPrefix: 'home-graph' })}
</div>
<figcaption>This is the entity graph in this page's own JSON-LD, drawn at build time from the same data. Each box is one node with its own identifier, and each line is a property that points at another node instead of repeating it.</figcaption>
<details>
<summary>Read the same graph as a table</summary>
${renderEntityTable(graph)}
</details>
</figure>`;
}

/** Links that let a reader check the claim above against independent tools. */
export function renderVerifySection({ site, page }) {
  const target = encodeURIComponent(page.url);
  const richResults = `https://search.google.com/test/rich-results?url=${target}`;
  const validator = `https://validator.schema.org/#url=${target}`;
  return `<section class="verify" aria-labelledby="verify-heading">
<h2 id="verify-heading">Check it without trusting me</h2>
<ul>
<li>Open the page source (Ctrl+U, or Cmd+Option+U on a Mac) and find the <code>application/ld+json</code> block.</li>
<li><a href="${esc(richResults)}" rel="noopener">Run this page through Google's Rich Results Test</a> to see which Google features it qualifies for.</li>
<li><a href="${esc(validator)}" rel="noopener">Run it through the Schema Markup Validator</a> to check the whole graph against schema.org.</li>
<li>Read the <a href="/schema/">schema inspector</a> for every page's graph, or the raw <a href="/schema-report.json">schema-report.json</a>.</li>
<li>Read the <a href="${esc(site.repoUrl)}" rel="noopener">source on GitHub</a>, including the validator that fails the build.</li>
</ul>
</section>`;
}
