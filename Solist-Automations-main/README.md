# aLister Enterprise Demo Portal

A full-stack enterprise demo portal for aLister — built with Node.js + Express (backend) and React + Vite (frontend).

---

## Modules

| # | Module | Description |
|---|--------|-------------|
| 1 | **Listing Aggregator** | Paste a thesolist.com URL or enter brand + model → find all listings across 25+ luxury platforms |
| 2 | **Price Tracker** | Compare live pricing across luxury resale/retail sites with region flags and best-price highlighting |
| 3 | **Shopify Generator** | AI-powered Shopify listing generation: title, description, bullets, SEO keywords, meta, collections |

---

## Prerequisites

- Node.js 18+
- A **Bright Data** account with:
  - SERP API zone (`serp_api1`)
  - Web Unlocker zone (`web_unlocker1`)
  - Your API key
- An **Anthropic** API key (for Module 3 - Shopify Generator)

---

## Setup

### 1. Clone / extract the project

```bash
cd alister
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```



### 3. Install dependencies

```bash
# Install all (root + client)
npm run install:all
```

Or manually:
```bash
npm install
cd client && npm install
```

### 4. Run in development

```bash
npm run dev
```

This starts:
- **Backend** → http://localhost:3001
- **Frontend** → http://localhost:5173

Open http://localhost:5173 in your browser.

---

## Production Build

```bash
npm run build       # Builds React into client/dist
npm start           # Serves everything from port 3001
```

Open http://localhost:3001

---



