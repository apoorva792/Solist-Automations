const fetch = require('node-fetch');

// Dedicated Bright Data API keys
const BRIGHT_DATA_SERP_API_KEY = process.env.BRIGHT_DATA_SERP_API_KEY;
const BRIGHT_DATA_UNLOCKER_API_KEY = process.env.BRIGHT_DATA_UNLOCKER_API_KEY;

const SERP_ZONE = process.env.SERP_API_ZONE || 'serp_api1';
const UNLOCKER_ZONE = process.env.WEB_UNLOCKER_ZONE || 'web_unlocker1';

/**
 * Create a fetch call with a proper AbortController-based timeout.
 * node-fetch v2 does not support a `timeout` property in options —
 * it must be wired via AbortController.
 */
function fetchWithTimeout(url, options, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Extract the URL from a SERP result object.
 * Bright Data SERP API returns organic results with a `link` field,
 * but older / different zone configurations may use `url` or `page_url`.
 */
function extractSerpUrl(result) {
  return (
    result.link ||
    result.url ||
    result.page_url ||
    (result.input && result.input.original_url) ||
    ''
  );
}

/**
 * Use Bright Data SERP API to search Google.
 * Returns the raw organic results array (each item has at minimum `link`, `title`, `snippet`).
 */
async function serpSearch(query, options = {}) {
  const { numResults = 10, country = 'us' } = options;

  const url = 'https://api.brightdata.com/request';
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${numResults}&udm=28&hl=en&gl=${country}`;

  const payload = {
    zone: SERP_ZONE,
    url: googleSearchUrl,
    format: 'json',
    method: 'GET',
    country
  };

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BRIGHT_DATA_SERP_API_KEY}`
        },
        body: JSON.stringify(payload)
      },
      45000
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Bright Data SERP error ${response.status}: ${errText}`);
    }

    const data = await response.json();

    // Bright Data /request API returns { status_code, headers, body }.
    // For the SERP zone the 'body' property holds the actual JSON results.
    let serpData = data.body || data;
    if (typeof serpData === 'string') {
      try {
        serpData = JSON.parse(serpData);
      } catch (e) {
        console.error('[BrightData] Could not parse SERP body as JSON:', e.message);
      }
    }

    return serpData?.organic || serpData?.results || [];
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('SERP request timed out (taking longer than 45s)');
    }
    throw err;
  }
}

/**
 * Use Bright Data Web Unlocker API to fetch a URL.
 * Returns an object with HTML body, status code, and availability info.
 */
async function unlockUrl(targetUrl, options = {}) {
  const { country = 'us', retries = 0 } = options;
  const url = 'https://api.brightdata.com/request';

  const payload = {
    zone: UNLOCKER_ZONE,
    url: targetUrl,
    format: 'json',
    method: 'GET',
    country
  };

  let lastError = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = 1000;
        console.log(`[Unlocker] Retry ${attempt} for ${targetUrl} after ${backoff}ms`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }

      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BRIGHT_DATA_UNLOCKER_API_KEY}`
          },
          body: JSON.stringify(payload)
        },
        30000
      );

      if (!response.ok) {
        const errText = await response.text();
        const error = new Error(`Bright Data Unlocker error ${response.status}: ${errText}`);
        
        // Retry on 5xx errors
        if (response.status >= 500 && attempt < retries) {
          lastError = error;
          continue;
        }
        throw error;
      }

      const data = await response.json();
      const html = data.body || data.html || '';
      const statusCode = data.status_code || 200;
      
      // Check for unavailable page indicators
      const availability = checkPageAvailability(html, statusCode, targetUrl, data);
      
      return {
        html,
        statusCode,
        available: availability.available,
        reason: availability.reason,
        finalUrl: data.url || targetUrl
      };
      
    } catch (err) {
      lastError = err;
      
      if (err.name === 'AbortError') {
        if (attempt < retries) continue;
        throw new Error('Unlocker request timed out (taking longer than 30s)');
      }
      
      // Don't retry on non-5xx errors
      if (!err.message.includes('error 5')) {
        throw err;
      }
    }
  }
  
  throw lastError;
}

/**
 * Check if a page is available or has been removed/redirected.
 */
function checkPageAvailability(html, statusCode, originalUrl, responseData) {
  // Check HTTP status codes
  if ([404, 410, 451, 403].includes(statusCode)) {
    return {
      available: false,
      reason: `HTTP ${statusCode} - Page not found or forbidden`
    };
  }

  // Check for redirect to homepage or category page
  const finalUrl = responseData.url || originalUrl;
  try {
    const origPath = new URL(originalUrl).pathname;
    const finalPath = new URL(finalUrl).pathname;
    
    // Redirected to homepage
    if (finalPath === '/' && origPath !== '/') {
      return {
        available: false,
        reason: 'Redirected to homepage - product no longer available'
      };
    }
    
    // Redirected to category/collection page
    if (origPath.includes('/product') && !finalPath.includes('/product')) {
      return {
        available: false,
        reason: 'Redirected to category page - product removed'
      };
    }
  } catch (e) {
    // URL parsing failed, continue with content checks
  }

  // Check HTML content for unavailability indicators
  const lowerHtml = html.toLowerCase();
  const unavailablePatterns = [
    'page not found',
    '404 error',
    'product not found',
    'product unavailable',
    'item is no longer available',
    'this product is unavailable',
    'product has been removed',
    'page no longer exists',
    'sorry, we couldn\'t find',
    'product not available',
    'out of stock permanently',
    'discontinued'
  ];

  for (const pattern of unavailablePatterns) {
    if (lowerHtml.includes(pattern)) {
      return {
        available: false,
        reason: `Page content indicates unavailability: "${pattern}"`
      };
    }
  }

  // Page appears to be available
  return {
    available: true,
    reason: null
  };
}

