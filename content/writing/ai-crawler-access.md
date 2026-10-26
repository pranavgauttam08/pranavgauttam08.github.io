---
kind: article
path: /writing/ai-crawler-access/
title: Which AI crawlers can read your site? | Pranav Gauttam
heading: Which AI crawlers can read your site? A practical checklist
description: Separate the bots that retrieve pages to answer a question from the ones that collect training data, then test what each one actually receives.
lede: Structured data only helps if the page can be fetched. Access has three layers, and robots.txt is only the first.
crumb: AI crawler access
section: Crawlability
keywords: [robots.txt, AI crawlers, GPTBot, OAI-SearchBot, llms.txt, crawlability]
image: ai-crawler-access
datePublished: 2026-10-26T20:30:00+05:30
dateModified: 2026-10-26T20:30:00+05:30
---

## Three kinds of bot, three decisions

Treating "AI bots" as one group leads to bad robots.txt files. As the vendors document them, there are three kinds, and each one calls for its own decision.

- **Search and retrieval crawlers** such as `OAI-SearchBot`, `Claude-SearchBot` and `PerplexityBot` index pages so an assistant can find and cite them. Blocking these removes you from those answers.
- **User-triggered fetchers** such as `ChatGPT-User`, `Claude-User` and `Perplexity-User` retrieve a page at the moment a person asks an assistant about it.
- **Training crawlers** such as `GPTBot`, `ClaudeBot` and `CCBot` collect content to train models. Whether to allow them is a licensing decision, and making it does not change whether you appear in AI search.

`Google-Extended` is a robots.txt control token for Google's generative models. It is not a crawler that shows up in your logs, and Google documents it as separate from Googlebot. Check each vendor's current documentation before relying on any of this. OpenAI's [bot documentation](https://platform.openai.com/docs/bots) and Google's [crawler overview](https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers) are the primary sources, and names and behaviour change.

## The policy lives in one place

This site decides per purpose, not per bot. `site.config.json` has three switches, `allowSearch`, `allowUserFetch` and `allowTraining`, and the build generates `robots.txt` from them. The current policy allows all three, because the goal here is to be found and cited. A site with licensed content might block only the training group, and the file would show that in one readable block.

## robots.txt is only half of access

A permissive robots.txt does not guarantee a bot gets the page. A CDN, firewall or bot-management rule can refuse a user agent that robots.txt welcomes, and many of those rules were written before these bots existed, so their defaults can treat them as scrapers. Some setups return a refusal page with a 200 status, which looks fine in a status-code check.

So test what each bot receives:

```bash
npm run bots -- --url https://pranavgauttam08.github.io
```

The script requests robots.txt and the home page once with a browser user agent and once with each bot's token. For every bot it reports the status code and size, and whether the page's `<h1>` and JSON-LD survived. A bot that gets a smaller page than the browser, or an error, is flagged and the command exits non-zero.

It has a real limit. A simulated user agent cannot reproduce rules that verify a bot by its IP address, so a clean result there is a good sign and not proof. The logs settle it.

## Read the logs

Server logs show which bots actually arrived, what they fetched and what they were given.

```bash
npm run logs -- access.log
```

The log analyser classifies requests by bot family, lists the most-fetched paths and calls out bots that received 4xx or 5xx responses. Static hosting such as GitHub Pages does not expose raw logs, so this needs a host or CDN that does. On a site you control, it is the quickest way to see whether a retrieval bot is being turned away.

## What about llms.txt?

This site publishes one, generated from the same page list as the sitemap. I treat it as a cheap convenience for tools that choose to read it. I have not seen evidence from the major AI search providers that it changes citation behaviour, so it sits well below robots.txt, sitemaps and working markup in my priorities.

## The checklist

1. Decide the policy for search bots, fetchers and training bots separately, and write the reason down.
2. Generate robots.txt from that policy so it cannot drift from it.
3. Confirm the sitemap is listed in robots.txt and matches the pages you want found.
4. Fetch your own pages with each bot's user agent and compare them with what a browser gets.
5. Check that structured data is in the initial HTML, not injected by client-side JavaScript.
6. Read the logs, when you can get them, and fix any retrieval bot that is receiving errors.
