// Typed builders for every schema.org node this site emits. A page's JSON-LD is
// derived from the same page object that renders its HTML, so the markup and the
// visible content cannot drift apart.
//
// Property order inside each node is deliberate: @type, @id, then identity, then
// relationships. It keeps view-source output readable.

import { makeIds, ref } from './ids.mjs';
import { PLACEHOLDER } from '../lib/site.mjs';

/** Page kind -> schema.org type of the WebPage node. */
const WEBPAGE_TYPE = {
  home: 'WebPage',
  about: 'ProfilePage',
  'writing-index': 'CollectionPage',
  article: 'WebPage',
  schema: 'WebPage',
};

/** sameAs entries that still contain placeholder text are dropped (strict validation fails the build). */
export function cleanSameAs(list = []) {
  return list.filter((url) => !PLACEHOLDER.test(url));
}

export function personNode(site, ids) {
  const { author } = site;
  const node = {
    '@type': 'Person',
    '@id': ids.person,
    name: author.name,
    url: `${site.siteUrl}/`,
    description: author.description,
  };
  const sameAs = cleanSameAs(author.sameAs);
  if (sameAs.length) node.sameAs = sameAs;
  if (author.knowsAbout?.length) node.knowsAbout = author.knowsAbout;
  if (author.alumniOf) {
    node.alumniOf = {
      '@type': 'CollegeOrUniversity',
      name: author.alumniOf.name,
      url: author.alumniOf.url,
    };
  }
  return node;
}

export function websiteNode(site, ids) {
  return {
    '@type': 'WebSite',
    '@id': ids.website,
    url: `${site.siteUrl}/`,
    name: site.siteName,
    description: site.description,
    inLanguage: site.language,
    publisher: ref(ids.person),
  };
}

export function webPageNode(page, site, ids) {
  const node = {
    '@type': WEBPAGE_TYPE[page.kind] ?? 'WebPage',
    '@id': ids.webpage,
    url: ids.pageUrl,
    name: page.title,
    description: page.description,
    inLanguage: site.language,
    isPartOf: ref(ids.website),
  };
  if (page.kind === 'about') node.mainEntity = ref(ids.person);
  if (page.kind === 'writing-index') node.mainEntity = ref(ids.list);
  if (page.breadcrumb.length >= 2) node.breadcrumb = ref(ids.breadcrumb);
  if (page.images.length) node.primaryImageOfPage = ref(ids.primaryImage);
  if (page.datePublished) node.datePublished = page.datePublished;
  if (page.dateCreated) node.dateCreated = page.dateCreated;
  if (page.dateModified) node.dateModified = page.dateModified;
  return node;
}

export function breadcrumbNode(page, ids) {
  const last = page.breadcrumb.length - 1;
  return {
    '@type': 'BreadcrumbList',
    '@id': ids.breadcrumb,
    itemListElement: page.breadcrumb.map((crumb, index) => {
      const item = { '@type': 'ListItem', position: index + 1, name: crumb.name };
      // Google: the final item may omit `item` because it is the current page.
      if (index !== last) item.item = crumb.url;
      return item;
    }),
  };
}

export function imageNode(page, ids) {
  const primary = page.images[0];
  return {
    '@type': 'ImageObject',
    '@id': ids.primaryImage,
    url: primary.url,
    contentUrl: primary.url,
    width: primary.width,
    height: primary.height,
    caption: page.title,
    inLanguage: 'en',
  };
}

export function articleNode(page, site, ids) {
  const node = {
    '@type': 'BlogPosting',
    '@id': ids.article,
    headline: page.heading,
    description: page.description,
    // Google recommends several aspect ratios. Plain URLs are the most widely parsed form.
    image: page.images.map((image) => image.url),
    datePublished: page.datePublished,
    dateModified: page.dateModified || page.datePublished,
    author: ref(ids.person),
    publisher: ref(ids.person),
    mainEntityOfPage: ref(ids.webpage),
    isPartOf: ref(ids.webpage),
    inLanguage: site.language,
    wordCount: page.wordCount,
  };
  if (page.section) node.articleSection = page.section;
  if (page.keywords.length) node.keywords = page.keywords.join(', ');
  return node;
}

export function itemListNode(page, ids, articles) {
  return {
    '@type': 'ItemList',
    '@id': ids.list,
    name: page.heading,
    numberOfItems: articles.length,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    itemListElement: articles.map((article, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: article.url,
      name: article.heading,
    })),
  };
}

/**
 * Build the @graph for one page.
 * @param {object} page   page object from loadPages()
 * @param {object} site   site config from loadSite()
 * @param {object[]} allPages every page (used by collection pages)
 * @returns {object[]} graph nodes
 */
export function buildGraph(page, site, allPages = []) {
  const ids = makeIds(site.siteUrl, page);
  const nodes = [personNode(site, ids), websiteNode(site, ids), webPageNode(page, site, ids)];

  if (page.breadcrumb.length >= 2) nodes.push(breadcrumbNode(page, ids));
  if (page.images.length) nodes.push(imageNode(page, ids));
  if (page.kind === 'article') nodes.push(articleNode(page, site, ids));
  if (page.kind === 'writing-index') {
    const articles = allPages
      .filter((p) => p.kind === 'article')
      .sort((a, b) => b.datePublished.localeCompare(a.datePublished));
    // An empty list is invalid markup, and the page's mainEntity would point at nothing.
    if (articles.length) nodes.push(itemListNode(page, ids, articles));
    else delete nodes.find((n) => n['@id'] === ids.webpage).mainEntity;
  }
  return nodes;
}
