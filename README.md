# pranavgauttam08.github.io

A small static site that ships a validated JSON-LD entity graph on every page, with the tooling to
prove it: a build-time validator, a diagram of each page's graph, and checks that AI and search
crawlers can actually fetch the pages.

No framework and no runtime dependencies. Node 22 or newer.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Build `content/` into `dist/`. Set `SITE_URL` to build for another origin. |
| `npm run serve` | Serve `dist/` on http://localhost:4173 (set `PORT` to change it). |
| `npm run dev` | Build, then serve. |
| `npm run validate` | Validate `dist/` the way a crawler sees it. |
| `npm run validate:strict` | The pull-request gate: also fails on placeholders and non-https URLs. |
| `npm test` | Unit and mutation tests, including deliberately broken pages the validator must reject. |
| `npm run bots -- --url https://…` | Fetch a live page as each AI and search bot and compare with a browser. |
| `npm run logs -- access.log` | Summarise bot traffic from an Apache or nginx access log. |
| `npm run check` | Build, strict validation and tests, as CI runs them. |

## How it fits together

```
content/*.md  ─┐
site.config.json ─┼─►  page objects ─►  visible HTML
               │                  └─►  JSON-LD @graph   (same objects, so they cannot drift)
               │
dist/ (built HTML) ─► validator reads it like a crawler ─► LD / HT / X rule codes, exit 1 on errors
                   └► schema-report.json  ─► diagram and /schema/ inspector
```

- `src/schema/` builds the graph (`graph.mjs`), validates it (`rules.mjs`, `page-checks.mjs`,
  `validate.mjs`) and draws it (`diagram.mjs`).
- `src/crawl/` holds the crawler policy, `robots.txt` and `llms.txt` generation, the bot-access check
  and the log analyzer.
- The rule table, `@id` convention and crawler rationale are in [docs/SCHEMA-SPEC.md](docs/SCHEMA-SPEC.md).

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds for the production origin, runs
the strict validator and publishes `dist/` to GitHub Pages (repository Settings → Pages → Source:
GitHub Actions). Pull requests run `.github/workflows/ci.yml`, which fails when the markup is invalid.

## Verify a live page

Open the page in Google's [Rich Results Test](https://search.google.com/test/rich-results) and the
[Schema Markup Validator](https://validator.schema.org/). The home page links to both, pre-filled with its own URL.
