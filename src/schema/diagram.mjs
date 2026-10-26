// Draws a page's entity graph as inline SVG. The diagram is generated from the same
// node array that becomes the page's JSON-LD, so it is a faithful picture of what
// a crawler reads, not an illustration.
//
// Layout: columns by longest path from a root (the page node sits on the left, shared
// entities such as the Person on the right). Links between adjacent columns are curves with
// their own connection points; links that skip a column are routed over the top so they never
// run behind another node.

import { esc } from '../lib/html.mjs';

const NODE_W = 190;
const NODE_H = 64;
const COL_GAP = 130;
const ROW_GAP = 22;
const PAD = 24;
const LANE_FIRST = 20;
const LANE_STEP = 20;

const TYPE_ORDER = [
  'BlogPosting',
  'WebPage',
  'ProfilePage',
  'CollectionPage',
  'WebSite',
  'ItemList',
  'BreadcrumbList',
  'ImageObject',
  'Person',
];

const typeOf = (node) => [].concat(node['@type']).join(' / ');
const rank = (node) => {
  const index = TYPE_ORDER.indexOf([].concat(node['@type'])[0]);
  return index === -1 ? TYPE_ORDER.length : index;
};

/** Short human label for a node. Breadcrumbs and images have no name of their own. */
export function labelOf(node) {
  const types = [].concat(node['@type']);
  if (types.includes('BreadcrumbList')) {
    return node.itemListElement.map((item) => item.name).join(' / ');
  }
  if (types.includes('ImageObject')) return node.caption ?? node.url ?? node['@id'];
  return node.headline ?? node.name ?? node.url ?? node['@id'];
}

function truncate(text, max) {
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Relationships between nodes: properties whose value is `{ "@id": … }` pointing into this graph. */
export function extractEdges(nodes) {
  const known = new Set(nodes.map((n) => n['@id']));
  const merged = new Map();
  for (const node of nodes) {
    for (const [prop, value] of Object.entries(node)) {
      if (prop.startsWith('@')) continue;
      for (const item of [].concat(value)) {
        const isRef =
          item && typeof item === 'object' && Object.keys(item).length === 1 && '@id' in item;
        if (!isRef || !known.has(item['@id'])) continue;
        const key = `${node['@id']}|${item['@id']}`;
        const entry = merged.get(key) ?? { from: node['@id'], to: item['@id'], props: [] };
        entry.props.push(prop);
        merged.set(key, entry);
      }
    }
  }
  return [...merged.values()];
}

/** Column index = longest path from a node that nothing points at. */
function columnsOf(nodes, edges) {
  const incoming = new Map(nodes.map((n) => [n['@id'], []]));
  for (const edge of edges) incoming.get(edge.to).push(edge.from);
  const memo = new Map();
  const visiting = new Set();
  const column = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const sources = incoming.get(id);
    const value = sources.length ? 1 + Math.max(...sources.map(column)) : 0;
    visiting.delete(id);
    memo.set(id, value);
    return value;
  };
  return new Map(nodes.map((n) => [n['@id'], column(n['@id'])]));
}

function layout(nodes, edges) {
  const columnOf = columnsOf(nodes, edges);
  const columnCount = Math.max(...columnOf.values()) + 1;
  const columns = Array.from({ length: columnCount }, () => []);
  for (const node of nodes) columns[columnOf.get(node['@id'])].push(node);
  for (const column of columns) column.sort((a, b) => rank(a) - rank(b));

  const lanes = edges.filter((e) => columnOf.get(e.to) - columnOf.get(e.from) > 1);
  const top = lanes.length ? LANE_FIRST + (lanes.length - 1) * LANE_STEP + 34 : PAD;

  const tallest = Math.max(...columns.map((c) => c.length));
  const rowHeight = NODE_H + ROW_GAP;
  const positions = new Map();
  columns.forEach((column, col) => {
    const offset = ((tallest - column.length) * rowHeight) / 2;
    column.forEach((node, row) => {
      positions.set(node['@id'], {
        x: PAD + col * (NODE_W + COL_GAP),
        y: top + offset + row * rowHeight,
      });
    });
  });

  return {
    positions,
    columnOf,
    lanes,
    width: PAD * 2 + columnCount * NODE_W + (columnCount - 1) * COL_GAP,
    height: top + tallest * NODE_H + (tallest - 1) * ROW_GAP + PAD,
  };
}

/** Spread connection points along a node's edge so lines that share a node do not overlap. */
function ports(edges, positions) {
  const out = new Map();
  const inn = new Map();
  const centre = (id) => positions.get(id).y;
  for (const edge of edges) {
    out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
    inn.set(edge.to, [...(inn.get(edge.to) ?? []), edge]);
  }
  const fromY = new Map();
  const toY = new Map();
  for (const [id, list] of out) {
    list.sort((a, b) => centre(a.to) - centre(b.to));
    list.forEach((edge, i) => fromY.set(edge, positions.get(id).y + (NODE_H * (i + 1)) / (list.length + 1)));
  }
  for (const [id, list] of inn) {
    list.sort((a, b) => centre(a.from) - centre(b.from));
    list.forEach((edge, i) => toY.set(edge, positions.get(id).y + (NODE_H * (i + 1)) / (list.length + 1)));
  }
  return { fromY, toY };
}

