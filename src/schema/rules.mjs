// Graph-level rules: they look only at the parsed JSON-LD, never at the HTML around it.
// Every rule has a stable code so a failing build says exactly what to fix.
// The full table is in docs/SCHEMA-SPEC.md.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;
const PLACEHOLDER_TEXT = /REPLACE_ME|TODO|YOURSITE|lorem ipsum|\bexample\.(com|org|net)\b/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const typesOf = (node) => [].concat(node['@type'] ?? []);
const isType = (node, ...names) => typesOf(node).some((t) => names.includes(t));
const isRef = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && '@id' in value;
const isAbsoluteUrl = (value) => {
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
};

/** Strings anywhere inside a value, for placeholder scanning. */
function* strings(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const item of value) yield* strings(item);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) yield* strings(item);
}

/** Every `{ "@id": … }` reference inside a node, excluding the node's own @id. */
function* references(node) {
  for (const [key, value] of Object.entries(node)) {
    if (key === '@id') continue;
    const stack = [value];
    while (stack.length) {
      const current = stack.pop();
      if (Array.isArray(current)) stack.push(...current);
      else if (isRef(current)) yield { property: key, id: current['@id'] };
      else if (current && typeof current === 'object') stack.push(...Object.values(current));
    }
  }
}

/**
 * @param {object} doc one parsed JSON-LD document
 * @param {{ siteUrl: string, strict?: boolean, now?: Date }} context
 * @returns {{ level: 'error'|'warn'|'info', code: string, message: string }[]}
 */
