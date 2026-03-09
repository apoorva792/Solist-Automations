const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const multer = require('multer');
const FormData = require('form-data');
const {
  lensSearch,
  unlockUrl,
  friendlyPlatformName,
  extractDomain
} = require('../brightdata');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '0f7e6d0934d9b1bc1f97466c58345809';

// Configure multer for image uploads (memory storage for serverless)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STRICT RELEVANCE FILTERING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Common filler words to ignore when computing keyword overlap */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'was', 'are', 'be',
  'this', 'that', 'new', 'buy', 'shop', 'sale', 'free', 'shipping',
  'online', 'store', 'price', 'best', 'top', 'official', '-', '–', '|',
  'mm', 'cm', 'ml', 'oz', 'kg', 'lb'
]);

/**
 * Extract model numbers / identifiers from a product title.
 * Looks for alphanumeric patterns that are likely model identifiers:
 *   - "126610LN", "SM-S928B", "MBP-14-M3", "A2779", "NH35A"
 *   - Patterns with mixed letters+digits, or digits+letters, optionally with hyphens/dots
 */
function extractModelNumbers(title) {
  if (!title) return [];
  const models = [];
  // Match patterns like: 126610LN, SM-S928B, A2779, REF.126610, PAM01312, etc.
  const patterns = [
    /\b([A-Z]{1,5}[-.]?\d{3,}[A-Z]{0,5}[-.]?\d{0,5}[A-Z]{0,3})\b/gi,  // e.g. SM-S928B, A2779, PAM01312
    /\b(\d{3,}[-.]?[A-Z]{1,5}[-.]?\d{0,5})\b/gi,                        // e.g. 126610LN, 5711/1A
    /\b(ref\.?\s*[A-Z0-9][-A-Z0-9.]{3,})\b/gi,                          // e.g. Ref. 126610LN
    /\b([A-Z]{2,}\d+[-/][A-Z0-9]+)\b/gi,                                 // e.g. MBP-14/M3
  ];
  const seen = new Set();
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(title)) !== null) {
      const clean = m[1].replace(/^ref\.?\s*/i, '').toUpperCase().trim();
      if (clean.length >= 3 && !seen.has(clean)) {
        seen.add(clean);
        models.push(clean);
      }
    }
  }
  return models;
}

/**
 * Tokenize a title into meaningful keywords (lowercased, stop words removed).
 */
function tokenize(title) {
  if (!title) return [];
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^-+|-+$/g, ''))
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Compute keyword overlap ratio between source tokens and result tokens.
 * Returns a value between 0 and 1 (fraction of source keywords found in result).
 */
function keywordOverlap(sourceTokens, resultTokens) {
  if (!sourceTokens.length) return 0;
  const resultSet = new Set(resultTokens);
  let matches = 0;
  for (const token of sourceTokens) {
    if (resultSet.has(token)) matches++;
  }
  return matches / sourceTokens.length;
}

/**
 * Check if any model number from the source appears in the result title.
 */
function hasModelMatch(sourceModels, resultTitle) {
  if (!sourceModels.length || !resultTitle) return false;
  const upper = resultTitle.toUpperCase();
  return sourceModels.some(model => upper.includes(model));
}

/**
 * Score and assign relevanceTier to a result based on source product info.
 * Returns { score, relevanceTier } or null if result should be excluded.
 */
function scoreResult(result, { sourceTitle, sourceBrand, sourceModels, sourceTokens }) {
  const resultTitle = result.title || '';
  const resultTokens = tokenize(resultTitle);
  const overlap = keywordOverlap(sourceTokens, resultTokens);
  const brandMatch = sourceBrand &&
    resultTitle.toLowerCase().includes(sourceBrand.toLowerCase());
  const modelMatch = hasModelMatch(sourceModels, resultTitle);

  let tier;
  let score;

  if (modelMatch && brandMatch) {
    tier = 'exact';
    score = 100;
  } else if (modelMatch) {
    tier = 'exact';
    score = 95;
  } else if (brandMatch && overlap >= 0.7) {
    tier = 'strong';
    score = 80;
  } else if (brandMatch && overlap >= 0.4) {
    tier = 'partial';
    score = 60;
  } else if (overlap >= 0.5) {
    tier = 'partial';
    score = 50;
  } else {
    // Below threshold — exclude
    return null;
  }

  return { score, relevanceTier: tier };
}

/**
 * Apply strict relevance filtering to Lens results.
 * Filters, scores, sorts, deduplicates by domain, and caps at maxResults.
 */
