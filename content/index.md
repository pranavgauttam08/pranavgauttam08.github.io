---
kind: home
path: /
title: Pranav Gauttam: structured data you can inspect, test and ship
description: Software engineer working on structured data, crawlability and AI-search visibility. Every page on this site ships a validated JSON-LD entity graph.
heading: Structured data you can inspect, test and ship.
lede: I'm Pranav Gauttam, a software engineer working on structured data, crawlability and AI-search visibility. This site is the working example.
crumb: Home
---

## How this site is built

There is no framework and no runtime dependency. A short Node script turns Markdown files into static HTML, and the same page objects that render the HTML also generate the JSON-LD. A validator then reads the finished pages the way a crawler would, and fails the build when the markup is broken or disagrees with what the page shows.

That check runs on every pull request, and the site only deploys when it passes. [The case study](/writing/typed-json-ld-pipeline/) explains the rules. [The crawler checklist](/writing/ai-crawler-access/) covers the other half of the problem: whether AI search bots can reach the pages at all.
