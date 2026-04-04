#!/usr/bin/env node
// BrewMap — Coffee Shop Harvester
// Queries Overpass API for 30 US cities, generates flavor profiles, writes to Cloudflare KV.
// Run weekly via GitHub Actions or manually: node scripts/harvest-coffee-shops.mjs
// Dry run (no KV writes): DRY_RUN=1 node scripts/harvest-coffee-shops.mjs

import { queryOverpass, sleep } from './lib/overpass.mjs';
import { generateFlavorData } from './lib/flavors.mjs';
import { writeCityToKV, writeCitiesIndex } from './lib/kv-writer.mjs';

// =========== CITY CONFIG ===========
// 30 major US cities — search radius in miles, converted to meters for Overpass
const CITIES = [
  { slug: 'nyc',            name: 'New York, NY',       lat: 40.7128,  lng: -74.0060,  radiusMi: 3 },
  { slug: 'los-angeles',    name: 'Los Angeles, CA',    lat: 34.0522,  lng: -118.2437, radiusMi: 5 },
  { slug: 'chicago',        name: 'Chicago, IL',        lat: 41.8781,  lng: -87.6298,  radiusMi: 4 },
  { slug: 'houston',        name: 'Houston, TX',        lat: 29.7604,  lng: -95.3698,  radiusMi: 5 },
  { slug: 'phoenix',        name: 'Phoenix, AZ',        lat: 33.4484,  lng: -112.0740, radiusMi: 5 },
  { slug: 'philadelphia',   name: 'Philadelphia, PA',   lat: 39.9526,  lng: -75.1652,  radiusMi: 3 },
  { slug: 'san-antonio',    name: 'San Antonio, TX',    lat: 29.4241,  lng: -98.4936,  radiusMi: 5 },
  { slug: 'san-diego',      name: 'San Diego, CA',      lat: 32.7157,  lng: -117.1611, radiusMi: 5 },
  { slug: 'dallas',         name: 'Dallas, TX',         lat: 32.7767,  lng: -96.7970,  radiusMi: 5 },
  { slug: 'austin',         name: 'Austin, TX',         lat: 30.2672,  lng: -97.7431,  radiusMi: 4 },
  { slug: 'seattle',        name: 'Seattle, WA',        lat: 47.6062,  lng: -122.3321, radiusMi: 3 },
  { slug: 'portland',       name: 'Portland, OR',       lat: 45.5152,  lng: -122.6784, radiusMi: 4 },
  { slug: 'denver',         name: 'Denver, CO',         lat: 39.7392,  lng: -104.9903, radiusMi: 4 },
  { slug: 'nashville',      name: 'Nashville, TN',      lat: 36.1627,  lng: -86.7816,  radiusMi: 4 },
  { slug: 'san-francisco',  name: 'San Francisco, CA',  lat: 37.7749,  lng: -122.4194, radiusMi: 3 },
  { slug: 'miami',          name: 'Miami, FL',          lat: 25.7617,  lng: -80.1918,  radiusMi: 4 },
  { slug: 'atlanta',        name: 'Atlanta, GA',        lat: 33.7490,  lng: -84.3880,  radiusMi: 4 },
  { slug: 'boston',          name: 'Boston, MA',         lat: 42.3601,  lng: -71.0589,  radiusMi: 3 },
  { slug: 'minneapolis',    name: 'Minneapolis, MN',    lat: 44.9778,  lng: -93.2650,  radiusMi: 4 },
  { slug: 'detroit',        name: 'Detroit, MI',        lat: 42.3314,  lng: -83.0458,  radiusMi: 4 },
  { slug: 'las-vegas',      name: 'Las Vegas, NV',      lat: 36.1699,  lng: -115.1398, radiusMi: 5 },
  { slug: 'charlotte',      name: 'Charlotte, NC',      lat: 35.2271,  lng: -80.8431,  radiusMi: 5 },
  { slug: 'new-orleans',    name: 'New Orleans, LA',    lat: 29.9511,  lng: -90.0715,  radiusMi: 4 },
  { slug: 'pittsburgh',     name: 'Pittsburgh, PA',     lat: 40.4406,  lng: -79.9959,  radiusMi: 4 },
  { slug: 'columbus',       name: 'Columbus, OH',       lat: 39.9612,  lng: -82.9988,  radiusMi: 4 },
  { slug: 'indianapolis',   name: 'Indianapolis, IN',   lat: 39.7684,  lng: -86.1581,  radiusMi: 4 },
  { slug: 'milwaukee',      name: 'Milwaukee, WI',      lat: 43.0389,  lng: -87.9065,  radiusMi: 4 },
  { slug: 'salt-lake-city', name: 'Salt Lake City, UT', lat: 40.7608,  lng: -111.8910, radiusMi: 4 },
  { slug: 'galveston',      name: 'Galveston, TX',      lat: 29.3013,  lng: -94.7977,  radiusMi: 5 },
  { slug: 'honolulu',       name: 'Honolulu, HI',       lat: 21.3069,  lng: -157.8583, radiusMi: 4 },
];

const CITY_DELAY_MS = 3000; // 3s between cities (Galveston #29 hit rate limits at 2s)
const MAX_RETRIES = 2; // Retry failed cities up to 2 more times with backoff

// =========== MAIN ===========
async function main() {
  const startTime = Date.now();
  console.log('☕ BrewMap Coffee Shop Harvester');
  console.log(`📍 ${CITIES.length} cities to scan`);
  console.log(`${process.env.DRY_RUN ? '🔬 DRY RUN — no KV writes' : '🚀 LIVE — writing to KV'}\n`);

  const results = {};
  let totalShops = 0;
  let failures = 0;

  for (let i = 0; i < CITIES.length; i++) {
    const city = CITIES[i];
    const radiusMeters = city.radiusMi * 1609.34;

    console.log(`[${i + 1}/${CITIES.length}] ${city.name} (${city.radiusMi}mi radius)...`);

    let succeeded = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoff = attempt * 10000; // 10s, 20s
        console.log(`  ↻ Retry ${attempt}/${MAX_RETRIES} after ${backoff / 1000}s...`);
        await sleep(backoff);
      }
      try {
        const rawShops = await queryOverpass(city.lat, city.lng, radiusMeters);
        const shops = rawShops.map(shop => ({
          ...shop,
          ...generateFlavorData(shop.name),
        }));
        console.log(`  → ${shops.length} shops found`);
        await writeCityToKV(city, shops);
        results[city.slug] = { shopCount: shops.length };
        totalShops += shops.length;
        succeeded = true;
        break;
      } catch (err) {
        console.error(`  ✗ Attempt ${attempt + 1} failed: ${err.message}`);
      }
    }
    if (!succeeded) {
      results[city.slug] = { shopCount: 0 };
      failures++;
    }

    // Rate limit between cities
    if (i < CITIES.length - 1) {
      await sleep(CITY_DELAY_MS);
    }
  }

  // Write cities index
  console.log('\n📝 Writing cities index...');
  await writeCitiesIndex(CITIES, results);

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n✅ Harvest complete in ${elapsed}s`);
  console.log(`   ${CITIES.length - failures}/${CITIES.length} cities succeeded`);
  console.log(`   ${totalShops} total shops cached`);
  if (failures > 0) {
    console.log(`   ⚠️ ${failures} cities failed`);
  }

  // Exit with error if >50% failed (raised from 30% — retry handles transients)
  if (failures > CITIES.length * 0.5) {
    console.error(`\n❌ ${failures}/${CITIES.length} cities failed (>${Math.round(CITIES.length * 0.5)} threshold) — check Overpass API status`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
