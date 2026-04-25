// POST /api/city/discover — On-demand scrape + cache for uncached cities
// Queries Overpass, generates flavor data, writes to KV, returns shops.
// Grows city coverage organically as users search new locations.

import { queryOverpass } from '../../lib/overpass.mjs';
import { generateFlavorData } from '../../lib/flavors.mjs';

const KV_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
const COOLDOWN_SECONDS = 60; // Rate limit: 1 discover per slug per 60s
const IP_COOLDOWN_SECONDS = 30; // Per-IP rate limit

// ========== HANDLER ==========

export async function onRequest(context) {
  const { env, request } = context;

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', 'INVALID_INPUT', 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 'INVALID_INPUT', 400);
  }

  const validation = validateInputs(body);
  if (validation.error) {
    return errorResponse(validation.error, 'INVALID_INPUT', 400);
  }
  const { lat, lng, name, radius, slug } = validation;

  // Check if already cached
  const existing = await env.CACHE.get(`coffee:city:${slug}:shops`, 'json');
  if (existing?.shops?.length) {
    return successResponse({
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

  // Rate limit checks
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const slugCooldown = await env.CACHE.get(`discover:cooldown:${slug}`);
  const ipCooldown = await env.CACHE.get(`discover:cooldown:ip:${clientIp}:${slug}`);

  if (slugCooldown || ipCooldown) {
    return errorResponse(
      'This city was recently discovered. Please wait a moment and try again.',
      'RATE_LIMITED',
      429,
      { retryAfter: COOLDOWN_SECONDS }
    );
  }

  // Set cooldowns immediately to prevent parallel requests
  await env.CACHE.put(`discover:cooldown:${slug}`, '1', { expirationTtl: COOLDOWN_SECONDS });
  await env.CACHE.put(`discover:cooldown:ip:${clientIp}:${slug}`, '1', { expirationTtl: IP_COOLDOWN_SECONDS });

  try {
    const result = await discoverCity(env, lat, lng, name, slug, radius);
    return successResponse(result);
  } catch (err) {
    console.error('Discover error:', err);
    const code = err.message.includes('Overpass') ? 'OVERPASS_UNAVAILABLE' : 'INTERNAL_ERROR';
    return errorResponse(
      'Failed to discover coffee shops. The map database may be temporarily unavailable.',
      code,
      502
    );
  }
}

// ========== SERVICE ==========

async function discoverCity(env, lat, lng, name, slug, radius) {
  const radiusMeters = radius * 1609.34;
  const rawShops = await queryOverpass(lat, lng, radiusMeters);

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

  // NOTE: We intentionally do NOT update the cities index here.
  // The weekly harvester maintains the canonical index.
  // This prevents read-modify-write race conditions on the index.
  // Newly-discovered cities are accessible via direct slug lookup.

  return {
    available: true,
    city: slug,
    label: name,
    lat, lng,
    updatedAt: now,
    shopCount: shops.length,
    shops,
    source: 'discovered',
  };
}

// ========== VALIDATION ==========

function validateInputs(body) {
  const { lat, lng, name, radiusMi } = body;

  if (typeof lat !== 'number' || lat < -90 || lat > 90) {
    return { error: 'Invalid latitude' };
  }
  if (typeof lng !== 'number' || lng < -180 || lng > 180) {
    return { error: 'Invalid longitude' };
  }
  if (!name || typeof name !== 'string' || name.length > 100) {
    return { error: 'Invalid city name' };
  }

  const radius = typeof radiusMi === 'number' ? Math.min(Math.max(radiusMi, 1), 25) : 5;
  const slug = slugify(name);
  if (!slug || slug.length > 64) {
    return { error: 'Could not generate valid slug' };
  }

  return { lat, lng, name, radius, slug };
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
}

// ========== RESPONSE HELPERS ==========

function successResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function errorResponse(message, code, status = 500, extra = {}) {
  return new Response(JSON.stringify({ error: message, code, ...extra }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    },
  });
}
