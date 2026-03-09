const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const {
  lensSearch,
  unlockUrl,
  friendlyPlatformName,
  extractDomain
} = require('../brightdata');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function parsePriceAmount(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function detectCurrency(text) {
  if (!text) return 'USD';
  if (/€/.test(text)) return 'EUR';
  if (/£/.test(text)) return 'GBP';
  if (/₹/.test(text)) return 'INR';
  if (/¥/.test(text)) return 'JPY';
  if (/CHF/i.test(text)) return 'CHF';
  if (/AUD/i.test(text)) return 'AUD';
  if (/CAD/i.test(text)) return 'CAD';
  return 'USD';
}

function currencyToRegion(currency) {
  const map = {
    USD: { flag: '🇺🇸', label: 'US' },
    EUR: { flag: '🇪🇺', label: 'EU' },
    GBP: { flag: '🇬🇧', label: 'UK' },
    INR: { flag: '🇮🇳', label: 'India' },
    JPY: { flag: '🇯🇵', label: 'Japan' },
    CHF: { flag: '🇨🇭', label: 'Switzerland' },
    AUD: { flag: '🇦🇺', label: 'Australia' },
    CAD: { flag: '🇨🇦', label: 'Canada' }
  };
  return map[currency] || { flag: '🌍', label: currency || 'Unknown' };
}

const CURRENCY_RATES = {
  USD: 1, EUR: 1.08, GBP: 1.27, INR: 0.012, JPY: 0.0067,
  CHF: 1.13, AUD: 0.65, CAD: 0.74
};

function toUsd(amount, currency) {
  if (!amount || !currency) return null;
  const rate = CURRENCY_RATES[currency] || 1;
  return Math.round(amount * rate * 100) / 100;
}

function formatPrice(amount, currency) {
  if (amount == null) return null;
  const symbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', CHF: 'CHF ', AUD: 'A$', CAD: 'C$' };
  const sym = symbols[currency] || currency + ' ';
  return `${sym}${amount.toLocaleString()}`;
}

/** Reject known non-product images */
function isNonProductImage(src) {
  if (!src) return true;
  const lower = src.toLowerCase();
  return lower.includes('logo') || lower.includes('icon') || lower.includes('favicon') || lower.includes('svgviewer');
}

/** Pick best product image from Shopify or scraped images */
function pickProductImage(images, productUrl, sku = '', fromShopify = false) {
  if (!images?.length) return null;
  if (fromShopify) return images[0] || null;

  const handle = productUrl.split('/products/')[1]?.split('?')[0] || '';
  for (const src of images) {
    if (isNonProductImage(src) || !/\.(jpe?g|webp)(\?|$)/i.test(src)) continue;
    const path = src.split('?')[0].toLowerCase();
    if (handle && path.includes(handle.toLowerCase())) return src;
    if (sku && path.includes(sku)) return src;
  }
  for (const src of images) {
    if (isNonProductImage(src)) continue;
    if (/\.(jpe?g|webp)(\?|$)/i.test(src)) return src;
  }
  return images[0] || null;
}

async function fetchShopifyJson(productUrl) {
  try {
    const u = new URL(productUrl);
    const cleanPath = u.pathname.replace(/\/$/, '').split('?')[0];
    const jsonUrl = `${u.origin}${cleanPath}.json`;
    const res = await fetch(jsonUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.product || null;
  } catch {
    return null;
  }
}

/** Recursively collect product links from Lens response */
function collectLensLinks(obj, out = [], seen = new Set(), depth = 0) {
  if (!obj || depth > 8) return out;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object') {
        const url = item.link || item.url || item.product_link || item.page_url;
        if (url && typeof url === 'string' && url.startsWith('http') && !url.includes('google.com')) {
          const key = url.split('?')[0].toLowerCase();
          if (!seen.has(key)) { seen.add(key); out.push(item); }
        }
        collectLensLinks(item, out, seen, depth + 1);
      }
    }
  } else if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      collectLensLinks(v, out, seen, depth + 1);
    }
  }
  return out;
}

