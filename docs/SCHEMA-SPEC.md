# Schema spec

How the structured data on this site is built, what the validator enforces, and why the crawler
policy looks the way it does. Everything here is checked by code; nothing is a style preference
that only a reviewer would notice.

## What is and is not claimed

- JSON-LD is how this site tells search engines which entities a page is about and how they connect.
- Google uses structured data for rich results and to understand pages. It says structured data is
  not required for its generative search features, and there is no special markup for them.
  This site does not claim that schema makes AI assistants cite it.
- The Rich Results Test checks whether a page is eligible for Google rich results. The Schema Markup
  Validator checks schema.org syntax and vocabulary. They answer different questions, so the site
  links to both from the home page, and a page can pass one and not the other.
- FAQ rich results were retired by Google on 7 May 2026 and HowTo in 2023. The site emits neither,
  and the validator reports them as an informational note if they ever appear (LD090).

## The entity graph

Every page ships one `<script type="application/ld+json">` holding one `@graph`. Nodes refer to each
other by `@id`, so an entity is defined once and referenced everywhere else.

| Node | `@id` | Where |
| --- | --- | --- |
| Person | `{origin}/#person` | every page |
| WebSite | `{origin}/#website` | every page |
| WebPage family (`WebPage`, `ProfilePage`, `CollectionPage`) | `{page URL}#webpage` | every page |
| BreadcrumbList | `{page URL}#breadcrumb` | pages with a trail of two or more |
| ImageObject | `{page URL}#primaryimage` | pages with an image |
| BlogPosting | `{page URL}#article` | articles |
| ItemList | `{page URL}#list` | the writing index, when it has posts |

Rules of the convention:

1. `@id` values are absolute, on the site origin, and never change once published. A fragment on the
   canonical URL keeps them readable and unique.
2. The same Person and WebSite `@id` appear on every page, so a consumer can merge the pages into
   one picture of the site.
3. A reference is `{ "@id": "…" }` and nothing else. Every reference must resolve to a node in the
   same graph (LD008).
4. Article `image` is a list of three URLs (16:9, 4:3, 1:1), which is what Google's article
   guidance recommends.
5. Only properties that are true and visible are emitted. Nothing is added to make a page look richer.

## Markup must match the page

Google's guidelines require markup to describe content that users can see. The validator reads the
built HTML, not the source data, and compares the two:

- `WebPage.url` equals the canonical, `name` equals `<title>` (LD050, LD051).
- `BlogPosting.headline` equals the visible `<h1>` (LD053).
- Dates appear in a visible `<time datetime>` (LD054) and the author is named on the page (LD055).
- Breadcrumb names equal the visible breadcrumb trail (LD056).
- No microdata or RDFa beside the JSON-LD (LD040).
- JSON-LD is in the initial HTML, not injected by script, so a crawler that does not run JavaScript still sees it.

## Rule codes

Severity is **error** (fails the build), **warn** (reported; fails only with `--fail-on-warn`), or
**info**. `--strict` is the pull-request gate: it also turns placeholder text and non-https URLs into errors.

### Graph (`LD0xx`, from the JSON-LD alone)

| Code | Level | Meaning |
| --- | --- | --- |
| LD001 | error | No JSON-LD block in the page |
| LD002 | error | Block is not valid JSON, or the root is not an object |
| LD003 | error | `@context` is not `https://schema.org` |
| LD004 | error | No non-empty `@graph` |
| LD005 | error | A graph entry is not an object or has no `@type` |
| LD006 | error | A node has no `@id` |
| LD007 | error | Duplicate `@id` |
| LD008 | error | A reference points at an `@id` that is not in the graph |
| LD009 | error | `@id` is not on the site origin |
| LD010 | error | A URL is relative, uses `http:`, or (strict) the build used a non-https origin |
| LD011 | error | A date is not ISO 8601 |
| LD012 | warn | A date has no time or time zone |
| LD013 | error | `dateModified` is earlier than `datePublished` |
| LD014 | warn | `datePublished` is in the future |
| LD015 | warn / error in strict | Placeholder text in the markup |
| LD020 | error | A required property is missing (ItemList items, image URL) |
| LD021 | warn | A recommended property is missing |
| LD022 | error | `author` or `mainEntity` is not a named Person or Organization |
| LD023 | warn | Headline is over Google's suggested length |
| LD030–LD033 | error | Malformed BreadcrumbList or ListItem (count, position, name, URL) |
| LD034 | warn | Images are not offered in 16:9, 4:3 and 1:1 |
| LD035 | error | `breadcrumb` does not point at a BreadcrumbList |
| LD036 | error | Not exactly one WebPage-family node |
| LD037 | warn | `isPartOf` does not point at the WebSite |
| LD038 | error | ItemList item without a correct position or URL |
| LD090 | info | Type no longer produces a Google rich result (FAQ, HowTo) |
| LD091 | warn | JSON-LD is unusually large |