/**
 * Extract domain name from a URL, stripping www.
 */
function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Map domain to a friendly platform name.
 */
function friendlyPlatformName(url) {
  const domain = extractDomain(url).toLowerCase();
  const map = {
    'thesolist.com': 'The Solist',
    'farfetch.com': 'Farfetch',
    'ssense.com': 'SSENSE',
    'mytheresa.com': 'Mytheresa',
    'net-a-porter.com': 'Net-a-Porter',
    'matchesfashion.com': 'Matches Fashion',
    'amazon.com': 'Amazon US',
    'amazon.co.uk': 'Amazon UK',
    'amazon.in': 'Amazon IN',
    'amazon.de': 'Amazon DE',
    'amazon.fr': 'Amazon FR',
    'vestiairecollective.com': 'Vestiaire Collective',
    'therealreal.com': 'The RealReal',
    'rebag.com': 'Rebag',
    'tradesy.com': 'Tradesy',
    'fashionphile.com': 'Fashionphile',
    'yoox.com': 'YOOX',
    '24s.com': '24S',
    'shopbop.com': 'Shopbop',
    'luisaviaroma.com': 'Luisaviaroma',
    'bergdorfgoodman.com': 'Bergdorf Goodman',
    'neimanmarcus.com': 'Neiman Marcus',
    'saksfifthavenue.com': 'Saks Fifth Avenue',
    'harrods.com': 'Harrods',
    'selfridges.com': 'Selfridges',
    'brownsfashion.com': 'Browns Fashion',
    'cettire.com': 'Cettire',
    'italist.com': 'Italist',
    'giglio.com': 'Giglio',
    'noon.com': 'Noon',
    'namshi.com': 'Namshi',
    'ounass.com': 'Ounass',
    'modaoperandi.com': 'Moda Operandi',
    'rent-the-runway.com': 'Rent The Runway',
    'stockx.com': 'StockX',
    'goat.com': 'GOAT',
    'grailed.com': 'Grailed',
    'depop.com': 'Depop',
    'vinted.com': 'Vinted',
    'ebay.com': 'eBay',
    'ebay.co.uk': 'eBay UK'
  };

  for (const [key, val] of Object.entries(map)) {
    if (domain.includes(key)) return val;
  }
  // Capitalise first part of domain as fallback
  const first = domain.split('.')[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * Use Bright Data SERP zone to perform a Google Lens visual search.
 * brdLens: 'exact_matches' | 'visual_matches' | 'products' - which tab to fetch
 */
async function lensSearch(imageUrl, options = {}) {
  const { country = 'us', brdLens = 'exact_matches', retries = 1 } = options;

  const url = 'https://api.brightdata.com/request';
  const targetUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}&brd_json=1&brd_lens=${encodeURIComponent(brdLens)}`;

  const payload = {
    zone: SERP_ZONE,
    url: targetUrl,
    format: 'json',
    method: 'GET',
    country
  };

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[Lens] Retry ${attempt} after 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${BRIGHT_DATA_SERP_API_KEY}`
          },
          body: JSON.stringify(payload)
        },
        45000
      );

      if (!response.ok) {
        const errText = await response.text();
        const error = new Error(`Bright Data Lens error ${response.status}: ${errText}`);
        // Retry on 5xx or rate-limit
        if ((response.status >= 500 || response.status === 429) && attempt < retries) {
          lastError = error;
          console.warn(`[Lens] Attempt ${attempt} failed (${response.status}), retrying...`);
          continue;
        }
        throw error;
      }

      const data = await response.json();

      let lensData = data.body || data;
      if (typeof lensData === 'string') {
        try {
          lensData = JSON.parse(lensData);
        } catch (e) {
          console.error('[BrightData] Could not parse Lens body as JSON:', e.message);
        }
      }

      return lensData;
    } catch (err) {
      lastError = err;

      if (err.name === 'AbortError') {
        if (attempt < retries) {
          console.warn(`[Lens] Attempt ${attempt} timed out, retrying...`);
          continue;
        }
        throw new Error('Lens request timed out (taking longer than 45s)');
      }

      // Retry on network-level failures (ECONNRESET, ENOTFOUND, fetch failed, etc.)
      if (attempt < retries && (
        err.code === 'ECONNRESET' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'ETIMEDOUT' ||
        err.type === 'system' ||
        err.message.includes('failed, reason')
      )) {
        console.warn(`[Lens] Attempt ${attempt} network error: ${err.message}, retrying...`);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

module.exports = {
  serpSearch,
  lensSearch,
  unlockUrl,
  extractDomain,
  extractSerpUrl,
  friendlyPlatformName
};
