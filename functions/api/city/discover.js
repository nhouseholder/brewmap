// POST /api/city/discover — On-demand scrape + cache for uncached cities
// Queries Overpass, generates flavor data, writes to KV, returns shops.
// Grows city coverage organically as users search new locations.

import { queryOverpass } from '../../lib/overpass.mjs';
import { generateFlavorData } from '../../lib/flavors.mjs';

const KV_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
const COOLDOWN_SECONDS = 60; // Rate limit: 1 discover per slug per 60s

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { lat, lng, name, radiusMi } = body;

  // Validate inputs
  if (typeof lat !== 'number' || lat < -90 || lat > 90) return json({ error: 'Invalid latitude' }, 400);
  if (typeof lng !== 'number' || lng < -180 || lng > 180) return json({ error: 'Invalid longitude' }, 400);
  if (!name || typeof name !== 'string' || name.length > 100) return json({ error: 'Invalid city name' }, 400);
  const radius = typeof radiusMi === 'number' ? Math.min(Math.max(radiusMi, 1), 25) : 5;

  const slug = slugify(name);
  if (!slug || slug.length > 64) return json({ error: 'Could not generate valid slug' }, 400);

  // Check if already cached
  const existing = await env.CACHE.get(`coffee:city:${slug}:shops`, 'json');
  if (existing?.shops?.length) {
    return json({
      available: true,
      city: slug,
      label: existing.label || name,
      lat: existing.lat,
      lng: existing.lng,
      updatedAt: existing.updatedAt,
      shopCount: existing.shopCount,
      shops: existing.shops,
      source: 'cached',
    });
  }

  // Rate limit check
  const cooldownKey = `discover:cooldown:${slug}`;
  const cooldown = await env.CACHE.get(cooldownKey);
  if (cooldown) {
    return json({ error: 'This city was recently discovered. Please wait a moment and try again.', retryAfter: 60 }, 429);
  }

  // Set cooldown immediately to prevent parallel requests
  await env.CACHE.put(cooldownKey, '1', { expirationTtl: COOLDOWN_SECONDS });

  try {
    // Query Overpass for coffee shops
    const radiusMeters = radius * 1609.34;
    const rawShops = await queryOverpass(lat, lng, radiusMeters);

    // Generate flavor data for each shop
    const shops = rawShops.map(shop => ({
      ...shop,
      ...generateFlavorData(shop.name),
      dataSource: 'ai-estimate',
    }));

    const now = new Date().toISOString();

    // Write to KV — city shops
    const cityData = {
      city: slug,
      label: name,
      lat, lng,
      updatedAt: now,
      shopCount: shops.length,
      shops,
    };
    await env.CACHE.put(`coffee:city:${slug}:shops`, JSON.stringify(cityData), { expirationTtl: KV_TTL_SECONDS });

    // Write city metadata
    await env.CACHE.put(`coffee:city:${slug}:meta`, JSON.stringify({
      name, lat, lng,
      shopCount: shops.length,
      lastUpdated: now,
    }), { expirationTtl: KV_TTL_SECONDS });

    // Update cities index (add this city if not already present)
    await updateCitiesIndex(env, slug, name, lat, lng, shops.length);

    return json({
      available: true,
      city: slug,
      label: name,
      lat, lng,
      updatedAt: now,
      shopCount: shops.length,
      shops,
      source: 'discovered',
    });
  } catch (err) {
    console.error('Discover error:', err);
    return json({ error: 'Failed to discover coffee shops. The map database may be temporarily unavailable.' }, 502);
  }
}

async function updateCitiesIndex(env, slug, name, lat, lng, shopCount) {
  try {
    const index = await env.CACHE.get('coffee:cities:index', 'json');
    if (!index) return; // No index yet — harvester will create it

    // Don't duplicate
    if (index.cities.some(c => c.slug === slug)) return;

    index.cities.push({ slug, name, lat, lng, shopCount });
    index.totalShops = index.cities.reduce((sum, c) => sum + c.shopCount, 0);
    index.lastUpdated = new Date().toISOString();

    await env.CACHE.put('coffee:cities:index', JSON.stringify(index), { expirationTtl: KV_TTL_SECONDS });
  } catch (e) {
    console.error('Failed to update cities index:', e);
    // Non-fatal — city data is still cached, just not in the index
  }
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-cache',
    },
  });
}