### Page agreement (`LD04x`–`LD05x`, JSON-LD against the HTML)

| Code | Level | Meaning |
| --- | --- | --- |
| LD040 | error | Microdata or RDFa next to JSON-LD |
| LD041 | warn | More than one JSON-LD block |
| LD042 | warn | The 404 page carries structured data |
| LD050 | error | WebPage URL differs from the canonical |
| LD051 | error | WebPage name differs from `<title>` |
| LD052 | warn | WebPage description differs from the meta description |
| LD053 | error | Article headline differs from the visible `<h1>` |
| LD054 | error | A date in the markup is not in a visible `<time datetime>` |
| LD055 | error | The author in the markup is not visible |
| LD056 | error | Breadcrumb markup differs from the visible breadcrumb |
| LD057 | error | Markup names an image that is not in the build output |
| LD058 | warn | `inLanguage` differs from `<html lang>` |

### Document head (`HT0xx`)

| Code | Level | Meaning |
| --- | --- | --- |
| HT001 | error | `<html>` has no `lang` |
| HT002 | error / warn | Missing title / title length |
| HT003 | error / warn | Missing meta description / description length |
| HT004 | error | Missing canonical or canonical is not this page's URL |
| HT005 | error / warn | Indexable page with `noindex` / non-indexable page without it |
| HT006 | error | Not exactly one `<h1>` |
| HT007 | error | No viewport meta |
| HT008 | warn | Missing Open Graph or social tag |
| HT009 | error | Image without `alt` |

### Site-wide (`X0xx`)

| Code | Level | Meaning |
| --- | --- | --- |
| X001 | error | Two pages share a canonical |
| X002 | warn | Two pages share a title |
| X010–X013 | error | Sitemap missing, incomplete, listing a URL with no page, or with a bad `lastmod` |
| X020–X022 | error | `robots.txt` missing, missing the sitemap line, or blocking everything |
| X024 | error | `robots.txt` disagrees with the crawler policy in `site.config.json` |
| X025–X027 | warn | `llms.txt` missing, no H1, or missing a page |
| X030 | error | Broken internal link or asset |
| X040–X042 | error | `schema-report.json` missing or different from the markup actually shipped |
| X050 | warn / error in strict | Placeholder text left in `site.config.json` |

## Crawler policy

AI-related crawlers fall into groups with different consequences, so the policy is decided per
purpose, in `site.config.json`, and `robots.txt` is generated from it:

| Purpose | Examples | Effect of blocking |
| --- | --- | --- |
| Classic search engines | Googlebot, Bingbot | Pages drop out of ordinary search. Always allowed here. |
| AI search and retrieval | OAI-SearchBot, Claude-SearchBot, PerplexityBot | Pages cannot be found or cited in that assistant's answers. |
| User-triggered fetchers | ChatGPT-User, Claude-User, Perplexity-User | The assistant cannot read the page when someone asks about it. |
| Model training | GPTBot, ClaudeBot, CCBot, Google-Extended, Applebot-Extended | Opts out of training. Does not remove the site from AI search. |

Notes worth knowing:

- Vendors run these as separate bots. Blocking GPTBot does not block OAI-SearchBot, and the reverse.
- `Google-Extended` and `Applebot-Extended` are robots.txt tokens only. They never appear as a user
  agent in logs, so log analysis ignores them.
- Vendor documentation is the source of truth and changes. `src/crawl/bots.mjs` lists the sources.
- `robots.txt` states intent. A CDN or firewall can still refuse a bot. `npm run bots` compares what
  each bot token receives with what a browser receives. It cannot reproduce rules that verify a bot
  by IP address, so server logs (`npm run logs`) are the real evidence.
- `llms.txt` is generated as a low-cost convenience. This site does not rely on it and makes no claim
  that any major search system uses it.
