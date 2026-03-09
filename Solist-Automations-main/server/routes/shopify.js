const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { serpSearch } = require('../brightdata');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Call Gemini API to generate Shopify listing
 */
async function generateWithGemini(prompt) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
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
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

/**
 * Parse structured JSON from Gemini's response
 */
function parseGeminiJson(text) {
  // Remove markdown code fences if present
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    // Try to extract JSON object from within the text
    const match = clean.match(/\{[\s\S]+\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('Could not parse JSON from Gemini response');
  }
}

/**
 * POST /api/shopify/generate
 * Body: { brand: string, title: string, specs: string }
 */
router.post('/generate', async (req, res) => {
  try {
    const { brand, title, specs } = req.body;

    if (!brand || !title || !specs) {
      return res.status(400).json({ error: 'Brand name, product title, and specifications are required.' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your .env file.' });
    }

    console.log(`[Shopify] Generating listing for: ${brand} - ${title}`);

    // Step 1: Web search to gather product context
    let webContext = '';
    try {
      const serpResults = await serpSearch(`${brand} ${title} ${specs}`, { numResults: 5 });
      const snippets = serpResults
        .filter(r => r.snippet || r.description)
        .map(r => `- ${r.title}: ${r.snippet || r.description}`)
        .slice(0, 5)
        .join('\n');
      webContext = snippets ? `\n\nWeb research found:\n${snippets}` : '';
    } catch (err) {
      console.warn('[Shopify] Web search failed, proceeding without context:', err.message);
    }

    // Step 2: Build prompt for Claude
    const prompt = `You are an expert Shopify product listing copywriter specialising in luxury fashion and lifestyle goods. Your task is to generate a complete, conversion-optimised Shopify product listing.

PRODUCT DETAILS:
Brand: ${brand}
Product Title: ${title}
Specifications: ${specs}
${webContext}

Generate a complete Shopify-ready product listing. Return ONLY a valid JSON object (no markdown, no explanation) with exactly this structure:

{
  "title": "SEO-optimised product title (60-80 chars, include brand + model + key descriptor)",
  "metaDescription": "Meta description for SEO (150-160 chars, compelling, include brand/model/key benefit)",
  "shortDescription": "2-3 sentence product hook for above-the-fold display. Evocative, aspirational tone.",
  "longDescription": "Full HTML-formatted product description (400-600 words). Use <p>, <strong>, <ul>, <li> tags. Cover: product story, craftsmanship, materials, occasion, styling suggestions. No markdown.",
  "bulletPoints": [
    "Key feature or benefit 1 (lead with the benefit)",
    "Key feature or benefit 2",
    "Key feature or benefit 3",
    "Key feature or benefit 4",
    "Key feature or benefit 5"
  ],
  "seoKeywords": [
    "primary keyword 1",
    "primary keyword 2",
    "long-tail keyword 3",
    "long-tail keyword 4",
    "long-tail keyword 5",
    "long-tail keyword 6",
    "long-tail keyword 7",
    "long-tail keyword 8",
    "long-tail keyword 9",
    "long-tail keyword 10",
    "long-tail keyword 11",
    "long-tail keyword 12"
  ],
  "searchTags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "shopifyCollections": ["Collection 1", "Collection 2", "Collection 3"],
  "productType": "Shopify product type string",
  "vendor": "${brand}"
}

Important rules:
- Title must be compelling and SEO-rich, not generic
- Long description must use real HTML tags, not markdown
- SEO keywords should be specific and rankable, not too generic
- Collections should be real Shopify collection names appropriate for a luxury fashion store
- All copy should feel premium, editorial, aspirational — never generic or robotic`;

    // Step 3: Call Gemini
    let geminiResponse;
    try {
      geminiResponse = await generateWithGemini(prompt);
    } catch (err) {
      return res.status(502).json({ error: `AI generation error: ${err.message}` });
    }

    // Step 4: Parse the structured response
    let listing;
    try {
      listing = parseGeminiJson(geminiResponse);
    } catch (err) {
      console.error('[Shopify] Parse error, raw response:', geminiResponse);
      return res.status(500).json({
        error: 'Failed to parse AI response into structured listing.',
        raw: geminiResponse
      });
    }

    return res.json({
      success: true,
      query: { brand, title, specs },
      listing: {
        ...listing,
        generatedAt: new Date().toISOString(),
        enrichedWith: webContext ? ['Bright Data Web Search', 'Gemini AI'] : ['Gemini AI']
      }
    });

  } catch (err) {
    console.error('[Shopify] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
