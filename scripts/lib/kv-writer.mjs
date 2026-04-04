// BrewMap — Cloudflare KV writer
// Adapted from MyStrainAI kv-writer.mjs — simplified for coffee shops (no batches/menus)

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE_ID}`;
const KV_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days (survives a missed weekly harvest)

const DRY_RUN = !!process.env.DRY_RUN;

/**
 * Write a key-value pair to Cloudflare KV.
 */
export async function kvPut(key, value, { ttl = KV_TTL_SECONDS } = {}) {
  const body = JSON.stringify(value);
  const sizeKB = Buffer.byteLength(body, 'utf-8') / 1024;

  if (sizeKB > 200) {
    console.warn(`  ⚠️  KV "${key}" is ${sizeKB.toFixed(1)}KB — large value!`);
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would write KV "${key}" (${sizeKB.toFixed(1)}KB)`);
    return;
  }

  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_KV_NAMESPACE_ID) {
    throw new Error('Missing Cloudflare env vars (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE_ID)');
  }

  const ttlParam = ttl ? `?expiration_ttl=${ttl}` : '';
  const url = `${KV_BASE}/values/${encodeURIComponent(key)}${ttlParam}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV PUT failed for "${key}": ${res.status} — ${text}`);
  }

  console.log(`  ✓ KV "${key}" (${sizeKB.toFixed(1)}KB)`);
}

/**
 * Write all shops for a city to KV.
 * Keys: coffee:city:{slug}:meta, coffee:city:{slug}:shops
 */
export async function writeCityToKV(city, shops) {
  const now = new Date().toISOString();

  // City metadata
  await kvPut(`coffee:city:${city.slug}:meta`, {
    name: city.name,
    lat: city.lat,
    lng: city.lng,
    shopCount: shops.length,
    lastUpdated: now,
  });

  // All shops (compact — flavor data + optional Yelp enrichment)
  const compactShops = shops.map(s => {
    const shop = {
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      address: s.address,
      hours: s.hours,
      website: s.website,
      phone: s.phone,
      rating: s.rating,
      reviewCount: s.reviewCount,
      flavorTags: s.flavorTags,
      flavorProfile: s.flavorProfile,
    };
    // Preserve Yelp enrichment fields if present
    if (s.dataSource) shop.dataSource = s.dataSource;
    if (s.yelpId) shop.yelpId = s.yelpId;
    if (s.yelpUrl) shop.yelpUrl = s.yelpUrl;
    if (s.yelpRating != null) shop.yelpRating = s.yelpRating;
    if (s.yelpReviewCount != null) shop.yelpReviewCount = s.yelpReviewCount;
    if (s.yelpReviews) shop.yelpReviews = s.yelpReviews;
    if (s.yelpEnrichedAt) shop.yelpEnrichedAt = s.yelpEnrichedAt;
    // Preserve website/bean enrichment fields if present
    if (s.beanOrigins) shop.beanOrigins = s.beanOrigins;
    if (s.beanRegions) shop.beanRegions = s.beanRegions;
    if (s.roastLevel) shop.roastLevel = s.roastLevel;
    if (s.beanType) shop.beanType = s.beanType;
    if (s.beanTraits) shop.beanTraits = s.beanTraits;
    if (s.processMethod) shop.processMethod = s.processMethod;
    if (s.websiteTastingNotes) shop.websiteTastingNotes = s.websiteTastingNotes;
    if (s.flavorSource) shop.flavorSource = s.flavorSource;
    if (s.websiteScrapedAt) shop.websiteScrapedAt = s.websiteScrapedAt;
    return shop;
  });

  await kvPut(`coffee:city:${city.slug}:shops`, {
    city: city.slug,
    label: city.name,
    lat: city.lat,
    lng: city.lng,
    updatedAt: now,
    shopCount: shops.length,
    shops: compactShops,
  });
}

/**
 * Write the global cities index.
 */
export async function writeCitiesIndex(cities, results) {
  const now = new Date().toISOString();
  let totalShops = 0;

  const citySummaries = cities.map(city => {
    const r = results[city.slug] || { shopCount: 0 };
    totalShops += r.shopCount;
    return {
      slug: city.slug,
      name: city.name,
      lat: city.lat,
      lng: city.lng,
      shopCount: r.shopCount,
    };
  }).filter(c => c.shopCount > 0);

  // Don't overwrite a good index with empty data
  if (citySummaries.length === 0) {
    console.warn('⚠️  All cities have 0 shops — skipping index write to preserve existing data');
    return;
  }

  await kvPut('coffee:cities:index', {
    lastUpdated: now,
    totalShops,
    cities: citySummaries,
  });

  console.log(`\n📊 Cities index: ${citySummaries.length} cities, ${totalShops} total shops`);
}
