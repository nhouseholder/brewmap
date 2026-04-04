#!/usr/bin/env node
// BrewMap — Website Enrichment Script
// Scrapes coffee shop websites for bean origins, roast levels, and tasting notes.
// Run after harvest/Yelp enrichment: node scripts/enrich-from-websites.mjs
// Dry run: DRY_RUN=1 node scripts/enrich-from-websites.mjs
// Single city: CITY=portland node scripts/enrich-from-websites.mjs

import { scrapeWebsite } from './lib/web-scraper.mjs';
import { extractBeanData } from './lib/bean-extract.mjs';
import { extractFlavorProfile, combineFlavorSources } from './lib/flavor-extract.mjs';
import { kvPut } from './lib/kv-writer.mjs';

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const DRY_RUN = !!process.env.DRY_RUN;
const SINGLE_CITY = process.env.CITY || null;
const STALE_DAYS = 30;
const SCRAPE_DELAY_MS = 500; // Polite: 500ms between fetches

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE_ID}`;

async function kvGet(key) {
  if (!CLOUDFLARE_API_TOKEN) throw new Error('Missing CLOUDFLARE_API_TOKEN');
  const res = await fetch(`${KV_BASE}/values/${encodeURIComponent(key)}`, {
    headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`KV GET failed for "${key}": ${res.status}`);
  return res.json();
}

async function main() {
  console.log('☕ BrewMap Website Enrichment');
  console.log(`${DRY_RUN ? '🔬 DRY RUN — no KV writes' : '🚀 LIVE — writing to KV'}`);
  if (SINGLE_CITY) console.log(`🎯 Single city: ${SINGLE_CITY}`);

  const index = await kvGet('coffee:cities:index');
  if (!index?.cities?.length) {
    console.error('❌ No cities index in KV — run harvest first');
    process.exit(1);
  }

  let cities = index.cities;
  if (SINGLE_CITY) {
    cities = cities.filter(c => c.slug === SINGLE_CITY);
    if (cities.length === 0) {
      console.error(`❌ City "${SINGLE_CITY}" not found`);
      process.exit(1);
    }
  }

  console.log(`📍 ${cities.length} cities to enrich\n`);

  const stats = {
    totalShops: 0, withWebsite: 0, scraped: 0, beanDataFound: 0,
    flavorExtracted: 0, skippedFresh: 0, scrapeFailed: 0,
  };

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    console.log(`[${i + 1}/${cities.length}] ${city.name}...`);

    try {
      const cityData = await kvGet(`coffee:city:${city.slug}:shops`);
      if (!cityData?.shops?.length) { console.log('  ⚠️  No shops — skipping'); continue; }

      let modified = false;
      const enrichedShops = [];

      for (const shop of cityData.shops) {
        stats.totalShops++;

        // Skip if no website
        if (!shop.website) { enrichedShops.push(shop); continue; }
        stats.withWebsite++;

        // Skip if recently scraped
        if (shop.websiteScrapedAt && !isStale(shop.websiteScrapedAt)) {
          stats.skippedFresh++;
          enrichedShops.push(shop);
          continue;
        }

        // Scrape the website
        const scraped = await scrapeWebsite(shop.website);
        if (!scraped) {
          stats.scrapeFailed++;
          enrichedShops.push(shop);
          await sleep(SCRAPE_DELAY_MS);
          continue;
        }
        stats.scraped++;

        // Extract bean data
        const beanData = extractBeanData(scraped.text);

        // Extract flavor profile from website text
        const websiteFlavorResult = extractFlavorProfile([scraped.text], shop.flavorProfile);

        // Build enriched shop
        const enrichedShop = { ...shop, websiteScrapedAt: new Date().toISOString() };

        if (beanData) {
          stats.beanDataFound++;
          if (beanData.origins) enrichedShop.beanOrigins = beanData.origins;
          if (beanData.regions) enrichedShop.beanRegions = beanData.regions;
          if (beanData.roastLevel) enrichedShop.roastLevel = beanData.roastLevel;
          if (beanData.beanType) enrichedShop.beanType = beanData.beanType;
          if (beanData.beanTraits) enrichedShop.beanTraits = beanData.beanTraits;
          if (beanData.processMethod) enrichedShop.processMethod = beanData.processMethod;
          if (beanData.tastingNotes) enrichedShop.websiteTastingNotes = beanData.tastingNotes;

          if (DRY_RUN) {
            const parts = [];
            if (beanData.origins) parts.push('origins: ' + beanData.origins.join(', '));
            if (beanData.roastLevel) parts.push('roast: ' + beanData.roastLevel);
            if (beanData.tastingNotes) parts.push('notes: ' + beanData.tastingNotes);
            console.log(`    🫘 ${shop.name}: ${parts.join(' | ') || 'partial data'} (conf: ${beanData.confidence}%)`);
          }
        }

        // Combine flavor sources: website > reviews > AI
        if (websiteFlavorResult && websiteFlavorResult.dataSource !== 'ai-estimate') {
          const reviewProfile = (shop.flavorSource === 'yelp-reviews') ? shop.flavorProfile : null;
          const combined = combineFlavorSources(
            websiteFlavorResult.flavorProfile,
            reviewProfile,
            null, // AI estimate not needed — we have real data
          );
          enrichedShop.flavorProfile = combined.flavorProfile;
          enrichedShop.flavorTags = combined.flavorTags;
          enrichedShop.flavorSource = 'website';
          stats.flavorExtracted++;
        }

        enrichedShops.push(enrichedShop);
        modified = true;
        await sleep(SCRAPE_DELAY_MS);
      }

      // Write back if modified
      if (modified && !DRY_RUN) {
        await kvPut(`coffee:city:${city.slug}:shops`, {
          ...cityData,
          shops: enrichedShops,
          websiteEnrichedAt: new Date().toISOString(),
        });
        console.log(`  ✓ Updated ${city.name}`);
      }
    } catch (err) {
      console.error(`  ✗ FAILED: ${city.name} — ${err.message}`);
    }
  }

  console.log('\n📊 Website Enrichment Summary');
  console.log(`   Total shops:      ${stats.totalShops}`);
  console.log(`   With website:     ${stats.withWebsite}`);
  console.log(`   Scraped:          ${stats.scraped}`);
  console.log(`   Bean data found:  ${stats.beanDataFound}`);
  console.log(`   Flavor extracted: ${stats.flavorExtracted}`);
  console.log(`   Skipped (fresh):  ${stats.skippedFresh}`);
  console.log(`   Scrape failed:    ${stats.scrapeFailed}`);
}

function isStale(dateStr) {
  return (new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24) > STALE_DAYS;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
