// llms.txt in the llmstxt.org layout: an H1 title, a blockquote summary, then link lists.
// Treated as a cheap convenience for tools that read it, not as a ranking lever.

export function renderLlmsTxt(site, pages, { schemaReport = false } = {}) {
  const byNewest = (a, b) => b.datePublished.localeCompare(a.datePublished);
  const articles = pages.filter((p) => p.kind === 'article').sort(byNewest);
  const link = (p) => `- [${p.heading}](${p.url}): ${p.description}`;

  const lines = [`# ${site.siteName}`, '', `> ${site.description}`, ''];

  lines.push('## Writing', '', ...articles.map(link), '');
  lines.push(
    '## Pages',
    '',
    ...pages.filter((p) => ['home', 'about', 'writing-index'].includes(p.kind)).map(link),
    '',
  );

  const machine = [`- [Sitemap](${site.siteUrl}/sitemap.xml): every indexable URL with its last-modified date`];
  if (schemaReport) {
    machine.push(
      `- [Schema report](${site.siteUrl}/schema-report.json): the JSON-LD entity graph emitted for every page`,
    );
  }
  lines.push('## Machine-readable', '', ...machine, '');
  return lines.join('\n');
}