function filterAndScoreResults(lensResults, { sourceUrl, sourceTitle, sourceBrand, sourceSku, maxResults = 5 }) {
  const isSolistSource = sourceUrl.toLowerCase().includes('thesolist.com');
  const sourceModels = extractModelNumbers(sourceTitle);
  const sourceTokens = tokenize(sourceTitle);

  // Also treat SKU as a model number if available
  if (sourceSku && sourceSku.length >= 3) {
    const skuUpper = sourceSku.toUpperCase();
    if (!sourceModels.includes(skuUpper)) sourceModels.push(skuUpper);
  }

  console.log(`[Filter] Source models: [${sourceModels.join(', ')}] | Source tokens: [${sourceTokens.join(', ')}]`);

  const scored = [];
  for (const r of lensResults) {
    // Basic exclusions
    if (r.url === sourceUrl) continue;
    if (isSolistSource && r.url.toLowerCase().includes('thesolist.com')) continue;
    if (isLowQualityDomain(r.url)) continue;

    const result = scoreResult(r, { sourceTitle, sourceBrand, sourceModels, sourceTokens });
    if (!result) {
      console.log(`[Filter] Excluded (low relevance): "${r.title?.slice(0, 60)}"`);
      continue;
    }

    scored.push({ ...r, ...result });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by domain, cap at maxResults
  const seenDomains = new Set();
  const filtered = [];
  for (const r of scored) {
    if (seenDomains.has(r.domain)) continue;
    seenDomains.add(r.domain);
    filtered.push(r);
    if (filtered.length >= maxResults) break;
  }

  console.log(`[Filter] ${lensResults.length} Lens results → ${scored.length} scored → ${filtered.length} final`);
  return filtered;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI API HELPERS FOR SPEC EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call Gemini API with prompt and return generated text
 */
async function callGeminiAPI(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.warn('[Gemini] Empty response from API');
      return '{}';
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}


/**
 * Parse JSON from Gemini response, handling markdown code blocks
 */
function parseGeminiJSON(text) {
  if (!text || typeof text !== 'string') return {};
  
  // Try to extract JSON from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {
      // Continue to other parsing attempts
    }
  }
  
  // Try direct JSON parse
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // Try to extract JSON object from text
    const jsonMatch = text.match(/\{[\s\S]+\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        // Failed all parsing attempts
      }
    }
  }
  
  return {};
}

/**
 * Normalize specification key to title case with trimmed whitespace
 */
function normalizeSpecKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Normalize specification value to non-empty string
 */
function normalizeSpecValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  return str;
}

/**
 * Sanitize text to prevent XSS attacks
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Extract product specifications from HTML using Gemini AI
 * @param {string} html - HTML content of product page
 * @param {object} productContext - Product context (brand, title, sku)
 * @returns {Promise<object>} - Normalized specification map
 */
