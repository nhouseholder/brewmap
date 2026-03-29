// BrewMap — Overpass API query logic
// Extracted from index.html scanArea() to share with harvester

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const CHAINS = [
  'starbucks','dunkin','peet','mcdonald','tim horton','panera','caribou',
  'subway','burger','wendy','taco','pizza','popeye','chick-fil','jack in',
  'sonic','whataburger','ihop','denny','krispy','dairy queen'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Query Overpass for coffee shops near a location.
 * Uses the same 2-phase query as the frontend:
 *   Phase 1: amenity=cafe + cuisine~coffee + shop=coffee
 *   Phase 2 (if <20 results): name pattern match for coffee keywords
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMeters - Search radius in meters
 * @param {object} opts - { signal, timeout }
 * @returns {object[]} Array of shop objects
 */
export async function queryOverpass(lat, lng, radiusMeters, opts = {}) {
  const timeout = opts.timeout || 30000;

  // Phase 1: Standard cafe/coffee query
  const q1 = `[out:json][timeout:25];(` +
    `node["amenity"="cafe"](around:${radiusMeters},${lat},${lng});` +
    `way["amenity"="cafe"](around:${radiusMeters},${lat},${lng});` +
    `node["cuisine"~"coffee"](around:${radiusMeters},${lat},${lng});` +
    `node["shop"="coffee"](around:${radiusMeters},${lat},${lng});` +
    `);out center tags;`;

  let allElements = [];
  const d1 = await fetchOverpass(q1, timeout);
  if (d1?.elements) allElements = [...d1.elements];

  // Phase 2: Expand if few named results
  const namedCount = allElements.filter(e => e.tags?.name).length;
  if (namedCount < 20) {
    const q2 = `[out:json][timeout:25];(` +
      `node["name"~"Coffee|coffee|Cafe|cafe|Espresso|espresso|Roast|roast|Bean|bean|Brew|brew|Latte|latte"](around:${radiusMeters},${lat},${lng});` +
      `way["name"~"Coffee|coffee|Cafe|cafe|Espresso|espresso|Roast|roast"](around:${radiusMeters},${lat},${lng});` +
      `);out center tags;`;
    try {
      const d2 = await fetchOverpass(q2, 15000);
      if (d2?.elements) allElements = allElements.concat(d2.elements);
    } catch (e) {
      console.warn('Phase 2 expansion failed:', e.message);
    }
  }

  // Deduplicate + filter chains + extract shop data
  const seen = new Set();
  return allElements
    .filter(el => {
      if (!el.tags?.name || seen.has(el.id)) return false;
      seen.add(el.id);
      return true;
    })
    .filter(el => {
      const n = el.tags.name.toLowerCase();
      return !CHAINS.some(c => n.includes(c));
    })
    .map(el => parseShopFromElement(el))
    .filter(Boolean);
}

/**
 * Try each Overpass endpoint with failover.
 */
async function fetchOverpass(query, timeout) {
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        console.warn(`Overpass ${url} returned ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data.elements) return data;
    } catch (e) {
      console.warn(`Overpass ${url} failed:`, e.message);
    }
  }
  return null;
}

/**
 * Extract shop data from an OSM element.
 */
function parseShopFromElement(el) {
  const lat = el.lat || el.center?.lat;
  const lng = el.lon || el.center?.lon;
  if (!lat || !lng) return null;

  const tags = el.tags;
  const parts = [];
  if (tags['addr:housenumber'] && tags['addr:street']) {
    parts.push(tags['addr:housenumber'] + ' ' + tags['addr:street']);
  } else if (tags['addr:street']) {
    parts.push(tags['addr:street']);
  }
  if (tags['addr:city']) parts.push(tags['addr:city']);
  if (tags['addr:state']) parts.push(tags['addr:state']);

  return {
    id: el.id,
    name: tags.name,
    lat,
    lng,
    address: parts.join(', '),
    hours: tags.opening_hours || null,
    website: tags.website || tags['contact:website'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
  };
}

export { CHAINS, sleep };