/** Extract price from a page's HTML using JSON-LD, meta tags, and DOM selectors */
function extractPriceFromHtml(html) {
  const $ = cheerio.load(html);
  let price = null;
  let currency = null;
  let inStock = null;

  // 1. JSON-LD (most reliable)
  $('script[type="application/ld+json"]').each((_, el) => {
    if (price) return; // already found
    try {
      const ld = JSON.parse($(el).html());
      const items = Array.isArray(ld) ? ld : (ld['@graph'] || [ld]);
      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
          const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          if (offer?.price) {
            price = parsePriceAmount(String(offer.price));
            currency = offer.priceCurrency || 'USD';
          }
          if (offer?.availability) {
            inStock = /InStock/i.test(offer.availability);
          }
        }
      }
    } catch {}
  });

  // 2. Meta tags
  if (!price) {
    const metaPrice = $('meta[property="og:price:amount"], meta[property="product:price:amount"]').attr('content');
    if (metaPrice) {
      price = parsePriceAmount(metaPrice);
      currency = $('meta[property="og:price:currency"], meta[property="product:price:currency"]').attr('content') || 'USD';
    }
  }

  // 3. DOM selectors
  if (!price) {
    const selectors = [
      '[itemprop="price"]',
      '.product-price',
      '[class*="price"] [class*="current"]',
      '[class*="price"] [class*="sale"]',
      '[class*="selling-price"]',
      '.price'
    ];
    for (const sel of selectors) {
      const el = $(sel).first();
      const text = el.attr('content') || el.text().trim();
      if (text) {
        const p = parsePriceAmount(text);
        if (p && p > 0) {
          price = p;
          currency = detectCurrency(text);
          break;
        }
      }
    }
  }

  const rating = parseFloat($('[itemprop="ratingValue"]').attr('content') || '') || null;
  const reviewCount = $('[itemprop="reviewCount"]').text().trim() || null;

  return { price, currency: currency || 'USD', inStock, rating, reviewCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/price/compare
// Same flow as aggregator: URL → get image → Google Lens → extract prices
// ─────────────────────────────────────────────────────────────────────────────

router.post('/compare', async (req, res) => {
  try {
    const { url, imageUrl, brand: inputBrand, model: inputModel } = req.body;

    let productBrand = inputBrand?.trim() || '';
    let productTitle = inputModel?.trim() || '';
    let productSku = '';
    let productImageUrl = imageUrl || null;
    let fromShopify = false;
    let sourcePrice = null;

    // Step 1: Get product info + image
    if (url?.trim()) {
      const cleanUrl = url.trim().split('?')[0];

      // Try Shopify JSON first (free, no API cost)
      const shopifyData = await fetchShopifyJson(cleanUrl);
      if (shopifyData) {
        fromShopify = true;
        productBrand = productBrand || shopifyData.vendor || '';
        productTitle = productTitle || shopifyData.title || '';
        productSku = shopifyData.variants?.[0]?.sku || '';
        sourcePrice = parsePriceAmount(shopifyData.variants?.[0]?.price);
        const images = (shopifyData.images || []).map(i => i.src).filter(Boolean);
        if (!productImageUrl) {
          productImageUrl = pickProductImage(images, cleanUrl, productSku, true);
        }
      } else {
        // Fallback: scrape the page for image + product info
        try {
          const unlockResult = await unlockUrl(cleanUrl);
          if (unlockResult.available && unlockResult.html) {
            const $ = cheerio.load(unlockResult.html);
            productTitle = productTitle || $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';
            productBrand = productBrand || $('[itemprop="brand"]').text().trim() || '';

            if (!productImageUrl) {
              const ogImg = $('meta[property="og:image"]').attr('content');
              const images = [];
              if (ogImg) images.push(ogImg);
              $('img').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src');
                if (src && (src.startsWith('http') || src.startsWith('//'))) {
                  images.push(src.startsWith('//') ? 'https:' + src : src);
                }
              });
              productImageUrl = pickProductImage(images, cleanUrl, productSku, false);
            }
          }
        } catch (e) {
          console.warn('[Price] Scrape fallback failed:', e.message);
        }
      }
    }

    if (!productImageUrl && !productBrand && !productTitle) {
      return res.status(400).json({ error: 'Could not determine product. Provide a URL or image.' });
    }

    console.log(`[Price] Product: "${productBrand} ${productTitle}" | Image: ${productImageUrl ? 'yes' : 'no'}`);

    // Step 2: Google Lens — exact_matches first, visual_matches fallback
    let lensResults = [];
    if (productImageUrl) {
      try {
        const lensData = await lensSearch(productImageUrl, { brdLens: 'exact_matches' });
        lensResults = collectLensLinks(lensData);
        console.log(`[Price] Lens exact_matches: ${lensResults.length} results`);
      } catch (e) {
        console.warn(`[Price] Lens exact_matches failed:`, e.message);
      }

      // Fallback: if exact_matches returned 0 results, try visual_matches
      if (lensResults.length === 0) {
        try {
          console.log(`[Price] Falling back to visual_matches...`);
          const lensData = await lensSearch(productImageUrl, { brdLens: 'visual_matches' });
          lensResults = collectLensLinks(lensData);
          console.log(`[Price] Lens visual_matches: ${lensResults.length} results`);
        } catch (e) {
          console.warn(`[Price] Lens visual_matches failed:`, e.message);
        }
      }
    }

    console.log(`[Price] Total Lens results: ${lensResults.length}`);

    // Step 3: Build listing URLs from Lens results
    const inputUrl = url?.trim()?.split('?')[0] || '';
    const isSolistInput = inputUrl.toLowerCase().includes('thesolist.com');
    const seen = new Set();
    const seenDomains = new Set();
    const listings = [];
    for (const item of lensResults) {
      const itemUrl = item.link || item.url || item.product_link || item.page_url;
      if (!itemUrl || !itemUrl.startsWith('http') || itemUrl.includes('google.com')) continue;
      // Skip any thesolist.com results when source is from The Solist (we prepend it ourselves)
      if (isSolistInput && itemUrl.toLowerCase().includes('thesolist.com')) continue;
      const key = itemUrl.split('?')[0].toLowerCase();
      if (seen.has(key)) continue;
      // One result per domain — keep first, skip duplicates
      const domain = extractDomain(itemUrl);
      if (seenDomains.has(domain)) continue;
      seen.add(key);
      seenDomains.add(domain);
      listings.push({
        url: itemUrl,
        title: item.title || item.name || '',
        platform: friendlyPlatformName(itemUrl),
        domain,
        lensPrice: item.price ? (typeof item.price === 'object' ? item.price.value ?? item.price.extracted : item.price) : null
      });
    }

    console.log(`[Price] ${listings.length} unique listings to fetch prices from`);

    // Step 4: Fetch actual prices from each listing page (parallel, max 5)
    const priceResults = await Promise.allSettled(
      listings.slice(0, 5).map(async (item) => {
        try {
          // If Lens already provided a price, use it directly — skip scraping
          if (item.lensPrice != null) {
            const lensAmount = parsePriceAmount(String(item.lensPrice));
            if (lensAmount && lensAmount > 0) {
              return {
                ...item,
                price: lensAmount,
                localCurrency: 'USD',
                usdPrice: lensAmount,
                formattedLocal: formatPrice(lensAmount, 'USD'),
                formattedUsd: formatPrice(lensAmount, 'USD'),
                region: currencyToRegion('USD'),
                inStock: null,
                rating: null,
                reviewCount: null
              };
            }
          }

          const unlockResult = await unlockUrl(item.url);
          if (!unlockResult.available || !unlockResult.html) {
            return { ...item, error: true };
          }
          const extracted = extractPriceFromHtml(unlockResult.html);
          const localCurrency = extracted.currency || 'USD';
          const price = extracted.price;
          const usdPrice = toUsd(price, localCurrency);

          return {
            ...item,
            price,
            localCurrency,
            usdPrice,
            formattedLocal: price ? formatPrice(price, localCurrency) : null,
            formattedUsd: usdPrice ? formatPrice(usdPrice, 'USD') : null,
            region: currencyToRegion(localCurrency),
            inStock: extracted.inStock,
            rating: extracted.rating,
            reviewCount: extracted.reviewCount
          };
        } catch (e) {
          console.warn(`[Price] Error fetching ${item.url}:`, e.message);
          return { ...item, error: true };
        }
      })
    );

    // Collect successful results
    const prices = priceResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(r => !r.error);

    // Sort by USD price (lowest first), nulls last — cap at 5
    prices.sort((a, b) => {
      if (a.usdPrice == null && b.usdPrice == null) return 0;
      if (a.usdPrice == null) return 1;
      if (b.usdPrice == null) return -1;
      return a.usdPrice - b.usdPrice;
    });

    // If source URL is from The Solist, prepend it as first result for comparison
    const cleanUrl = url?.trim()?.split('?')[0] || '';
    const isSolistSource = cleanUrl.toLowerCase().includes('thesolist.com');
    let sourceEntry = null;

    if (isSolistSource && cleanUrl) {
      sourceEntry = {
        url: cleanUrl,
        title: `${productBrand} ${productTitle}`.trim(),
        platform: 'The Solist',
        domain: 'thesolist.com',
        price: sourcePrice,
        localCurrency: 'USD',
        usdPrice: sourcePrice,
        formattedLocal: sourcePrice ? formatPrice(sourcePrice, 'USD') : null,
        formattedUsd: sourcePrice ? formatPrice(sourcePrice, 'USD') : null,
        region: currencyToRegion('USD'),
        inStock: null,
        rating: null,
        reviewCount: null,
        isSource: true
      };
    }

    const topPrices = sourceEntry
      ? [sourceEntry, ...prices.slice(0, 5)]
      : prices.slice(0, 5);
    const withPrice = topPrices.filter(p => p.usdPrice != null && !p.isSource);
    const lowestUrl = withPrice[0]?.url || null;
    const highestUrl = withPrice[withPrice.length - 1]?.url || null;

    console.log(`[Price] Returning ${topPrices.length} prices (${withPrice.length} with price data)`);

    return res.json({
      success: true,
      query: { brand: productBrand, model: productTitle, sku: productSku, searchQuery: `${productBrand} ${productTitle}`.trim() },
      prices: topPrices,
      lowestUrl,
      highestUrl,
      count: topPrices.length
    });

  } catch (err) {
    console.error('[Price] Compare error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