async function extractSpecsWithGemini(html, productContext) {
  try {
    if (!html || typeof html !== 'string') {
      console.warn('[Gemini] No HTML provided for spec extraction');
      return { specs: {}, enriched: {} };
    }

    if (!productContext || (!productContext.brand && !productContext.title && !productContext.sku)) {
      console.warn('[Gemini] No product context provided for spec extraction');
      return { specs: {}, enriched: {} };
    }

    const $ = cheerio.load(html);

    // Extract JSON-LD blocks (highest priority data source)
    const jsonLdBlocks = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const text = $(el).html();
      if (text) jsonLdBlocks.push(text.trim().slice(0, 3000));
    });

    // Extract meta tags
    const metaTags = [];
    $('meta[property^="og:"], meta[property^="product:"], meta[name="description"]').each((_, el) => {
      const prop = $(el).attr('property') || $(el).attr('name');
      const content = $(el).attr('content');
      if (prop && content) metaTags.push(`${prop}: ${content}`);
    });

    // Extract visible product text (remove noise)
    $('script, style, noscript, nav, footer, header, [class*="review"], [class*="recommend"], [class*="related"], [class*="blog"], [class*="newsletter"]').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000);

    // Build the HTML content block for Gemini
    const htmlContent = [
      jsonLdBlocks.length > 0 ? `JSON-LD:\n${jsonLdBlocks.join('\n')}` : '',
      metaTags.length > 0 ? `Meta Tags:\n${metaTags.join('\n')}` : '',
      `Visible Text:\n${bodyText}`
    ].filter(Boolean).join('\n\n');

    const prompt = `You are a product data extraction specialist. Extract structured product information from HTML of D2C brand websites.

Priority order for extraction (most reliable to least):
1. JSON-LD blocks — parse these first
2. Meta tags (og:title, og:price:amount, og:description, product:*)
3. Visible DOM text in product detail sections

Ignore: navigation, footer, reviews, recommendations, blog content, ads.

Return ONLY valid JSON. No markdown, no explanation, no preamble.

Product context from catalog:
Brand: ${productContext.brand || 'unknown'}
Title: ${productContext.title || 'unknown'}
SKU: ${productContext.sku || 'unknown'}
Price: ${productContext.price || 'unknown'}

Extract all product specifications from this HTML:
<html_content>
${htmlContent}
</html_content>

Return this exact JSON structure:
{
  "brand": "string or null",
  "title": "string or null",
  "sku": "string or null",
  "price": "string or null",
  "currency": "USD / INR / etc or null",
  "description": "1-2 sentence product description or null",
  "materials": ["list every material mentioned"],
  "dimensions": {
    "length": "value + unit or null",
    "width": "value + unit or null",
    "height": "value + unit or null",
    "weight": "value + unit or null",
    "other": "chain length, size range, etc or null"
  },
  "specifications": {
    "use snake_case keys": "extract every attribute"
  },
  "categories": ["breadcrumbs or tags if present"],
  "images": ["all product image URLs found"],
  "availability": "In Stock / Out of Stock / Preorder / null",
  "variants": [{ "type": "size/color/metal/length", "value": "actual value", "sku": "if found", "price": "if different" }],
  "confidence": "high / medium / low",
  "missing_fields": ["fields you expected but could not find"]
}

Rules:
- Missing fields = null, never empty string or N/A
- Extract every spec you find, do not filter
- Do not infer or hallucinate values not in the HTML
- If JSON-LD is present, prefer it over DOM text
- If this is not a product page, return {"error": "not a product page"}`;

    console.log(`[Gemini] Sending spec extraction request (${htmlContent.length} chars)...`);
    const responseText = await callGeminiAPI(prompt);
    console.log(`[Gemini] Response received (${responseText?.length || 0} chars)`);
    
    const parsed = parseGeminiJSON(responseText);

    if (parsed.error) {
      console.warn('[Gemini] Not a product page:', parsed.error);
      return { specs: {}, enriched: {} };
    }
    
    if (!parsed || Object.keys(parsed).length === 0) {
      console.warn('[Gemini] Failed to parse response:', responseText?.slice(0, 200));
      return { specs: {}, enriched: {} };
    }

    // Flatten specifications into a normalized key-value map for display
    const flatSpecs = {};

    // Add materials
    if (Array.isArray(parsed.materials) && parsed.materials.length > 0) {
      flatSpecs['Materials'] = parsed.materials.join(', ');
    }

    // Add dimensions
    if (parsed.dimensions && typeof parsed.dimensions === 'object') {
      for (const [key, val] of Object.entries(parsed.dimensions)) {
        if (val && val !== 'null' && String(val) !== 'null') {
          flatSpecs[normalizeSpecKey(key)] = sanitizeText(String(val));
        }
      }
    }

    // Add all specifications
    if (parsed.specifications && typeof parsed.specifications === 'object') {
      for (const [key, val] of Object.entries(parsed.specifications)) {
        if (val && val !== 'null' && String(val) !== 'null') {
          flatSpecs[normalizeSpecKey(key.replace(/_/g, ' '))] = sanitizeText(String(val));
        }
      }
    }

    // Add availability
    if (parsed.availability && parsed.availability !== 'null') {
      flatSpecs['Availability'] = sanitizeText(String(parsed.availability));
    }

    // Store the full enriched data
    const enriched = {
      brand: parsed.brand || null,
      title: parsed.title || null,
      sku: parsed.sku || null,
      price: parsed.price || null,
      currency: parsed.currency || null,
      description: parsed.description || null,
      materials: parsed.materials || [],
      categories: parsed.categories || [],
      images: parsed.images || [],
      variants: parsed.variants || [],
      confidence: parsed.confidence || 'low',
      missingFields: parsed.missing_fields || []
    };

    console.log(`[Gemini] Extracted ${Object.keys(flatSpecs).length} specs (confidence: ${enriched.confidence})`);
    return { specs: flatSpecs, enriched };

  } catch (error) {
    console.warn('[Gemini] Spec extraction failed:', error.message);
    return { specs: {}, enriched: {} };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE SELECTION + LENS RESULT PARSING
// ─────────────────────────────────────────────────────────────────────────────

/** Reject known non-product images (logos, icons, placeholders). */
function isNonProductImage(src) {
  if (!src) return true;
  const lower = src.toLowerCase();
  return (
    lower.includes('svgviewer') ||
    lower.includes('logo') ||
    lower.includes('icon') ||
    lower.includes('favicon') ||
    /frame_\d+|screenshot_/i.test(lower)
  );
}

/**
 * Pick the best product image for Google Lens.
 * 1) When from Shopify JSON: use images[0] (main product shot).
 * 2) Otherwise: prefer URL containing product handle or SKU, avoid logos.
 */
function pickProductImage(images, productUrl, sku = '', fromShopify = false) {
  if (!images?.length) return null;

  // Shopify JSON images are ordered; first is the main product photo
  if (fromShopify) return images[0] || null;

  const handle = productUrl.split('/products/')[1]?.split('?')[0] || '';
  const handleSlug = handle.replace(/-/g, ' ');

  // Prefer image whose path contains handle (e.g. chopard-happy-sport-...) or SKU
  for (const src of images) {
    if (isNonProductImage(src) || !/\.(jpe?g|webp)(\?|$)/i.test(src)) continue;
    const path = src.split('?')[0].toLowerCase();
    if (handle && path.includes(handle.toLowerCase())) return src;
    if (sku && path.includes(sku)) return src;
  }

  // Fallback: first jpg that isn't a logo
  for (const src of images) {
    if (isNonProductImage(src)) continue;
    if (/\.(jpe?g|webp)(\?|$)/i.test(src)) return src;
  }

  return images[0] || null;
}

/**
 * Recursively collect objects that look like product items (have link/url).
 * Bright Data may nest results under different keys.
 */
function collectProductLinks(obj, visited = new WeakSet(), seenUrls = new Set(), out = [], depth = 0) {
  if (!obj || depth > 8) return out;
  if (typeof obj === 'object' && visited.has(obj)) return out;
  if (typeof obj === 'object') visited.add(obj);

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object') {
        const url = item.link || item.url || item.product_link || item.page_url;
        if (url && typeof url === 'string' && url.startsWith('http') && !url.includes('google.com')) {
          const key = url.split('?')[0].toLowerCase();
          if (!seenUrls.has(key)) {
            seenUrls.add(key);
            out.push(item);
          }
        }
        collectProductLinks(item, visited, seenUrls, out, depth + 1);
      }
    }
    return out;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      collectProductLinks(v, visited, seenUrls, out, depth + 1);
    }
  }
  return out;
}

/**
 * Check if domain is a low-quality or spam site
 */