export function checkGraph(doc, { siteUrl, strict = false, now = new Date() }) {
  const issues = [];
  const add = (level, code, message) => issues.push({ level, code, message });

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    add('error', 'LD002', 'JSON-LD root must be an object.');
    return issues;
  }

  const context = doc['@context'];
  const contexts = [].concat(context ?? []);
  if (!contexts.some((c) => c === 'https://schema.org' || c === 'https://schema.org/')) {
    add('error', 'LD003', `@context must be "https://schema.org", found ${JSON.stringify(context)}.`);
  }

  const graph = doc['@graph'];
  if (!Array.isArray(graph) || graph.length === 0) {
    add('error', 'LD004', 'Expected a non-empty @graph array.');
    return issues;
  }

  // Identity: every node typed, identified, unique and on the site origin.
  const byId = new Map();
  for (const node of graph) {
    if (!node || typeof node !== 'object') {
      add('error', 'LD005', 'Graph contains an entry that is not an object.');
      continue;
    }
    if (typesOf(node).length === 0) add('error', 'LD005', `Node ${node['@id'] ?? '(no @id)'} has no @type.`);
    const id = node['@id'];
    if (!id) {
      add('error', 'LD006', `${typesOf(node).join('/') || 'Node'} has no @id.`);
      continue;
    }
    if (byId.has(id)) add('error', 'LD007', `Duplicate @id ${id}.`);
    byId.set(id, node);
    if (!id.startsWith(siteUrl)) add('error', 'LD009', `@id ${id} is not on the site origin ${siteUrl}.`);
  }

  // References resolve. A reference to an id nobody declares is the classic structured-data bug.
  for (const node of graph) {
    for (const ref of references(node)) {
      if (ref.id.startsWith(siteUrl) && !byId.has(ref.id)) {
        add('error', 'LD008', `${typesOf(node).join('/')} ${node['@id']}: "${ref.property}" points at ${ref.id}, which is not declared in the graph.`);
      }
    }
  }

  const resolve = (value) => (isRef(value) ? byId.get(value['@id']) : value);

  // URLs absolute, and https outside local development.
  const localHttp = [];
  const urlProps = ['url', 'item', 'contentUrl', 'thumbnailUrl'];
  const checkUrl = (node, property, value) => {
    const where = `${typesOf(node).join('/')} ${node['@id']}: "${property}"`;
    if (typeof value !== 'string' || !isAbsoluteUrl(value)) {
      add('error', 'LD010', `${where} must be an absolute URL, found ${JSON.stringify(value)}.`);
      return;
    }
    const { protocol, hostname } = new URL(value);
    if (protocol === 'http:' && !LOCAL_HOSTS.has(hostname)) {
      add('error', 'LD010', `${where} uses http: ${value}.`);
    } else if (protocol === 'http:' && strict) {
      localHttp.push(value);
    }
  };
  for (const node of graph) {
    for (const property of urlProps) {
      if (property in node) checkUrl(node, property, node[property]);
    }
    for (const property of ['sameAs', 'image']) {
      for (const value of [].concat(node[property] ?? [])) {
        if (typeof value === 'string') checkUrl(node, property, value);
      }
    }
  }

  if (localHttp.length) {
    add('error', 'LD010', `Strict mode requires https, but ${localHttp.length} URLs use http (first: ${localHttp[0]}). Build with the real SITE_URL.`);
  }

  // Dates: ISO 8601, with a time zone where a time is given, and in a sensible order.
  for (const node of graph) {
    for (const property of ['datePublished', 'dateModified', 'dateCreated']) {
      const value = node[property];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
        add('error', 'LD011', `${typesOf(node).join('/')} ${node['@id']}: "${property}" is not ISO 8601 (found ${JSON.stringify(value)}).`);
      } else if (!value.includes('T')) {
        add('warn', 'LD012', `${typesOf(node).join('/')} ${node['@id']}: "${property}" has no time or time zone.`);
      }
    }
    if (node.datePublished && node.dateModified && Date.parse(node.dateModified) < Date.parse(node.datePublished)) {
      add('error', 'LD013', `${node['@id']}: dateModified is earlier than datePublished.`);
    }
    if (node.datePublished && Date.parse(node.datePublished) > now.getTime()) {
      add('warn', 'LD014', `${node['@id']}: datePublished is in the future.`);
    }
  }

  // Placeholders that should never ship.
  const placeholder = [...strings(graph)].find((text) => PLACEHOLDER_TEXT.test(text));
  if (placeholder) {
    add(strict ? 'error' : 'warn', 'LD015', `Placeholder text in markup: ${JSON.stringify(placeholder)}.`);
  }

  // Type-specific requirements.
  const need = (node, props, level, code = 'LD020') => {
    for (const property of props) {
      const value = node[property];
      const missing = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
      if (missing) add(level, code, `${typesOf(node).join('/')} ${node['@id']} is missing "${property}".`);
    }
  };

  const pages = graph.filter((n) => isType(n, 'WebPage', 'ProfilePage', 'CollectionPage'));
  if (pages.length !== 1) add('error', 'LD036', `Expected exactly one WebPage-family node, found ${pages.length}.`);

  for (const node of graph) {
    if (isType(node, 'Person')) {
      need(node, ['name'], 'error');
      need(node, ['url', 'sameAs'], 'warn', 'LD021');
    }
    if (isType(node, 'WebSite')) {
      need(node, ['url', 'name'], 'error');
      need(node, ['inLanguage'], 'warn', 'LD021');
    }
    if (isType(node, 'WebPage', 'ProfilePage', 'CollectionPage')) {
      need(node, ['url', 'name'], 'error');
      need(node, ['isPartOf', 'inLanguage', 'description'], 'warn', 'LD021');
      if (node.isPartOf && !isType(resolve(node.isPartOf) ?? {}, 'WebSite')) {
        add('warn', 'LD037', `${node['@id']}: isPartOf should point at the WebSite node.`);
      }
      if (node.breadcrumb && !isType(resolve(node.breadcrumb) ?? {}, 'BreadcrumbList')) {
        add('error', 'LD035', `${node['@id']}: "breadcrumb" must point at a BreadcrumbList.`);
      }
    }
    if (isType(node, 'ProfilePage')) {
      need(node, ['mainEntity'], 'error');
      const entity = resolve(node.mainEntity);
      if (entity && !(isType(entity, 'Person', 'Organization') && entity.name)) {
        add('error', 'LD022', `${node['@id']}: mainEntity must be a Person or Organization with a name.`);
      }
    }
    if (isType(node, 'Article', 'BlogPosting', 'NewsArticle')) {
      need(node, ['headline', 'image', 'datePublished', 'author'], 'error');
      need(node, ['dateModified', 'publisher', 'mainEntityOfPage', 'description'], 'warn', 'LD021');
      if (typeof node.headline === 'string' && node.headline.length > 110) {
        add('warn', 'LD023', `${node['@id']}: headline is ${node.headline.length} characters; Google may truncate past 110.`);
      }
      const author = resolve([].concat(node.author ?? [])[0]);
      if (author && !(isType(author, 'Person', 'Organization') && author.name)) {
        add('error', 'LD022', `${node['@id']}: author must be a Person or Organization with a name.`);
      }
      if (Array.isArray(node.image) && node.image.length < 3) {
        add('warn', 'LD034', `${node['@id']}: Google recommends images in 16:9, 4:3 and 1:1; found ${node.image.length}.`);
      }
    }
    if (isType(node, 'BreadcrumbList')) checkBreadcrumb(node, add, checkUrl);
    if (isType(node, 'ImageObject')) {
      if (!node.url && !node.contentUrl) add('error', 'LD020', `${node['@id']} is missing "url" or "contentUrl".`);
      need(node, ['width', 'height'], 'warn', 'LD021');
    }
    if (isType(node, 'ItemList')) {
      need(node, ['itemListElement'], 'error');
      for (const [index, item] of [].concat(node.itemListElement ?? []).entries()) {
        if (item.position !== index + 1 || !item.url) {
          add('error', 'LD038', `${node['@id']}: list item ${index + 1} needs position ${index + 1} and a url.`);
        }
      }
    }
    if (isType(node, 'FAQPage', 'HowTo')) {
      add('info', 'LD090', `${typesOf(node).join('/')} no longer produces a Google rich result (FAQ: 7 May 2026, HowTo: 2023). Keep it only if another consumer needs it.`);
    }
  }

  const size = Buffer.byteLength(JSON.stringify(doc));
  if (size > 50_000) add('warn', 'LD091', `JSON-LD is ${size} bytes; consider trimming nodes that add no information.`);

  return issues;
}

function checkBreadcrumb(node, add, checkUrl) {
  const items = [].concat(node.itemListElement ?? []);
  if (items.length < 2) {
    add('error', 'LD030', `${node['@id']}: a BreadcrumbList needs at least two items, found ${items.length}.`);
    return;
  }
  items.forEach((item, index) => {
    if (item['@type'] !== 'ListItem') add('error', 'LD031', `${node['@id']}: item ${index + 1} must be a ListItem.`);
    if (item.position !== index + 1) add('error', 'LD031', `${node['@id']}: item ${index + 1} has position ${item.position}; positions must run 1, 2, 3 in order.`);
    if (!item.name) add('error', 'LD032', `${node['@id']}: item ${index + 1} has no name.`);
    const last = index === items.length - 1;
    if (!last && !item.item) add('error', 'LD033', `${node['@id']}: item ${index + 1} needs an "item" URL (only the last may omit it).`);
    if (item.item) checkUrl(node, 'itemListElement.item', item.item);
  });
}
