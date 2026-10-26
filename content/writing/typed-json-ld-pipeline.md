---
kind: article
path: /writing/typed-json-ld-pipeline/
title: Shipping JSON-LD as code: one entity graph per page | Pranav Gauttam
heading: Shipping JSON-LD as code: one entity graph, checked on every build
description: How this site builds its JSON-LD from typed builders and stable IDs, and how a validator fails the build on dangling references, bad dates and hidden markup.
lede: Structured data usually fails quietly. Generating it from the same data as the page, then checking the built HTML, makes it fail loudly instead.
crumb: Shipping JSON-LD as code
section: Structured data
keywords: [JSON-LD, schema.org, structured data, entity graph, validation]
image: typed-json-ld-pipeline
datePublished: 2026-10-26T20:00:00+05:30
dateModified: 2026-10-26T20:00:00+05:30
---

## The problem with pasted snippets

Most structured data on the web is a snippet pasted into a template. It validates on the day it ships and then drifts. The headline changes and the markup does not. A date gets formatted for people instead of parsers. A second plugin emits a competing `Organization`. Nothing fails, so nobody notices.

I wanted the opposite for this site: structured data generated from the same content as the page, so the two cannot disagree, and a build that refuses to ship when they do.

## One graph per page, linked by stable IDs

Every page emits a single `@graph`. Entities that appear everywhere get a fixed `@id` on the site origin, so any page can point at them instead of declaring them again.

- `/#person` is me. Articles reference it as both `author` and `publisher`.
- `/#website` is the site, and it publishes through `/#person`.
- `<page URL>#webpage`, `#article` and `#breadcrumb` belong to one page and say which role they play.

The result is a small knowledge graph that a parser can walk: an article points at its page, the page at the site, the site at its publisher. An excerpt from this page's own markup:

```json
{
  "@type": "BlogPosting",
  "@id": "https://pranavgauttam08.github.io/writing/typed-json-ld-pipeline/#article",
  "author": { "@id": "https://pranavgauttam08.github.io/#person" },
  "publisher": { "@id": "https://pranavgauttam08.github.io/#person" },
  "mainEntityOfPage": { "@id": "https://pranavgauttam08.github.io/writing/typed-json-ld-pipeline/#webpage" }
}
```

The [schema inspector](/schema/) draws this graph for every page, from the same data.

## What the build checks

The validator reads the built HTML, not the source, so it checks what a crawler would actually receive. It fails the build on these:

- JSON that does not parse, or a missing `@context`.
- Duplicate `@id` values, and references that point at nothing. A `breadcrumb` that references an identifier nobody declares is the classic case.
- Dates that are not ISO 8601, or a `dateModified` earlier than `datePublished`.
- Missing properties for the types in use: headline, author, image and publication date for `BlogPosting`, a `mainEntity` for `ProfilePage`, positions and names for `BreadcrumbList`.
- Markup the page does not show. The `headline` must match the visible heading, the author and publication date must appear on the page, and the breadcrumb names must appear in the breadcrumb navigation. Google's [structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) ask for markup to reflect visible content, and this is the cheapest way to enforce that.
- Microdata or RDFa on the same page. Two competing descriptions of one page are worse than either alone.
- Placeholder values left in the configuration, when the validator runs in strict mode.

Each rule has a short code, such as `LD008` for an unresolved reference, so a failing build says exactly what to fix.

## What I deliberately left out

I did not build around `FAQPage` or `HowTo`. Google [stopped showing FAQ rich results on 7 May 2026](https://developers.google.com/search/docs/appearance/structured-data/faqpage) and removed HowTo rich results in 2023, so neither earns a visible result in Google Search any more. The vocabulary is still valid and harmless to keep, but I would not hang a deliverable on it.

I also make no claim that this markup increases how often AI assistants cite a page. Google's own guidance on generative AI features says structured data is not required and that there is no special schema to add. What the markup does give is unambiguous entities, eligibility for the rich results Google still supports (articles, breadcrumbs and profile pages among them, see the [search gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)), and a page that a machine can describe correctly without guessing.

## Check it yourself

1. View the source of this page and find the `application/ld+json` block.
2. Run the live URL through Google's Rich Results Test. It should detect the article and its breadcrumb.
3. Run it through the Schema Markup Validator, which checks the whole graph against schema.org and not only the features Google supports.
4. Open [schema-report.json](/schema-report.json) for the nodes and links the build recorded for every page.

If any of those disagree with this post, the validator has a bug, and I would like to hear about it.
