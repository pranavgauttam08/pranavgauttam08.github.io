import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSite, loadPages } from '../src/lib/site.mjs';
import { buildGraph } from '../src/schema/graph.mjs';
import { extractEdges, renderGraphSvg, describeGraph } from '../src/schema/diagram.mjs';
import { ROOT, SITE_URL } from './helpers/project.mjs';

const site = await loadSite(ROOT, { siteUrl: SITE_URL });
const pages = await loadPages(ROOT, site);
const graphFor = (kind) => buildGraph(pages.find((p) => p.kind === kind), site, pages);

test('the diagram is drawn from the same nodes: every edge target is a node', () => {
  const nodes = graphFor('article');
  const ids = new Set(nodes.map((n) => n['@id']));
  for (const edge of extractEdges(nodes)) assert.ok(ids.has(edge.to) && ids.has(edge.from));
  const svg = renderGraphSvg(nodes, { idPrefix: 't' });
  assert.match(svg, /<svg[^>]*role="img"/);
  assert.ok(describeGraph(nodes).length > 20);
});
