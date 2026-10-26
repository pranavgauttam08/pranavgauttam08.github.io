// Page bodies, one renderer per page kind.

import { esc } from '../lib/html.mjs';
import { formatDate, renderBreadcrumbs } from './layout.mjs';
// diagram:begin
import { renderGraphFigure, renderVerifySection } from '../schema/figure.mjs';
import { renderInspector } from '../schema/inspector.mjs';
// diagram:end

const byNewest = (a, b) => b.datePublished.localeCompare(a.datePublished);

function entryList(articles, level) {
  const items = articles
    .map(
      (a) => `<li>
<h${level}><a href="${esc(a.path)}">${esc(a.heading)}</a></h${level}>
<p class="meta"><time datetime="${esc(a.datePublished)}">${esc(formatDate(a.datePublished))}</time></p>
<p>${esc(a.description)}</p>
</li>`,
    )
    .join('\n');
  return `<ul class="entries">\n${items}\n</ul>`;
}

function renderHome(ctx) {
  const { page, pages } = ctx;
  let figure = '';
  let verify = '';
  // diagram:begin
  figure = renderGraphFigure(ctx);
  verify = renderVerifySection(ctx);
  // diagram:end
  const articles = pages.filter((p) => p.kind === 'article').sort(byNewest);
  return `<section class="hero">
<h1>${esc(page.heading)}</h1>
<p class="lede">${esc(page.lede)}</p>
${figure}
</section>
${verify}
<section aria-labelledby="writing-heading">
<h2 id="writing-heading">Writing</h2>
${entryList(articles, 3)}
</section>
<div class="prose">
${page.bodyHtml}
</div>`;
}

function renderProse(ctx) {
  const { page, site } = ctx;
  return `${renderBreadcrumbs(page, site)}
<header class="page-head">
<h1>${esc(page.heading)}</h1>
<p class="lede">${esc(page.lede)}</p>
</header>
<div class="prose">
${page.bodyHtml}
</div>`;
}

function renderWritingIndex(ctx) {
  const { page, pages, site } = ctx;
  const articles = pages.filter((p) => p.kind === 'article').sort(byNewest);
  return `${renderBreadcrumbs(page, site)}
<header class="page-head">
<h1>${esc(page.heading)}</h1>
<p class="lede">${esc(page.lede)}</p>
</header>
<div class="prose">
${page.bodyHtml}
</div>
${entryList(articles, 2)}`;
}

function renderArticle(ctx) {
  const { page, site } = ctx;
  const hero = page.images[0];
  const updated =
    page.dateModified && page.dateModified !== page.datePublished
      ? ` Updated <time datetime="${esc(page.dateModified)}">${esc(formatDate(page.dateModified))}</time>.`
      : '';
  return `${renderBreadcrumbs(page, site)}
<article class="article">
<header class="page-head">
<h1>${esc(page.heading)}</h1>
<p class="lede">${esc(page.lede || page.description)}</p>
<p class="byline">By <a href="/about/">${esc(site.author.name)}</a>. Published <time datetime="${esc(page.datePublished)}">${esc(formatDate(page.datePublished))}</time>.${updated}</p>
<img class="hero-img" src="${esc(hero.path)}" width="${hero.width}" height="${hero.height}" alt="Title card for the article: ${esc(page.heading)}" fetchpriority="high">
</header>
<div class="prose">
${page.bodyHtml}
</div>
</article>`;
}

const renderers = {
  home: renderHome,
  about: renderProse,
  'writing-index': renderWritingIndex,
  article: renderArticle,
};
// diagram:begin
renderers.schema = renderInspector;
// diagram:end

export function renderBody(ctx) {
  const render = renderers[ctx.page.kind];
  if (!render) throw new Error(`No renderer for page kind "${ctx.page.kind}" (${ctx.page.file})`);
  return render(ctx);
}
