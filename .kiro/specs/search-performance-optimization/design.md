# Design: Search Performance Optimization

## Problem

The search pipeline (paste link → Google Lens → matches → scrape) takes way too long. Both `/api/price/compare` and `/api/aggregator/search` are over-engineered and make too many API calls.

## What stays the same

- Core flow: paste link → get product info → Google Lens → matches → scrape
- Shopify JSON fetch (fast, free)
- Client pages (PricePage.jsx, AggregatorPage.jsx) — no changes
- The `/detail` route (on-demand, not part of initial search)

## Changes

### 1. brightdata.js — Reduce timeouts

| Setting | Before | After |
|---------|--------|-------|
| `lensSearch` timeout | 120s | 45s |
| `unlockUrl` timeout | 90s | 30s |
| `unlockUrl` retries | 2 | 1 |
| `serpSearch` timeout | 90s | 45s |

### 2. price.js — Simplify Lens + cap scraping

- Replace the 3-tab sequential Lens loop (`exact_matches`, `visual_matches`, `products`) with a single `exact_matches` call. No fallback.
- Cap scraping from 10 URLs to 5
- If Lens already returned a price for a listing, use it directly instead of scraping that URL
- Cap final results to 5

### 3. aggregator.js — Simplify Lens + remove SERP + simplify scoring

- Replace the 3-tab sequential Lens loop with a single `exact_matches` call. No fallback.
- Remove SERP text search fallback entirely
- Replace the over-engineered fingerprint scoring system (~200 lines: `extractFingerprint`, `computeMatchScore`, `extractModelNumber`, `normalizeIdentifier`, `extractKeywords`, `countSearchQueryOverlap`, `filterAndSortByRelevanceEnhanced`, `buildQuery`, `deduplicateResults`) with a simple filter: exclude source URL, exclude low-quality domains, prefer brand matches, trust Lens ordering, cap at 5
- Update `MAX_TOTAL_RESULTS` to 5, `MAX_EXACT_MATCHES` to 5

## Expected timing

| | Before (worst) | After (worst) | After (typical) |
|---|---|---|---|
| price.js | ~720s | ~76s | ~20-35s |
| aggregator.js | ~720s | ~46s | ~15-25s |

## Files changed

- `server/brightdata.js` — timeout + retry reductions
- `server/routes/price.js` — single Lens tab, cap scrape to 5, use Lens prices
- `server/routes/aggregator.js` — single Lens tab, remove SERP, simplify scoring, cap to 5