/** Plain-language description used as the SVG <desc> and as a text alternative. */
export function describeGraph(nodes) {
  const byId = new Map(nodes.map((n) => [n['@id'], n]));
  const parts = nodes.map((n) => `${typeOf(n)} "${truncate(labelOf(n), 60)}"`);
  const links = extractEdges(nodes).map(
    (e) => `${typeOf(byId.get(e.from))} ${e.props.join(' and ')} ${typeOf(byId.get(e.to))}`,
  );
  return `Entity graph with ${nodes.length} nodes: ${parts.join('; ')}. Links: ${links.join('; ')}.`;
}

function labelText(x, y, props, anchor = 'middle') {
  const lines = props.map((prop, i) => {
    const dy = (i - (props.length - 1)) * 13;
    return `<tspan x="${x.toFixed(1)}" dy="${i === 0 ? dy : 13}">${esc(prop)}</tspan>`;
  });
  return `<text class="g-edge-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}">${lines.join('')}</text>`;
}

/**
 * @param {object[]} nodes JSON-LD graph nodes
 * @param {{ idPrefix?: string }} [options] prefix keeps <title>/<desc> ids unique when several graphs share a page
 */
export function renderGraphSvg(nodes, { idPrefix = 'graph' } = {}) {
  const edges = extractEdges(nodes);
  const { positions, columnOf, lanes, width, height } = layout(nodes, edges);
  const { fromY, toY } = ports(edges, positions);

  const paths = [];
  const labels = [];
  for (const edge of edges) {
    const a = positions.get(edge.from);
    const b = positions.get(edge.to);
    const x0 = a.x + NODE_W;
    const y0 = fromY.get(edge);
    const x3 = b.x;
    const y3 = toY.get(edge);
    const span = columnOf.get(edge.to) - columnOf.get(edge.from);
    let d;
    if (span > 1) {
      const lane = LANE_FIRST + lanes.indexOf(edge) * LANE_STEP;
      d = `M${x0} ${y0} C${x0 + 44} ${y0} ${x0 + 44} ${lane} ${x0 + 88} ${lane} L${x3 - 88} ${lane} C${x3 - 44} ${lane} ${x3 - 44} ${y3} ${x3} ${y3}`;
      labels.push(labelText((x0 + x3) / 2, lane - 5, [edge.props.join(', ')]));
    } else {
      const reach = (x3 - x0) / 2;
      d = `M${x0} ${y0} C${x0 + reach} ${y0} ${x3 - reach} ${y3} ${x3} ${y3}`;
      labels.push(labelText((x0 + x3) / 2, (y0 + y3) / 2 - 6, edge.props));
    }
    paths.push(`<path class="g-edge" d="${d}" marker-end="url(#${idPrefix}-arrow)"/>`);
  }

  const boxes = nodes.map((node) => {
    const { x, y } = positions.get(node['@id']);
    return [
      `<g class="g-node" transform="translate(${x} ${y})">`,
      `<rect class="g-node-box" width="${NODE_W}" height="${NODE_H}"/>`,
      `<rect class="g-node-bar" width="9" height="${NODE_H}"/>`,
      `<text class="g-type" x="24" y="27">${esc(truncate(typeOf(node), 20))}</text>`,
      `<text class="g-label" x="24" y="47">${esc(truncate(labelOf(node), 24))}</text>`,
      '</g>',
    ].join('');
  });

  return [
    `<svg class="graph-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${idPrefix}-title ${idPrefix}-desc">`,
    `<title id="${idPrefix}-title">Entity graph of this page's JSON-LD</title>`,
    `<desc id="${idPrefix}-desc">${esc(describeGraph(nodes))}</desc>`,
    `<defs><marker id="${idPrefix}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="g-arrow" d="M0 0L10 5L0 10z"/></marker></defs>`,
    ...paths,
    ...boxes,
    ...labels,
    '</svg>',
  ].join('\n');
}

/** Rows for a text version of the graph: type, @id and outgoing links. */
export function entityRows(nodes) {
  const byId = new Map(nodes.map((n) => [n['@id'], n]));
  const edges = extractEdges(nodes);
  return nodes.map((node) => ({
    type: typeOf(node),
    id: node['@id'],
    label: labelOf(node),
    links: edges
      .filter((e) => e.from === node['@id'])
      .map((e) => `${e.props.join(', ')}: ${labelOf(byId.get(e.to))}`),
  }));
}