function isLowQualityDomain(url) {
  if (!url) return true;
  
  const lowQualityPatterns = [
    /safelearn/i,
    /treasure/i,
    /alibaba/i,
    /aliexpress/i,
    /dhgate/i,
    /wish\.com/i,
    /temu\.com/i,
    /shein\.com/i,
    /pinterest/i,
    /facebook/i,
    /instagram/i,
    /twitter/i,
    /reddit/i,
    /youtube/i,
    /tiktok/i,
    /\/search/i,
    /\/category/i,
    /\/collection/i
  ];
  
  return lowQualityPatterns.some(pattern => pattern.test(url));
}

/**
 * Parse Lens JSON - traverse structure and extract product listings.
 */
function parseLensResults(lensData) {
  const items = collectProductLinks(lensData);
  const results = [];

  for (const item of items) {
    const url = item.link || item.url || item.product_link || item.page_url;
    const title = item.title || item.name || item.text || '';
    if (!url || !url.startsWith('http') || url.includes('google.com')) continue;
    
    // Skip low-quality domains
    if (isLowQualityDomain(url)) {
      console.log(`[Aggregator] Skipping low-quality domain: ${url}`);
      continue;
    }

    let price = null;
    if (item.price) {
      price = typeof item.price === 'object'
        ? (item.price.value ?? item.price.extracted ?? item.price.extracted_value)
        : item.price;
    }

    results.push({
      url,
      title: typeof title === 'string' ? title : '',
      price,
      image: item.thumbnail || item.image || null,
      platform: friendlyPlatformName(url),
      domain: extractDomain(url),
      source: 'google_lens'
    });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DATA HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function fetchShopifyJson(productUrl) {
  try {
    const u = new URL(productUrl);
    const cleanPath = u.pathname.replace(/\/$/, '').split('?')[0];
    const jsonUrl = `${u.origin}${cleanPath}.json`;
    console.log(`[Shopify] ${jsonUrl}`);
    const nodeFetch = require('node-fetch');
    const res = await nodeFetch(jsonUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.product || null;
  } catch (e) {
    console.warn('[Shopify] Failed:', e.message);
    return null;
  }
}

function extractSku(shopifyProduct, productUrl) {
  // 1. Shopify variant SKU
  const sku = shopifyProduct?.variants?.[0]?.sku?.trim();
  if (sku && sku.length > 3) return sku;

  // 2. body_html text patterns
  if (shopifyProduct?.body_html) {
    const $ = cheerio.load(shopifyProduct.body_html);
    const text = $.text();
    const patterns = [
      /manufacturer\s+code[:\s]+([A-Z0-9][A-Z0-9\-\.]{3,20})/i,
      /reference[:\s#.]+([A-Z0-9][A-Z0-9\-\.]{3,20})/i,
      /model\s+(?:no|number|#)[:\s]+([A-Z0-9][A-Z0-9\-\.]{4,20})/i,
      /ref[:\s#.]+([A-Z0-9][A-Z0-9\-\.]{4,20})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return m[1].trim();
    }
  }

  // 3. URL slug
  try {
    const slug = new URL(productUrl).pathname.split('/').filter(Boolean).pop() || '';
    return (
      slug.match(/[_-](\d{5,}-\d{3,})$/)?.[1] ||
      slug.match(/[_-]([a-z0-9]{3,}_[a-z0-9]+)$/i)?.[1]?.toUpperCase() ||
      null
    );
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/aggregator/upload-image
// ─────────────────────────────────────────────────────────────────────────────

router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('[Aggregator] Uploading image to ImgBB...');

    // Upload to ImgBB (free image hosting)
    const formData = new FormData();
    formData.append('image', req.file.buffer.toString('base64'));
    
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ImgBB upload failed: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.data?.url) {
      throw new Error('ImgBB upload failed: No URL returned');
    }

    const imageUrl = data.data.url;
    console.log('[Aggregator] Image uploaded successfully:', imageUrl);

    return res.json({
      success: true,
      imageUrl: imageUrl,
      deleteUrl: data.data.delete_url
    });

  } catch (err) {
    console.error('[Aggregator] Image upload error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/aggregator/search
// ─────────────────────────────────────────────────────────────────────────────

router.post('/search', async (req, res) => {
  try {
    const { url, brand: inputBrand, model: inputModel, sku: inputSku, imageUrl } = req.body;

    let productBrand = inputBrand?.trim() || '';
    let productTitle = inputModel?.trim() || '';
    let productSku = inputSku?.trim() || '';
    let sourceProduct = null;
    let fromShopify = false;

    // Step 1: Get product data
    if (url?.trim()) {
      const cleanUrl = url.trim().split('?')[0];

      // Stage A: Try Shopify JSON first (no Bright Data cost)
      const shopifyData = await fetchShopifyJson(cleanUrl);

      if (shopifyData) {
        fromShopify = true;
        productBrand = shopifyData.vendor?.trim() || productBrand;
        productTitle = shopifyData.title?.trim() || productTitle;
        if (!productSku) productSku = extractSku(shopifyData, cleanUrl) || '';

        const images = (shopifyData.images || []).map(i => i.src).filter(Boolean);
        const $ = cheerio.load(shopifyData.body_html || '');

        sourceProduct = {
          url: cleanUrl,
          title: productTitle,
          brand: productBrand,
          sku: productSku,
          price: shopifyData.variants?.[0]?.price ? `$${shopifyData.variants[0].price}` : '',
          description: $.text().replace(/\s+/g, ' ').trim().slice(0, 600),
          images: images.slice(0, 5),
          platform: 'The Solist',
          domain: 'thesolist.com',
          source: 'source',
        };
      } else {
        // Stage B: Web Unlocker + cheerio fallback
        try {
          const unlockResult = await unlockUrl(cleanUrl);
          const html = unlockResult.html;
          const $ = cheerio.load(html);

          productTitle = productTitle
            || $('h1').first().text().trim()
            || $('meta[property="og:title"]').attr('content')
            || '';
          productBrand = productBrand
            || $('[itemprop="brand"]').text().trim()
            || $('[class*="brand"]').first().text().trim();

          if (!productSku) {
            const bodyText = $('body').text();
            const m = bodyText.match(/manufacturer\s+code[:\s]+([A-Z0-9][A-Z0-9\-]{3,20})/i)
              || bodyText.match(/reference[:\s#.]+([A-Z0-9][A-Z0-9\-]{3,20})/i);
            if (m?.[1]) productSku = m[1].trim();
          }

          const images = [];
          const seenImgs = new Set();
          const ogImg = $('meta[property="og:image"]').attr('content');
          if (ogImg) { images.push(ogImg); seenImgs.add(ogImg); }

          $('img').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
            if (!src || seenImgs.has(src)) return;
            if (src.includes('logo') || src.includes('icon')) return;
            if (src.startsWith('http') || src.startsWith('//')) {
              const full = src.startsWith('//') ? 'https:' + src : src;
              seenImgs.add(src);
              images.push(full);
            }
          });

          sourceProduct = {
            url: cleanUrl,
            title: productTitle,
            brand: productBrand,
            sku: productSku,
            price: $('[class*="price"]').first().text().trim(),
            description: $('[class*="description"]').first().text().trim().slice(0, 600),
            images: images.slice(0, 5),
            platform: 'The Solist',
            domain: 'thesolist.com',
            source: 'source',
          };
        } catch (scrapeErr) {
          console.error('[Aggregator] Scrape error:', scrapeErr.message);
          const slug = cleanUrl.split('/').filter(Boolean).pop() || '';
          productTitle = productTitle || slug.replace(/-/g, ' ');
          if (!productSku) productSku = slug.match(/[_-](\d{5,}-\d{3,})$/)?.[1] || '';
          sourceProduct = {
            url: cleanUrl,
            title: productTitle,
            brand: productBrand,
            sku: productSku,
            price: '',
            description: '',
            images: [],
            platform: 'The Solist',
            domain: 'thesolist.com',
            source: 'source'
          };
        }
      }
    }

    if (!productBrand && !productTitle && !productSku && !imageUrl) {
      return res.status(400).json({ error: 'Could not extract product info.' });
    }

    // Step 2: Pick the best product image for Google Lens (must be actual product photo)
    const cleanUrl = url?.trim()?.split('?')[0] || '';
    const productImageUrl = imageUrl || pickProductImage(
      sourceProduct?.images || [],
      cleanUrl,
      productSku,
      fromShopify
    );
    console.log(`[Aggregator] Image for Lens: ${productImageUrl} (fromShopify=${fromShopify}, uploaded=${!!imageUrl})`);

    // Step 3: Google Lens — exact_matches first, visual_matches fallback
    let lensResults = [];
    let lensDebug = {
      imageUrl: productImageUrl,
      resultCount: 0,
      error: null,
      tab: null
    };

    if (productImageUrl) {
      try {
        const lensData = await lensSearch(productImageUrl, { brdLens: 'exact_matches' });
        lensResults = parseLensResults(lensData);
        lensDebug.resultCount = lensResults.length;
        lensDebug.tab = 'exact_matches';
        console.log(`[Aggregator] Lens exact_matches: ${lensResults.length} results`);
      } catch (err) {
        lensDebug.error = err.message;
        console.warn(`[Aggregator] Lens exact_matches failed:`, err.message);
      }

      // Fallback: if exact_matches returned 0 results, try visual_matches
      if (lensResults.length === 0) {
        try {
          console.log(`[Aggregator] Falling back to visual_matches...`);
          const lensData = await lensSearch(productImageUrl, { brdLens: 'visual_matches' });
          lensResults = parseLensResults(lensData);
          lensDebug.resultCount = lensResults.length;
          lensDebug.tab = 'visual_matches';
          lensDebug.error = null;
          console.log(`[Aggregator] Lens visual_matches: ${lensResults.length} results`);
        } catch (err) {
          lensDebug.error = err.message;
          console.warn(`[Aggregator] Lens visual_matches failed:`, err.message);
        }
      }

      if (lensResults.length === 0 && !lensDebug.error) {
        lensDebug.error = 'No product links found in exact_matches or visual_matches.';
      }
    } else {
      lensDebug.error = 'No product image available for Lens search';
      console.warn('[Aggregator] No image available for Lens search');
    }

    // Step 4: Strict relevance filtering — model number + keyword matching
    const sourceUrl = sourceProduct?.url || '';
    const isSolistSource = sourceUrl.toLowerCase().includes('thesolist.com');
    const filteredResults = filterAndScoreResults(lensResults, {
      sourceUrl,
      sourceTitle: productTitle,
      sourceBrand: productBrand,
      sourceSku: productSku,
      maxResults: 5
    });

    // Step 5: If source is from The Solist, prepend it as first result for comparison
    const allResults = isSolistSource && sourceProduct
      ? [{ ...sourceProduct, isSource: true, source: 'source' }, ...filteredResults]
      : filteredResults;

    console.log(`[Aggregator] Returning ${allResults.length} results${isSolistSource ? ' (incl. Solist source)' : ''}`);

    return res.json({
      success: true,
      query: {
        brand: productBrand,
        sku: productSku,
        imageSearch: !!imageUrl
      },
      sourceProduct,
      results: allResults,
      meta: {
        lens: lensResults.length,
        total: allResults.length
      },
      debug: {
        lens: lensDebug
      }
    });

  } catch (err) {
    console.error('[Aggregator] Fatal:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STANDARDIZED EXTRACTION (generic, any URL)
// ─────────────────────────────────────────────────────────────────────────────

const PRICE_REGEX = /[\$€£¥₹]\s*[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*[\$€£¥₹]|[\d,]+(?:\.\d{2})?/g;

function parsePriceAmount(str) {
  if (!str || typeof str !== 'string') return null;
  const num = parseFloat(str.replace(/[^\d.]/g, ''));
  return isNaN(num) ? null : num;
}

function extractPricesFromHtml($) {
  let priceSelling = null;
  let priceMrp = null;
  let priceSellingDisplay = '';
  let priceMrpDisplay = null;
  let currency = 'USD';

  const itempropPrice = $('[itemprop="price"]').attr('content');
  if (itempropPrice) {
    priceSelling = parsePriceAmount(itempropPrice);
    priceSellingDisplay = $('[itemprop="price"]').first().text().trim() || `$${priceSelling}`;
  }

  const ogPrice = $('meta[property="product:price:amount"]').attr('content');
  const ogCurrency = $('meta[property="product:price:currency"]').attr('content');
  if (ogPrice) {
    const num = parsePriceAmount(ogPrice);
    if (num !== null && priceSelling === null) {
      priceSelling = num;
      priceSellingDisplay = (ogCurrency === 'USD' || !ogCurrency ? '$' : ogCurrency + ' ') + num.toLocaleString();
    }
    if (ogCurrency) currency = ogCurrency;
  }

  const comparePrice = $('[class*="compare"] [class*="price"], [class*="compare-at"], [class*="was"]').first().text();
  const priceText = $('[class*="price"]').text();
  const matches = priceText.match(PRICE_REGEX) || [];

  const nums = [...new Set(matches.map(m => parsePriceAmount(m)))].filter(n => n !== null && n > 0).sort((a, b) => a - b);
  if (nums.length >= 2 && priceMrp === null) {
    priceSelling = priceSelling ?? nums[0];
    priceMrp = nums[nums.length - 1];
    priceMrpDisplay = `$${priceMrp.toLocaleString()}`;
  } else if (nums.length === 1 && priceSelling === null) {
    priceSelling = nums[0];
    priceSellingDisplay = priceSellingDisplay || `$${priceSelling.toLocaleString()}`;
  }

  if (comparePrice) {
    const mrpNum = parsePriceAmount(comparePrice);
    if (mrpNum && mrpNum > (priceSelling || 0)) {
      priceMrp = mrpNum;
      priceMrpDisplay = comparePrice.trim();
    }
  }

  let discountPercent = null;
  if (priceMrp && priceSelling && priceMrp > priceSelling) {
    discountPercent = Math.round(((priceMrp - priceSelling) / priceMrp) * 100);
  }

  return {
    priceSelling,
    priceSellingDisplay: priceSellingDisplay || (priceSelling != null ? `$${priceSelling.toLocaleString()}` : ''),
    priceMrp,
    priceMrpDisplay,
    currency: currency || null,
    discountPercent
  };
}

function extractJsonLdProduct(html) {
  try {
    const $ = cheerio.load(html);
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const json = JSON.parse($(scripts[i]).html() || '{}');
      const items = Array.isArray(json) ? json : (json['@graph'] || [json]);
      for (const item of items) {
        if (item['@type'] === 'Product' || (item['@type'] && item['@type'].includes?.('Product'))) {
          return item;
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

/** Map extracted data to StandardizedListing. */
function extractStandardized(html, url) {
  const $ = cheerio.load(html);
  const domain = extractDomain(url);
  const platform = friendlyPlatformName(url);

  let title = '';
  let description = '';
  let brand = null;
  let sku = null;
  let reference = null;
  let images = [];
  let priceSelling = null;
  let priceSellingDisplay = '';
  let priceMrp = null;
  let priceMrpDisplay = null;
  let currency = null;
  let discountPercent = null;
  let extractionQuality = 0;
  const maxQuality = 8; // Number of key fields we're extracting

  const ld = extractJsonLdProduct(html);
  if (ld) {
    title = ld.name || ld.title || '';
    description = (typeof ld.description === 'string' ? ld.description : '') || '';
    brand = ld.brand?.name || ld.brand || null;
    sku = ld.sku || null;
    if (ld.image) {
      const imgs = Array.isArray(ld.image) ? ld.image : [ld.image];
      images = imgs.slice(0, 10).map(img => ({
        url: typeof img === 'string' ? img : img?.url || '',
        alt: typeof img === 'object' ? img?.caption : undefined,
        primary: false
      })).filter(i => i.url);
    }
    const offer = ld.offers;
    if (offer) {
      const o = Array.isArray(offer) ? offer[0] : offer;
      priceSelling = o?.price ? parsePriceAmount(String(o.price)) : null;
      priceSellingDisplay = priceSelling != null ? `${priceSelling.toLocaleString()}` : '';
      currency = o?.priceCurrency || null;
    }
  }

  // Enhanced title extraction with fallback chain
  if (!title || title.length < 10) {
    title = title
      || $('meta[property="og:title"]').attr('content')
      || $('meta[property="og:product:title"]').attr('content')
      || $('h1.product-title').first().text().trim()
      || $('h1[class*="product"]').first().text().trim()
      || $('.product-name').first().text().trim()
      || $('[itemprop="name"]').first().text().trim()
      || $('h1').first().text().trim()
      || '';

    // Remove noise from title
    title = title
      .replace(/\s*[-|]\s*Buy Now.*$/i, '')
      .replace(/\s*[-|]\s*Free Shipping.*$/i, '')
      .replace(/\s*[-|]\s*[A-Z][a-z]+\.(com|net|org).*$/i, '')
      .trim();
  }
  if (title && title.length >= 10) extractionQuality++;

  // Enhanced description extraction
  description = description
    || $('meta[property="og:description"]').attr('content')
    || $('meta[name="description"]').attr('content')
    || $('[itemprop="description"]').first().text().trim()
    || $('.product-description').first().text().trim()
    || $('[class*="description"]').first().text().trim()
    || $('[class*="detail"]').first().text().trim()
    || '';

  // Clean and truncate description
  description = description
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
  if (description) extractionQuality++;

  // Enhanced brand extraction
  brand = brand
    || $('meta[property="product:brand"]').attr('content')
    || $('meta[property="og:brand"]').attr('content')
    || $('[itemprop="brand"]').first().text().trim()
    || $('[itemprop="brand"] [itemprop="name"]').first().text().trim()
    || $('.brand-name').first().text().trim()
    || $('[class*="brand"]').first().text().trim()
    || null;

  // Normalize brand to title case
  if (brand && brand.length > 0) {
    brand = brand.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    extractionQuality++;
  }

  // Enhanced SKU extraction
  sku = sku
    || $('[itemprop="sku"]').first().text().trim()
    || $('[itemprop="productID"]').first().text().trim()
    || $('.product-sku').first().text().trim()
    || $('[class*="sku"]').first().text().replace(/SKU:?\s*/i, '').trim()
    || null;
  if (sku) extractionQuality++;

  // Enhanced reference extraction
  reference = $('body').text().match(/reference[:\s#.]+([A-Z0-9][A-Z0-9\-\.]{4,20})/i)?.[1]?.trim()
    || $('body').text().match(/manufacturer\s+code[:\s]+([A-Z0-9][A-Z0-9\-\.]{3,20})/i)?.[1]?.trim()
    || $('body').text().match(/model\s+(?:no|number|#)[:\s]+([A-Z0-9][A-Z0-9\-\.]{4,20})/i)?.[1]?.trim()
    || null;

  // Enhanced image extraction with quality filtering
  if (images.length === 0) {
    const og = $('meta[property="og:image"]').attr('content');
    if (og) images.push({ url: og, primary: true });

    const seen = new Set(images.map(i => i.url));

    // Try specific product image selectors first
    $('img[itemprop="image"], .product-image img, .gallery img, img[class*="product"]').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
      if (!src || seen.has(src)) return;

      // Filter out low-quality images
      if (isNonProductImage(src)) return;
      if (src.includes('thumbnail') && !src.includes('product')) return;

      const full = src.startsWith('//') ? 'https:' + src : src;
      if (full.startsWith('http')) {
        seen.add(src);
        images.push({ url: full, primary: false });
      }
    });

    // Fallback to all images if still none found
    if (images.length === 0) {
      $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
        if (!src || seen.has(src) || isNonProductImage(src)) return;
        const full = src.startsWith('//') ? 'https:' + src : src;
        if (full.startsWith('http')) {
          seen.add(src);
          images.push({ url: full, primary: false });
        }
      });
    }
  }
  if (images.length > 0) extractionQuality++;

  // Enhanced price extraction
  const priceData = extractPricesFromHtml($);
  if (!priceSellingDisplay && priceData.priceSellingDisplay) priceSellingDisplay = priceData.priceSellingDisplay;
  if (priceSelling === null) priceSelling = priceData.priceSelling;
  if (priceMrp === null) priceMrp = priceData.priceMrp;
  if (priceMrpDisplay === null) priceMrpDisplay = priceData.priceMrpDisplay;
  if (currency === null) currency = priceData.currency;
  if (discountPercent === null) discountPercent = priceData.discountPercent;

  if (priceSelling !== null) extractionQuality++;

  // Enhanced specs extraction
  const specs = {};

  // Try structured tables first
  $('table[class*="spec"] tr, table[class*="detail"] tr, table[class*="attribute"] tr').each((_, el) => {
    const cells = $(el).find('td, th');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim().replace(/:$/, '');
      const val = $(cells[1]).text().trim();
      if (key && val && key.length < 50) {
        specs[key] = val;
      }
    }
  });

  // Try definition lists
  $('dl[class*="spec"], dl[class*="detail"], dl[class*="attribute"]').each((_, dl) => {
    $(dl).find('dt').each((i, dt) => {
      const key = $(dt).text().trim().replace(/:$/, '');
      const dd = $(dt).next('dd');
      const val = dd.text().trim();
      if (key && val && key.length < 50) {
        specs[key] = val;
      }
    });
  });

  // Try list items with colons
  $('[class*="spec"] li, [class*="attribute"] li, [class*="detail"] li').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes(':')) {
      const [key, ...val] = text.split(':');
      if (key?.trim() && val.length && key.trim().length < 50) {
        specs[key.trim()] = val.join(':').trim();
      }
    }
  });

  // Limit to 50 specs
  const specKeys = Object.keys(specs).slice(0, 50);
  const limitedSpecs = {};
  specKeys.forEach(k => limitedSpecs[k] = specs[k]);

  if (Object.keys(limitedSpecs).length > 0) extractionQuality++;

  const rating = $('[itemprop="ratingValue"]').attr('content');
  const reviewCount = $('[itemprop="reviewCount"]').text().trim();
  if (rating) extractionQuality++;

  // Calculate extraction quality score (0-100)
  const qualityScore = Math.round((extractionQuality / maxQuality) * 100);

  return {
    url,
    platform,
    domain,
    title: title || '',
    description: description || '',
    brand: brand || null,
    sku: sku || null,
    reference: reference || null,
    priceSelling,
    priceSellingDisplay: priceSellingDisplay || '',
    priceMrp,
    priceMrpDisplay,
    currency,
    discountPercent,
    images: images.slice(0, 10).map((img, i) => ({
      url: typeof img === 'string' ? img : img.url,
      alt: typeof img === 'object' ? img.alt : undefined,
      primary: i === 0
    })),
    specs: limitedSpecs,
    condition: null,
    availability: null,
    rating: rating ? parseFloat(rating) : null,
    reviewCount: reviewCount || null,
    extractionQuality: qualityScore,
    scrapedAt: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE ATTRIBUTION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate URL is valid HTTP(S) URL
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate confidence level
 */
function isValidConfidence(confidence) {
  return confidence === 'high' || confidence === 'medium' || confidence === 'low';
}

/**
 * Create source attribution for a specification
 */
function createSourceAttribution(url, platform, confidence = 'high') {
  // Validate inputs
  if (!isValidUrl(url)) {
    console.warn('[SourceAttribution] Invalid URL provided:', url);
    url = 'https://unknown.com';
  }
  
  if (!isValidConfidence(confidence)) {
    console.warn('[SourceAttribution] Invalid confidence level:', confidence);
    confidence = 'medium';
  }
  
  return {
    platform: platform || 'Unknown',
    url: url,
    confidence: confidence,
    extractedAt: new Date().toISOString()
  };
}

/**
 * Create source attribution map for all specs
 */
function createSpecSourcesMap(specs, url, platform, confidence = 'high') {
  const specSources = {};
  const sourceAttribution = createSourceAttribution(url, platform, confidence);
  
  for (const key of Object.keys(specs)) {
    specSources[key] = sourceAttribution;
  }
  
  return specSources;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/aggregator/detail
// ─────────────────────────────────────────────────────────────────────────────

router.post('/detail', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const unlockResult = await unlockUrl(url);
    
    // Check if page is unavailable
    if (!unlockResult.available) {
      return res.json({
        success: true,
        listing: {
          url,
          status: 'unavailable',
          reason: unlockResult.reason,
          available: false,
          title: null,
          description: null,
          images: [],
          specs: {},
          specSources: {},
          platform: friendlyPlatformName(url),
          domain: extractDomain(url)
        }
      });
    }

    const html = unlockResult.html;
    if (!html) {
      return res.status(502).json({ error: 'Failed to fetch page content.' });
    }

    // Extract basic listing data
    const listing = extractStandardized(html, url);
    listing.available = true;
    listing.status = 'available';

    // Extract specifications using Gemini AI
    const productContext = {
      brand: listing.brand,
      title: listing.title,
      sku: listing.sku,
      price: listing.priceSellingDisplay || listing.priceSelling
    };
    
    const geminiResult = await extractSpecsWithGemini(html, productContext);
    
    // Merge Gemini specs with HTML-parsed specs
    const mergedSpecs = {
      ...listing.specs,
      ...geminiResult.specs
    };
    
    // Enrich listing with Gemini data if our HTML extraction missed things
    const enriched = geminiResult.enriched || {};
    if (!listing.description && enriched.description) {
      listing.description = enriched.description;
    }
    if (!listing.brand && enriched.brand) {
      listing.brand = enriched.brand;
    }
    if (enriched.materials && enriched.materials.length > 0 && !mergedSpecs['Materials']) {
      mergedSpecs['Materials'] = enriched.materials.join(', ');
    }
    
    // Create source attribution for all specs
    const platform = friendlyPlatformName(url);
    const confidence = enriched.confidence || 'medium';
    const specSources = createSpecSourcesMap(mergedSpecs, url, platform, confidence);
    
    // Update listing with merged specs and sources
    listing.specs = mergedSpecs;
    listing.specSources = specSources;
    listing.geminiConfidence = confidence;
    listing.missingFields = enriched.missingFields || [];

    return res.json({
      success: true,
      listing
    });
  } catch (err) {
    console.error('[Aggregator] Detail error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
