# Tasks: Search Performance Optimization

- [x] 1. Reduce timeouts in brightdata.js
  - [x] 1.1 Reduce lensSearch timeout from 120s to 45s
  - [x] 1.2 Reduce unlockUrl timeout from 90s to 30s and retries from 2 to 1
  - [x] 1.3 Reduce serpSearch timeout from 90s to 45s
- [x] 2. Optimize price.js — single Lens tab + cap scraping
  - [x] 2.1 Replace 3-tab Lens loop with single exact_matches call
  - [x] 2.2 Cap scraping to 5 URLs and use Lens price when available
  - [x] 2.3 Cap final results to 5
- [x] 3. Optimize aggregator.js — single Lens tab + remove SERP + simplify scoring
  - [x] 3.1 Replace 3-tab Lens loop with single exact_matches call
  - [x] 3.2 Remove SERP fallback
  - [x] 3.3 Replace fingerprint scoring with simple filter, cap to 5
