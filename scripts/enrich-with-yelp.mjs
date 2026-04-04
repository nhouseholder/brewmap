#!/usr/bin/env node
// BrewMap — Yelp Enrichment Script
// Reads existing KV data, matches to Yelp businesses, merges ratings + reviews.
// Run after harvest or standalone: node scripts/enrich-with-yelp.mjs
// Dry run (no KV writes): DRY_RUN=1 node scripts/enrich-with-yelp.mjs
// Single city: CITY=portland node scripts/enrich-with-yelp.mjs
// Skip reviews (ratings only): SKIP_REVIEWS=1 node scripts/enrich-with-yelp.mjs

import { searchCityYelp, fetchYelpReviews, matchShops, mergeYelpData } from './lib/yelp.mjs';
import { extractFlavorProfile } from './lib/flavor-extract.mjs';
import { kvPut } from './lib/kv-writer.mjs';

const YELP_API_KEY = process.env.YELP_API_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const DRY_RUN = !!process.env.DRY_RUN;
const SINGLE_CITY = process.env.CITY || null;
const SKIP_REVIEWS = !!process.env.SKIP_REVIEWS;
const STALE_DAYS = 30; // Re-enrich after 30 days

const CITY_DELAY_MS = 1000; // 1s between cities
const REVIEW_DELAY_MS = 300; // 300ms between review fetches

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
  if (!YELP_API_KEY) {
    console.log('⏭️  No YELP_API_KEY set — skipping Yelp enrichment');
    return;
  }

  console.log('☕ BrewMap Yelp Enrichment');
  console.log(`${DRY_RUN ? '🔬 DRY RUN — no KV writes' : '🚀 LIVE — writing to KV'}`);
  if (SKIP_REVIEWS) console.log('⏭️  Skipping reviews (ratings only)');
  if (SINGLE_CITY) console.log(`🎯 Single city: ${SINGLE_CITY}`);

  // Fetch cities index from KV
  const index = await kvGet('coffee:cities:index');
  if (!index?.cities?.length) {
    console.error('❌ No cities index in KV — run harvest first');
    process.exit(1);
  }

  let cities = index.cities;
  if (SINGLE_CITY) {
    cities = cities.filter(c => c.slug === SINGLE_CITY);
    if (cities.length === 0) {
      console.error(`❌ City "${SINGLE_CITY}" not found in index`);
      process.exit(1);
    }
  }

  console.log(`📍 ${cities.length} cities to enrich\n`);

  const stats = { totalShops: 0, totalMatched: 0, totalUnmatched: 0, totalReviews: 0, apiCalls: 0, failures: 0 };

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    console.log(`[${i + 1}/${cities.length}] ${city.name} (${city.shopCount} shops)...`);

    try {
      // 1. Read existing city data from KV
      const cityData = await kvGet(`coffee:city:${city.slug}:shops`);
      if (!cityData?.shops?.length) {
        console.log('  ⚠️  No shops in KV — skipping');
        continue;
      }

      // 2. Check if already enriched recently (skip if all shops fresh)
      const enrichedCount = cityData.shops.filter(s => s.yelpEnrichedAt && !isStale(s.yelpEnrichedAt)).length;
      if (enrichedCount === cityData.shops.length) {
        console.log(`  ⏭️  All ${enrichedCount} shops already enriched (< ${STALE_DAYS} days) — skipping`);
        stats.totalShops += cityData.shops.length;
        stats.totalMatched += enrichedCount;
        continue;
      }

      // 3. Search Yelp for coffee shops in this city
      const radiusMeters = (city.radiusMi || 5) * 1609.34;
      const yelpResults = await searchCityYelp(YELP_API_KEY, city.lat, city.lng, radiusMeters);
      stats.apiCalls += Math.ceil(yelpResults.length / 50); // estimate pages
      console.log(`  🔍 Yelp returned ${yelpResults.length} businesses`);

      // 4. Match Yelp to Overpass shops
      const { matched, unmatched } = matchShops(yelpResults, cityData.shops);
      console.log(`  ✅ Matched: ${matched.length}/${cityData.shops.length} (${Math.round(matched.length / cityData.shops.length * 100)}%)`);

      // 5. Fetch reviews for matched shops (if not skipped)
      const enrichedShops = [];
      for (const { shop, yelpBiz } of matched) {
        let reviews = [];
        if (!SKIP_REVIEWS) {
          reviews = await fetchYelpReviews(YELP_API_KEY, yelpBiz.id);
          stats.apiCalls++;
          stats.totalReviews += reviews.length;
          if (reviews.length > 0) await sleep(REVIEW_DELAY_MS);
        }
        enrichedShops.push(mergeYelpData(shop, yelpBiz, reviews, extractFlavorProfile));
      }

      // 6. Keep unmatched shops with AI estimates
      for (const shop of unmatched) {
        enrichedShops.push({
          ...shop,
          dataSource: shop.dataSource || 'ai-estimate',
        });
      }

      // 7. Write enriched data back to KV
      if (!DRY_RUN) {
        await kvPut(`coffee:city:${city.slug}:shops`, {
          ...cityData,
          shops: enrichedShops,
          yelpEnrichedAt: new Date().toISOString(),
        });
      } else {
        console.log(`  [DRY RUN] Would write ${enrichedShops.length} enriched shops`);
      }

      stats.totalShops += cityData.shops.length;
      stats.totalMatched += matched.length;
      stats.totalUnmatched += unmatched.length;
    } catch (err) {
      console.error(`  ✗ FAILED: ${city.name} — ${err.message}`);
      stats.failures++;

      // Stop on rate limit
      if (err.message.includes('429')) {
        console.error('\n❌ Yelp rate limit reached — stopping. Resume later with CITY=<next-slug>');
        break;
      }
    }

    if (i < cities.length - 1) await sleep(CITY_DELAY_MS);
  }

  // Summary
  console.log('\n📊 Enrichment Summary');
  console.log(`   Shops processed: ${stats.totalShops}`);
  console.log(`   Yelp matched:    ${stats.totalMatched} (${stats.totalShops ? Math.round(stats.totalMatched / stats.totalShops * 100) : 0}%)`);
  console.log(`   Unmatched (AI):  ${stats.totalUnmatched}`);
  console.log(`   Reviews fetched: ${stats.totalReviews}`);
  console.log(`   API calls:       ~${stats.apiCalls}`);
  if (stats.failures > 0) console.log(`   ⚠️  Failures: ${stats.failures}`);
}

function isStale(dateStr) {
  const enrichedAt = new Date(dateStr);
  const now = new Date();
  const daysSince = (now - enrichedAt) / (1000 * 60 * 60 * 24);
  return daysSince > STALE_DAYS;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
