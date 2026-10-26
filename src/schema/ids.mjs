// Stable @id convention. Every entity gets an identifier on the site origin, so any
// page can reference it instead of re-declaring it. See docs/SCHEMA-SPEC.md.

/**
 * @param {string} siteUrl origin without a trailing slash
 * @param {{ path: string }} page
 */
export function makeIds(siteUrl, page) {
  const pageUrl = `${siteUrl}${page.path}`;
  return {
    pageUrl,
    // Site-wide entities: identical on every page.
    person: `${siteUrl}/#person`,
    website: `${siteUrl}/#website`,
    // Page-scoped entities: the page URL plus a fragment naming the role.
    webpage: `${pageUrl}#webpage`,
    breadcrumb: `${pageUrl}#breadcrumb`,
    article: `${pageUrl}#article`,
    primaryImage: `${pageUrl}#primaryimage`,
    list: `${pageUrl}#list`,
  };
}

export const ref = (id) => ({ '@id': id });
